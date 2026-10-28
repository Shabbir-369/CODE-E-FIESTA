import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { config } from './config.js';
import { getPool, query } from './db/pool.js';
import { randomId, sha256, verifyPassword, can, decideAction } from './security.js';
import { audit, activity } from './audit.js';
import { executeWorkflow } from './services/workflows.js';
import { planLeadWorkflow } from './services/planner.js';
import { normalizeWhatsAppPhone, classifyCustomerMessage, createCustomerReply } from './services/whatsapp.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');
const COOKIE_NAME = 'aw_session';
const MIME = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml', '.ico':'image/x-icon' };
const loginAttempts = new Map();

function json(res, status, value, extraHeaders = {}) {
  const body = JSON.stringify(value);
  res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'Content-Length':Buffer.byteLength(body), ...extraHeaders });
  res.end(body);
}
function getCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0,i).trim()] = decodeURIComponent(part.slice(i+1).trim());
  }
  return out;
}
function setSessionCookie(res, token, maxAgeSeconds) {
  const secure = config.nodeEnv === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure}`);
}
function clearSessionCookie(res) {
  const secure = config.nodeEnv === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`);
}
async function readJson(req, limit = 1_000_000) {
  const type = String(req.headers['content-type'] || '');
  if (!type.toLowerCase().includes('application/json')) throw Object.assign(new Error('Content-Type must be application/json.'), { status:415 });
  let size = 0; const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('Request body is too large.'), { status:413 });
    chunks.push(chunk);
  }
  if (!size) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('Invalid JSON request body.'), { status:400 }); }
}
function text(value, max = 500, required = false) {
  if (typeof value !== 'string') {
    if (required) throw Object.assign(new Error('A required text field is missing.'), { status:400 });
    return '';
  }
  const cleaned = value.trim();
  if (required && !cleaned) throw Object.assign(new Error('A required text field is empty.'), { status:400 });
  if (cleaned.length > max) throw Object.assign(new Error(`Text fields must be ${max} characters or fewer.`), { status:400 });
  return cleaned;
}
function getQuery(url, key, fallback = '') { return url.searchParams.get(key) || fallback; }
async function getUser(req) {
  const token = getCookies(req)[COOKIE_NAME];
  if (!token || token.length < 32 || token.length > 256) return null;
  const result = await query(
    `SELECT u.id,u.tenant_id,u.name,u.email,u.role,u.active,s.id AS session_id
     FROM sessions s JOIN users u ON u.id=s.user_id
     WHERE s.token_hash=$1 AND s.expires_at>NOW() AND u.active=TRUE LIMIT 1`, [sha256(token)]
  );
  return result.rows[0] || null;
}
function requirePermission(user, permission) {
  if (!user) throw Object.assign(new Error('Authentication required.'), { status:401 });
  if (!can(user.role, permission)) throw Object.assign(new Error('Your role does not have permission to perform this action.'), { status:403 });
}
function requireBridgeAuth(req) {
  if (!config.whatsappBridgeToken || config.whatsappBridgeToken.length < 32) {
    throw Object.assign(new Error('WhatsApp bridge is not configured. Set WHATSAPP_BRIDGE_TOKEN (at least 32 characters) in .env.'), { status:503 });
  }
  const auth = String(req.headers.authorization || '');
  const bearer = /^Bearer\s+(.+)$/i.exec(auth)?.[1] || String(req.headers['x-whatsapp-bridge-token'] || '');
  const expected = Buffer.from(config.whatsappBridgeToken);
  const supplied = Buffer.from(bearer);
  if (!supplied.length || expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) {
    throw Object.assign(new Error('WhatsApp bridge token is invalid.'), { status:401 });
  }
}
function requireCsrf(req) {
  if (!['POST','PATCH','PUT','DELETE'].includes(req.method)) return;
  // SameSite=Strict cookie + this non-simple header blocks cross-site form submissions.
  if (req.headers['x-requested-with'] !== 'AIWorkforce') throw Object.assign(new Error('Missing request integrity header.'), { status:403 });
  const origin = req.headers.origin;
  if (origin) {
    let originHost = '';
    try { originHost = new URL(origin).host; } catch {}
    if (!originHost || originHost !== req.headers.host) throw Object.assign(new Error('Cross-origin request rejected.'), { status:403 });
  }
}
async function createActivityAndAudit(user, action, title, description, resourceType, resourceId, decision = 'completed', metadata = {}) {
  await activity({ tenantId:user.tenant_id, actor:user.name, eventType:action, title, description, metadata });
  await audit({ tenantId:user.tenant_id, userId:user.id, actorLabel:user.name, action, resourceType, resourceId, decision, reason:description, metadata });
}

async function dashboard(user) {
  const t = user.tenant_id;
  const [kpis, pipeline, sources, activityRows, runs, agentRows, approvals] = await Promise.all([
    query(`SELECT COUNT(*)::int AS total_leads,
      COUNT(*) FILTER (WHERE status='new')::int AS new_leads,
      COUNT(*) FILTER (WHERE status='qualified')::int AS qualified_leads,
      COUNT(*) FILTER (WHERE status='contacted')::int AS contacted_leads,
      COUNT(*) FILTER (WHERE status='converted')::int AS converted_leads,
      COALESCE(SUM(estimated_value) FILTER (WHERE status IN ('new','qualified','contacted')),0)::numeric AS pipeline_value,
      COUNT(*) FILTER (WHERE score>=75 AND status IN ('new','qualified'))::int AS hot_leads
      FROM leads WHERE tenant_id=$1`, [t]),
    query(`SELECT status,COUNT(*)::int AS count,COALESCE(SUM(estimated_value),0)::numeric AS value FROM leads WHERE tenant_id=$1 GROUP BY status`, [t]),
    query(`SELECT source,COUNT(*)::int AS count,COALESCE(AVG(score),0)::int AS avg_score FROM leads WHERE tenant_id=$1 GROUP BY source ORDER BY count DESC`, [t]),
    query(`SELECT a.id,a.actor,a.event_type,a.title,a.description,a.created_at,a.lead_id,l.company FROM activities a LEFT JOIN leads l ON l.id=a.lead_id WHERE a.tenant_id=$1 ORDER BY a.created_at DESC LIMIT 8`, [t]),
    query(`SELECT id,request_text,status,summary,ai_provider,leads_processed,drafts_created,updates_applied,approvals_created,created_at,finished_at FROM workflow_runs WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 5`, [t]),
    query(`SELECT agent_name,COUNT(*) FILTER (WHERE status='completed')::int AS completed,COUNT(*) FILTER (WHERE status='failed')::int AS failed,COUNT(*) FILTER (WHERE status IN ('running','queued'))::int AS active FROM workflow_tasks WHERE tenant_id=$1 AND created_at>NOW()-INTERVAL '7 days' GROUP BY agent_name ORDER BY agent_name`, [t]),
    query(`SELECT COUNT(*)::int AS pending FROM approvals WHERE tenant_id=$1 AND status='pending'`, [t]),
  ]);
  const totals = kpis.rows[0];
  const timeSaved = (await query(`SELECT COALESCE(SUM(leads_processed*4 + drafts_created*3),0)::int AS minutes FROM workflow_runs WHERE tenant_id=$1 AND status IN ('completed','completed_with_approval')`, [t])).rows[0].minutes;
  return { kpis: { ...totals, pipeline_value: Number(totals.pipeline_value), time_saved_minutes: timeSaved, pending_approvals: approvals.rows[0].pending }, pipeline: pipeline.rows.map(r=>({ ...r, value:Number(r.value) })), sources:sources.rows, activity:activityRows.rows, runs:runs.rows, agents:agentRows.rows, businessName:config.businessName, geminiConfigured:Boolean(config.geminiApiKey) };
}

async function handleApi(req, res, url) {
  const pathname = url.pathname;
  if (pathname === '/api/health' && req.method === 'GET') {
    let database = false; let dbMessage = 'DATABASE_URL not configured';
    try { await query('SELECT 1'); database = true; dbMessage = 'connected'; } catch (e) { dbMessage = e.message; }
    return json(res, 200, { ok:database, database, databaseMessage:dbMessage, aiProvider:config.geminiApiKey ? 'Gemini' : 'Rules fallback', geminiConfigured:Boolean(config.geminiApiKey), whatsappConfigured:Boolean(config.whatsappBridgeToken && config.whatsappBridgeToken.length>=32) });
  }

  // Machine-to-machine routes are authenticated by a separate bridge token, not a browser session.
  if (pathname === '/api/integrations/whatsapp/inbound' && req.method === 'POST') {
    requireBridgeAuth(req);
    const body = await readJson(req, 12_000);
    const phone = normalizeWhatsAppPhone(body.from || body.phone || body.sender);
    const message = text(body.text ?? body.message, 1800, true);
    const providerMessageId = text(body.messageId || body.message_id || body.id || '', 220);
    const contactName = text(body.name || body.pushName || body.contactName || '', 120);
    const tenantResult = await query('SELECT id,name FROM tenants WHERE id=$1 LIMIT 1', [config.whatsappTenantId]);
    if (!tenantResult.rowCount) throw Object.assign(new Error('WhatsApp tenant was not found. Check WHATSAPP_TENANT_ID and run npm run setup.'), { status:503 });
    const tenantId = tenantResult.rows[0].id;
    const digits = phone.replace(/\D/g, '');
    const duplicate = providerMessageId ? await query('SELECT id FROM whatsapp_messages WHERE tenant_id=$1 AND provider_message_id=$2 LIMIT 1',[tenantId,providerMessageId]) : { rowCount:0 };
    if (duplicate.rowCount) return json(res,200,{ok:true,duplicate:true,reply:null,message:'Duplicate provider message ignored.'});

    let leadResult = await query(`SELECT id,first_name,last_name,company,industry,status,score,phone,source FROM leads
      WHERE tenant_id=$1 AND phone IS NOT NULL AND right(regexp_replace(phone,'[^0-9]','','g'),10)=right($2,10)
      ORDER BY updated_at DESC LIMIT 1`,[tenantId,digits]);
    let lead = leadResult.rows[0];
    const leadCreated = !lead;
    if (!lead) {
      const names = contactName.split(/\s+/).filter(Boolean);
      const firstName = (names.shift() || 'WhatsApp').slice(0,80);
      const lastName = names.join(' ').slice(0,80);
      const owner = await query(`SELECT id FROM users WHERE tenant_id=$1 AND active=TRUE ORDER BY CASE WHEN role='admin' THEN 0 ELSE 1 END,created_at LIMIT 1`,[tenantId]);
      const leadId = randomId();
      const inserted = await query(`INSERT INTO leads(id,tenant_id,first_name,last_name,company,email,phone,source,status,score,estimated_value,notes,owner_id,last_activity_at)
        VALUES($1,$2,$3,$4,'WhatsApp inquiry',NULL,$5,'WhatsApp','new',35,0,'Created from an inbound WhatsApp enquiry.',$6,NOW())
        RETURNING id,first_name,last_name,company,industry,status,score,phone,source`,[leadId,tenantId,firstName,lastName,phone,owner.rows[0]?.id||null]);
      lead=inserted.rows[0];
    } else {
      await query(`UPDATE leads SET last_activity_at=NOW(),updated_at=NOW(),phone=COALESCE(phone,$1) WHERE id=$2 AND tenant_id=$3`,[phone,lead.id,tenantId]);
    }

    const conversationResult = await query(`INSERT INTO whatsapp_conversations(id,tenant_id,lead_id,phone_e164,contact_name,last_message_preview,last_message_at)
      VALUES($1,$2,$3,$4,$5,$6,NOW())
      ON CONFLICT(tenant_id,phone_e164) DO UPDATE SET lead_id=COALESCE(EXCLUDED.lead_id,whatsapp_conversations.lead_id),
        contact_name=CASE WHEN EXCLUDED.contact_name<>'' THEN EXCLUDED.contact_name ELSE whatsapp_conversations.contact_name END,
        last_message_preview=EXCLUDED.last_message_preview,last_message_at=NOW(),updated_at=NOW()
      RETURNING *`,[randomId(),tenantId,lead.id,phone,contactName,message.slice(0,240)]);
    const conversation = conversationResult.rows[0];
    const inboundId = randomId();
    const inboundInsert = await query(`INSERT INTO whatsapp_messages(id,tenant_id,conversation_id,lead_id,direction,body,source,status,intent,provider_message_id,metadata)
      VALUES($1,$2,$3,$4,'inbound',$5,'whatsapp','received',$6,$7,$8::jsonb)
      ON CONFLICT(tenant_id,provider_message_id) WHERE provider_message_id IS NOT NULL DO NOTHING RETURNING id`,
      [inboundId,tenantId,conversation.id,lead.id,message,classifyCustomerMessage(message),providerMessageId||null,JSON.stringify({lead_created:leadCreated})]);
    if (!inboundInsert.rowCount) return json(res,200,{ok:true,duplicate:true,reply:null,message:'Duplicate provider message ignored.'});

    const intent = classifyCustomerMessage(message);
    let leadUpdated = false;
    if (intent==='sales_interest' && lead.status==='new') {
      const updated = await query(`UPDATE leads SET status='qualified',score=GREATEST(score,60),updated_at=NOW(),last_activity_at=NOW()
        WHERE id=$1 AND tenant_id=$2 AND status='new' RETURNING id,status,score`,[lead.id,tenantId]);
      if(updated.rowCount){lead={...lead,...updated.rows[0]};leadUpdated=true;}
    }
    const botEnabled = conversation.bot_enabled;
    if (!botEnabled && intent!=='opt_out') {
      await query(`UPDATE whatsapp_conversations SET human_handoff=TRUE,last_message_preview=$1,last_message_at=NOW(),updated_at=NOW() WHERE id=$2 AND tenant_id=$3`,[message.slice(0,240),conversation.id,tenantId]);
      await activity({tenantId,leadId:lead.id,actor:'WhatsApp bridge',eventType:'whatsapp.message_received',title:`WhatsApp message from ${contactName||phone}`,description:'Inbound message saved; automated replies are disabled for this conversation.',metadata:{intent,bot_disabled:true}});
      return json(res,200,{ok:true,reply:null,reason:'bot_disabled',conversationId:conversation.id,leadId:lead.id});
    }
    const response = await createCustomerReply({message,businessName:tenantResult.rows[0].name||config.businessName,lead,knowledgeBase:config.whatsappKnowledgeBase});
    await query(`UPDATE whatsapp_conversations SET human_handoff=CASE WHEN $1 THEN TRUE ELSE human_handoff END,bot_enabled=CASE WHEN $2 THEN FALSE ELSE bot_enabled END,updated_at=NOW() WHERE id=$3 AND tenant_id=$4`,[Boolean(response.humanHandoff),Boolean(response.disableBot),conversation.id,tenantId]);
    const replyId=randomId();
    await query(`INSERT INTO whatsapp_messages(id,tenant_id,conversation_id,lead_id,direction,body,source,status,intent,metadata)
      VALUES($1,$2,$3,$4,'outbound',$5,'ai_workforce','reply_ready',$6,$7::jsonb)`,[replyId,tenantId,conversation.id,lead.id,response.reply,response.intent,JSON.stringify({reply_to:inboundInsert.rows[0].id,provider:response.provider,human_handoff:Boolean(response.humanHandoff)})]);
    await query(`UPDATE whatsapp_conversations SET last_message_preview=$1,last_message_at=NOW(),updated_at=NOW() WHERE id=$2 AND tenant_id=$3`,[response.reply.slice(0,240),conversation.id,tenantId]);
    await activity({tenantId,leadId:lead.id,actor:'WhatsApp AI agent',eventType:'whatsapp.reply_prepared',title:`Reply prepared for ${contactName||phone}`,description:leadUpdated?'Lead qualified from customer purchase/demo intent.':'Customer query processed by the WhatsApp support agent.',metadata:{intent:response.intent,provider:response.provider,human_handoff:Boolean(response.humanHandoff),lead_created:leadCreated}});
    await audit({tenantId,actorLabel:'WhatsApp bridge',action:'whatsapp.inbound.process',resourceType:'whatsapp_conversation',resourceId:conversation.id,decision:'completed',reason:leadUpdated?'Inbound intent logged and lead qualified by allowlisted policy.':'Inbound message stored and safe reply prepared.',metadata:{intent:response.intent,provider:response.provider,lead_created:leadCreated,lead_updated:leadUpdated,human_handoff:Boolean(response.humanHandoff)}});
    return json(res,200,{ok:true,reply:response.reply,replyMessageId:replyId,conversationId:conversation.id,leadId:lead.id,intent:response.intent,leadCreated,leadUpdated,humanHandoff:Boolean(response.humanHandoff),provider:response.provider});
  }
  if (pathname === '/api/integrations/whatsapp/outbound/pending' && req.method === 'GET') {
    requireBridgeAuth(req);
    const tenantResult=await query('SELECT id FROM tenants WHERE id=$1 LIMIT 1',[config.whatsappTenantId]);
    if(!tenantResult.rowCount) throw Object.assign(new Error('WhatsApp tenant was not found.'),{status:503});
    const limit=Math.max(1,Math.min(30,Number(getQuery(url,'limit','10'))||10));
    const client=await getPool().connect(); let messages=[];
    try {
      await client.query('BEGIN');
      await client.query(`UPDATE whatsapp_messages SET status='failed',last_error='Delivery retry limit reached after a stale claim.',claimed_at=NULL WHERE tenant_id=$1 AND direction='outbound' AND status='dispatching' AND claimed_at<NOW()-INTERVAL '2 minutes' AND attempts>=5`,[tenantResult.rows[0].id]);
      const picked=await client.query(`SELECT m.id,m.conversation_id,m.body,c.phone_e164,c.contact_name,m.attempts FROM whatsapp_messages m
        JOIN whatsapp_conversations c ON c.id=m.conversation_id AND c.tenant_id=m.tenant_id
        WHERE m.tenant_id=$1 AND m.direction='outbound' AND (m.status='queued' OR (m.status='dispatching' AND m.claimed_at<NOW()-INTERVAL '2 minutes')) AND m.attempts<5
        ORDER BY m.created_at LIMIT $2 FOR UPDATE OF m SKIP LOCKED`,[tenantResult.rows[0].id,limit]);
      for(const row of picked.rows){
        await client.query(`UPDATE whatsapp_messages SET status='dispatching',attempts=attempts+1,claimed_at=NOW(),last_error=NULL WHERE id=$1 AND tenant_id=$2`,[row.id,tenantResult.rows[0].id]);
      }
      messages=picked.rows.map(row=>({...row,attempts:Number(row.attempts)+1}));
      await client.query('COMMIT');
    } catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;} finally {client.release();}
    return json(res,200,{messages});
  }
  const bridgeStatusMatch=pathname.match(/^\/api\/integrations\/whatsapp\/messages\/([\da-f-]+)\/status$/i);
  if (bridgeStatusMatch && req.method === 'POST') {
    requireBridgeAuth(req);
    const body=await readJson(req,4000); const status=body.status;
    if(!['sent','failed'].includes(status)) throw Object.assign(new Error('Status must be sent or failed.'),{status:400});
    const tenantId=config.whatsappTenantId;
    const result=await query(`UPDATE whatsapp_messages SET status=$1,provider_message_id=COALESCE($2,provider_message_id),last_error=$3,claimed_at=NULL,
      metadata=metadata || $4::jsonb WHERE id=$5 AND tenant_id=$6 AND direction='outbound' AND status IN ('dispatching','reply_ready','queued')
      RETURNING id,conversation_id,lead_id,status`,[status,text(body.providerMessageId||'',220)||null,status==='failed'?text(body.error||'WhatsApp send failed.',400):null,JSON.stringify({provider_acknowledged_at:new Date().toISOString()}),bridgeStatusMatch[1],tenantId]);
    if(!result.rowCount) return json(res,404,{error:'Outbound message not found or already finalized.'});
    await activity({tenantId,leadId:result.rows[0].lead_id,actor:'WhatsApp bridge',eventType:`whatsapp.${status}`,title:status==='sent'?'WhatsApp message delivered':'WhatsApp message delivery failed',description:status==='sent'?'Chintu acknowledged successful delivery.':text(body.error||'WhatsApp send failed.',400),metadata:{message_id:result.rows[0].id}});
    return json(res,200,{ok:true,status});
  }
  requireCsrf(req);

  if (pathname === '/api/auth/login' && req.method === 'POST') {
    const ip = req.socket.remoteAddress || 'unknown';
    const now = Date.now(); const attempt = loginAttempts.get(ip) || { count:0, started:now };
    if (now - attempt.started > 15*60*1000) { attempt.count=0; attempt.started=now; }
    if (attempt.count >= 10) return json(res, 429, { error:'Too many sign-in attempts. Wait 15 minutes and try again.' });
    const body = await readJson(req);
    const email = text(body.email, 254, true).toLowerCase();
    const password = typeof body.password === 'string' ? body.password : '';
    if (!password || password.length > 200) throw Object.assign(new Error('Enter a valid password.'), { status:400 });
    const result = await query(`SELECT id,tenant_id,name,email,password_hash,role,active FROM users WHERE email=$1 LIMIT 1`, [email]);
    const user = result.rows[0];
    if (!user || !user.active || !(await verifyPassword(password, user.password_hash))) {
      attempt.count++; loginAttempts.set(ip, attempt);
      return json(res, 401, { error:'Email or password is incorrect.' });
    }
    loginAttempts.delete(ip);
    const token = crypto.randomBytes(32).toString('base64url');
    const sessionId = randomId();
    const expiryHours = config.sessionTtlHours;
    await query('DELETE FROM sessions WHERE expires_at<NOW()');
    await query(`INSERT INTO sessions(id,user_id,token_hash,expires_at) VALUES($1,$2,$3,NOW()+($4::text || ' hours')::interval)`, [sessionId,user.id,sha256(token),String(expiryHours)]);
    await query('UPDATE users SET last_login_at=NOW() WHERE id=$1', [user.id]);
    setSessionCookie(res, token, expiryHours*3600);
    await audit({ tenantId:user.tenant_id,userId:user.id,actorLabel:user.name,action:'auth.login',resourceType:'session',resourceId:sessionId,decision:'completed',reason:'Successful sign-in.' });
    return json(res, 200, { user:{ id:user.id,name:user.name,email:user.email,role:user.role } });
  }
  if (pathname === '/api/auth/logout' && req.method === 'POST') {
    const token = getCookies(req)[COOKIE_NAME];
    if (token) {
      const user = await getUser(req);
      await query('DELETE FROM sessions WHERE token_hash=$1', [sha256(token)]);
      if (user) await audit({ tenantId:user.tenant_id,userId:user.id,actorLabel:user.name,action:'auth.logout',resourceType:'session',resourceId:user.session_id,decision:'completed',reason:'User signed out.' });
    }
    clearSessionCookie(res);
    return json(res, 200, { ok:true });
  }
  if (pathname === '/api/auth/me' && req.method === 'GET') {
    const user = await getUser(req);
    if (!user) return json(res, 401, { error:'Authentication required.' });
    return json(res, 200, { user:{ id:user.id,name:user.name,email:user.email,role:user.role } });
  }

  const user = await getUser(req);
  if (!user) return json(res, 401, { error:'Your session has expired. Sign in again.' });

  if (pathname === '/api/whatsapp/status' && req.method === 'GET') {
    requirePermission(user,'activity:read');
    const metrics=await query(`SELECT COUNT(DISTINCT c.id)::int AS conversations,
      COUNT(m.id) FILTER(WHERE m.direction='inbound')::int AS inbound_messages,
      COUNT(m.id) FILTER(WHERE m.direction='outbound')::int AS outbound_messages,
      COUNT(DISTINCT c.id) FILTER(WHERE c.human_handoff=TRUE)::int AS needing_human,
      COUNT(m.id) FILTER(WHERE m.direction='outbound' AND m.status IN ('queued','dispatching','reply_ready'))::int AS pending_delivery,
      MAX(m.created_at) AS last_message_at
      FROM whatsapp_conversations c LEFT JOIN whatsapp_messages m ON m.conversation_id=c.id AND m.tenant_id=c.tenant_id WHERE c.tenant_id=$1`,[user.tenant_id]);
    return json(res,200,{configured:Boolean(config.whatsappBridgeToken && config.whatsappBridgeToken.length>=32),baseUrlConfigured:Boolean(config.publicBaseUrl),webhookPath:'/api/integrations/whatsapp/inbound',outboxPath:'/api/integrations/whatsapp/outbound/pending',metrics:metrics.rows[0]});
  }
  if (pathname === '/api/whatsapp/conversations' && req.method === 'GET') {
    requirePermission(user,'activity:read');
    const search=getQuery(url,'search').trim().slice(0,100);
    const rows=await query(`SELECT c.id,c.lead_id,c.phone_e164,c.contact_name,c.last_message_preview,c.last_message_at,c.human_handoff,c.bot_enabled,c.created_at,
      l.first_name,l.last_name,l.company,l.email,l.status AS lead_status,l.score,
      (SELECT COUNT(*)::int FROM whatsapp_messages m WHERE m.conversation_id=c.id AND m.tenant_id=c.tenant_id AND m.direction='inbound') AS inbound_count,
      (SELECT COUNT(*)::int FROM whatsapp_messages m WHERE m.conversation_id=c.id AND m.tenant_id=c.tenant_id AND m.status IN ('queued','dispatching','reply_ready') AND m.direction='outbound') AS pending_count
      FROM whatsapp_conversations c LEFT JOIN leads l ON l.id=c.lead_id
      WHERE c.tenant_id=$1 AND ($2='' OR c.phone_e164 ILIKE '%'||$2||'%' OR c.contact_name ILIKE '%'||$2||'%' OR l.company ILIKE '%'||$2||'%' OR l.first_name ILIKE '%'||$2||'%')
      ORDER BY c.last_message_at DESC LIMIT 150`,[user.tenant_id,search]);
    return json(res,200,{conversations:rows.rows});
  }
  const whatsappMessagesMatch=pathname.match(/^\/api\/whatsapp\/conversations\/([\da-f-]+)\/messages$/i);
  if (whatsappMessagesMatch && req.method==='GET') {
    requirePermission(user,'activity:read');
    const conversation=await query('SELECT id FROM whatsapp_conversations WHERE id=$1 AND tenant_id=$2',[whatsappMessagesMatch[1],user.tenant_id]);
    if(!conversation.rowCount) return json(res,404,{error:'WhatsApp conversation not found.'});
    const messages=await query(`SELECT id,direction,body,source,status,intent,provider_message_id,last_error,created_at,metadata FROM whatsapp_messages
      WHERE conversation_id=$1 AND tenant_id=$2 ORDER BY created_at ASC LIMIT 500`,[whatsappMessagesMatch[1],user.tenant_id]);
    return json(res,200,{messages:messages.rows});
  }
  const whatsappReplyMatch=pathname.match(/^\/api\/whatsapp\/conversations\/([\da-f-]+)\/reply$/i);
  if(whatsappReplyMatch && req.method==='POST'){
    requirePermission(user,'leads:update');
    const b=await readJson(req); const body=text(b.body,1800,true);
    const conversation=await query('SELECT id,lead_id FROM whatsapp_conversations WHERE id=$1 AND tenant_id=$2',[whatsappReplyMatch[1],user.tenant_id]);
    if(!conversation.rowCount) return json(res,404,{error:'WhatsApp conversation not found.'});
    const id=randomId();
    await query(`INSERT INTO whatsapp_messages(id,tenant_id,conversation_id,lead_id,direction,body,source,status,intent,created_by_user_id,metadata)
      VALUES($1,$2,$3,$4,'outbound',$5,'dashboard','queued','human_reply',$6,'{}'::jsonb)`,[id,user.tenant_id,conversation.rows[0].id,conversation.rows[0].lead_id,body,user.id]);
    await query(`UPDATE whatsapp_conversations SET last_message_preview=$1,last_message_at=NOW(),updated_at=NOW(),human_handoff=FALSE WHERE id=$2 AND tenant_id=$3`,[body.slice(0,240),conversation.rows[0].id,user.tenant_id]);
    await activity({tenantId:user.tenant_id,leadId:conversation.rows[0].lead_id,actor:user.name,eventType:'whatsapp.reply_queued',title:'Human WhatsApp reply queued',description:'An authorized user queued a message for delivery by the linked Chintu bridge.',metadata:{message_id:id}});
    await audit({tenantId:user.tenant_id,userId:user.id,actorLabel:user.name,action:'whatsapp.reply.queue',resourceType:'whatsapp_message',resourceId:id,decision:'completed',reason:'Authenticated user queued a customer reply for the WhatsApp bridge.',metadata:{conversation_id:conversation.rows[0].id}});
    return json(res,202,{ok:true,id,status:'queued',message:'Reply queued. Chintu must poll the outbound queue to deliver it.'});
  }
  const whatsappConversationMatch=pathname.match(/^\/api\/whatsapp\/conversations\/([\da-f-]+)$/i);
  if(whatsappConversationMatch && req.method==='PATCH'){
    requirePermission(user,'leads:update');
    const b=await readJson(req); const sets=[]; const values=[]; let i=1;
    if(Object.hasOwn(b,'human_handoff')){if(typeof b.human_handoff!=='boolean')throw Object.assign(new Error('human_handoff must be boolean.'),{status:400});sets.push(`human_handoff=$${i++}`);values.push(b.human_handoff);}
    if(Object.hasOwn(b,'bot_enabled')){if(typeof b.bot_enabled!=='boolean')throw Object.assign(new Error('bot_enabled must be boolean.'),{status:400});sets.push(`bot_enabled=$${i++}`);values.push(b.bot_enabled);}
    if(!sets.length)throw Object.assign(new Error('No supported conversation fields supplied.'),{status:400});
    sets.push('updated_at=NOW()'); values.push(whatsappConversationMatch[1],user.tenant_id);
    const updated=await query(`UPDATE whatsapp_conversations SET ${sets.join(',')} WHERE id=$${i++} AND tenant_id=$${i} RETURNING id,human_handoff,bot_enabled`,values);
    if(!updated.rowCount)return json(res,404,{error:'WhatsApp conversation not found.'});
    await audit({tenantId:user.tenant_id,userId:user.id,actorLabel:user.name,action:'whatsapp.conversation.update',resourceType:'whatsapp_conversation',resourceId:updated.rows[0].id,decision:'completed',reason:'Conversation routing preferences updated.',metadata:{fields:Object.keys(b)}});
    return json(res,200,{conversation:updated.rows[0]});
  }
  const whatsappRetryMatch=pathname.match(/^\/api\/whatsapp\/messages\/([\da-f-]+)\/retry$/i);
  if(whatsappRetryMatch && req.method==='POST'){
    requirePermission(user,'leads:update');
    const updated=await query(`UPDATE whatsapp_messages SET status='queued',last_error=NULL,claimed_at=NULL WHERE id=$1 AND tenant_id=$2 AND direction='outbound' AND status IN ('failed','reply_ready') AND attempts<5 RETURNING id,conversation_id,lead_id`,[whatsappRetryMatch[1],user.tenant_id]);
    if(!updated.rowCount)return json(res,409,{error:'Message cannot be retried (not found, already queued/sent, or retry limit reached).'});
    await audit({tenantId:user.tenant_id,userId:user.id,actorLabel:user.name,action:'whatsapp.message.retry',resourceType:'whatsapp_message',resourceId:updated.rows[0].id,decision:'completed',reason:'Authorized user queued an outbound WhatsApp retry.'});
    return json(res,202,{ok:true,status:'queued'});
  }

  if (pathname === '/api/dashboard' && req.method === 'GET') {
    requirePermission(user,'dashboard:read'); return json(res,200,await dashboard(user));
  }
  if (pathname === '/api/leads' && req.method === 'GET') {
    requirePermission(user,'leads:read');
    const search = getQuery(url,'search').trim().slice(0,100);
    const status = getQuery(url,'status','all');
    const allowed = ['all','new','qualified','contacted','converted','lost'];
    if (!allowed.includes(status)) throw Object.assign(new Error('Invalid lead status filter.'), {status:400});
    const rows = await query(
      `SELECT id,first_name,last_name,company,email,phone,title,industry,source,status,score,estimated_value,notes,owner_id,last_activity_at,created_at,updated_at
       FROM leads WHERE tenant_id=$1 AND ($2='all' OR status=$2)
       AND ($3='' OR first_name ILIKE '%'||$3||'%' OR last_name ILIKE '%'||$3||'%' OR company ILIKE '%'||$3||'%' OR email ILIKE '%'||$3||'%')
       ORDER BY score DESC,updated_at DESC LIMIT 300`, [user.tenant_id,status,search]);
    return json(res,200,{ leads:rows.rows.map(r=>({...r,estimated_value:Number(r.estimated_value)})) });
  }
  if (pathname === '/api/leads' && req.method === 'POST') {
    requirePermission(user,'leads:create');
    const b = await readJson(req);
    const firstName = text(b.first_name,80,true), lastName=text(b.last_name||'',80), company=text(b.company,160,true), email=text(b.email,254,true).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Object.assign(new Error('Enter a valid email address.'),{status:400});
    const phone=text(b.phone||'',40), title=text(b.title||'',120), industry=text(b.industry||'',100), source=text(b.source||'Manual',60), notes=text(b.notes||'',1200);
    const duplicate = await query('SELECT id FROM leads WHERE tenant_id=$1 AND email=$2', [user.tenant_id,email]);
    if (duplicate.rowCount) throw Object.assign(new Error('A lead with this email already exists.'),{status:409});
    const id=randomId();
    await query(`INSERT INTO leads(id,tenant_id,first_name,last_name,company,email,phone,title,industry,source,status,score,estimated_value,notes,owner_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'new',30,$11,$12,$13)`,[id,user.tenant_id,firstName,lastName,company,email,phone||null,title||null,industry||null,source,Math.max(0,Math.min(100000000,Number(b.estimated_value)||0)),notes,user.id]);
    await createActivityAndAudit(user,'lead.created',`New lead added: ${company}`,`Lead created by ${user.name}.`,'lead',id,'completed',{source});
    return json(res,201,{id,message:'Lead created.'});
  }
  const leadMatch = pathname.match(/^\/api\/leads\/([\da-f-]+)$/i);
  if (leadMatch && req.method === 'PATCH') {
    requirePermission(user,'leads:update');
    const b=await readJson(req); const leadId=leadMatch[1];
    const fields=[]; const values=[]; let idx=1;
    if (Object.hasOwn(b,'status')) {
      if (!['new','qualified','contacted','converted','lost'].includes(b.status)) throw Object.assign(new Error('Invalid lead status.'),{status:400});
      fields.push(`status=$${idx++}`); values.push(b.status);
    }
    if (Object.hasOwn(b,'notes')) { fields.push(`notes=$${idx++}`); values.push(text(b.notes,1200)); }
    if (!fields.length) throw Object.assign(new Error('No supported fields to update.'),{status:400});
    const policy=decideAction({role:user.role,action:'lead.update'});
    if (policy.decision!=='allowed') {
      await audit({tenantId:user.tenant_id,userId:user.id,actorLabel:user.name,action:'lead.update',resourceType:'lead',resourceId:leadId,decision:'denied',reason:policy.reason});
      return json(res,403,{error:policy.reason});
    }
    fields.push('updated_at=NOW()'); fields.push('last_activity_at=NOW()');
    values.push(leadId,user.tenant_id);
    const result=await query(`UPDATE leads SET ${fields.join(',')} WHERE id=$${idx++} AND tenant_id=$${idx} RETURNING id,company,status,score,notes`,values);
    if (!result.rowCount) return json(res,404,{error:'Lead not found.'});
    await createActivityAndAudit(user,'lead.updated',`Lead updated: ${result.rows[0].company}`,`Lead fields updated: ${Object.keys(b).join(', ')}.`,'lead',leadId,'completed',{fields:Object.keys(b)});
    return json(res,200,{lead:result.rows[0]});
  }
  if (pathname === '/api/workflows/run' && req.method === 'POST') {
    requirePermission(user,'workflow:run');
    const b=await readJson(req); const requestText=text(b.request,800,true);
    if (requestText.length<8) throw Object.assign(new Error('Please provide a little more detail for the workflow.'),{status:400});
    const plan=planLeadWorkflow(requestText);
    if (!plan.supported) {
      await audit({tenantId:user.tenant_id,userId:user.id,actorLabel:user.name,action:'workflow.request',resourceType:'workflow_plan',decision:'denied',reason:plan.reason,metadata:{request_length:requestText.length}}).catch(()=>{});
      return json(res,400,{error:plan.reason});
    }
    const id=randomId();
    await query(`INSERT INTO workflow_runs(id,tenant_id,requested_by,request_text,status,plan_data) VALUES($1,$2,$3,$4,'queued',$5::jsonb)`,[id,user.tenant_id,user.id,requestText,JSON.stringify(plan)]);
    await audit({tenantId:user.tenant_id,userId:user.id,actorLabel:user.name,action:'workflow.request',resourceType:'workflow_run',resourceId:id,decision:'allowed',reason:'Authenticated role is permitted to run the validated lead workflow.',metadata:{request_length:requestText.length,plan}});
    setImmediate(()=>executeWorkflow({runId:id,tenantId:user.tenant_id,userId:user.id,userName:user.name,requestText,role:user.role,plan}).catch(e=>console.error('[worker]',e.message)));
    return json(res,202,{id,status:'queued',plan,message:'Workflow queued. Watch the run timeline for live task states.'});
  }
  if (pathname === '/api/workflows' && req.method === 'GET') {
    requirePermission(user,'workflow:read');
    const rows=await query(`SELECT id,request_text,status,summary,ai_provider,leads_processed,drafts_created,updates_applied,approvals_created,error_message,started_at,finished_at,created_at FROM workflow_runs WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 30`,[user.tenant_id]);
    return json(res,200,{runs:rows.rows});
  }
  const runMatch=pathname.match(/^\/api\/workflows\/([\da-f-]+)$/i);
  if (runMatch && req.method === 'GET') {
    requirePermission(user,'workflow:read');
    const run=await query(`SELECT * FROM workflow_runs WHERE id=$1 AND tenant_id=$2`,[runMatch[1],user.tenant_id]);
    if (!run.rowCount) return json(res,404,{error:'Workflow run not found.'});
    const tasks=await query(`SELECT id,agent_name,task_name,task_type,status,input_data,output_data,error_message,started_at,finished_at,created_at FROM workflow_tasks WHERE run_id=$1 AND tenant_id=$2 ORDER BY created_at`,[runMatch[1],user.tenant_id]);
    return json(res,200,{run:run.rows[0],tasks:tasks.rows});
  }
  if (pathname === '/api/approvals' && req.method === 'GET') {
    requirePermission(user,'approvals:read');
    const rows=await query(`SELECT a.id,a.action_type,a.target_type,a.target_ids,a.payload,a.status,a.created_at,a.decided_at,a.decision_note,a.requested_by,u.name AS requester,
      r.request_text, COALESCE((SELECT json_agg(json_build_object('id',e.id,'lead_id',e.lead_id,'company',l.company,'first_name',l.first_name,'email',e.to_email,'subject',e.subject,'body',e.body,'status',e.status) ORDER BY e.created_at) FROM email_drafts e JOIN leads l ON l.id=e.lead_id WHERE e.id IN (SELECT jsonb_array_elements_text(a.target_ids)::uuid) AND e.tenant_id=a.tenant_id),'[]'::json) AS drafts
      FROM approvals a JOIN users u ON u.id=a.requested_by LEFT JOIN workflow_runs r ON r.id=a.run_id
      WHERE a.tenant_id=$1 ORDER BY CASE WHEN a.status='pending' THEN 0 ELSE 1 END,a.created_at DESC LIMIT 60`,[user.tenant_id]);
    return json(res,200,{approvals:rows.rows});
  }
  const approvalMatch=pathname.match(/^\/api\/approvals\/([\da-f-]+)\/decision$/i);
  if (approvalMatch && req.method === 'POST') {
    requirePermission(user,'approvals:decide');
    const b=await readJson(req); const decision=b.decision;
    if (!['approve','reject'].includes(decision)) throw Object.assign(new Error('Decision must be approve or reject.'),{status:400});
    const client=await getPool().connect(); let approval;
    try {
      await client.query('BEGIN');
      const locked=await client.query(`SELECT * FROM approvals WHERE id=$1 AND tenant_id=$2 FOR UPDATE`,[approvalMatch[1],user.tenant_id]);
      if (!locked.rowCount) { await client.query('ROLLBACK'); return json(res,404,{error:'Approval not found.'}); }
      approval=locked.rows[0];
      if (approval.status!=='pending') { await client.query('ROLLBACK'); return json(res,409,{error:'This approval has already been decided.'}); }
      if (approval.action_type !== 'email_dispatch' || approval.target_type !== 'email_draft') { await client.query('ROLLBACK'); return json(res,403,{error:'Unsupported approval action.'}); }
      const ids=Array.isArray(approval.target_ids) ? approval.target_ids : [];
      if (!ids.length) { await client.query('ROLLBACK'); return json(res,409,{error:'Approval contains no target drafts.'}); }
      const drafts=await client.query(`SELECT id,lead_id FROM email_drafts WHERE tenant_id=$1 AND id=ANY($2::uuid[]) AND status='awaiting_approval' FOR UPDATE`,[user.tenant_id,ids]);
      if (drafts.rowCount!==ids.length) { await client.query('ROLLBACK'); return json(res,409,{error:'Draft set changed since approval was requested. No action was taken.'}); }
      if (decision==='approve') {
        await client.query(`UPDATE email_drafts SET status='simulated_sent',approved_by=$1,approved_at=NOW() WHERE tenant_id=$2 AND id=ANY($3::uuid[])`,[user.id,user.tenant_id,ids]);
      } else {
        await client.query(`UPDATE email_drafts SET status='rejected',approved_by=$1,approved_at=NOW() WHERE tenant_id=$2 AND id=ANY($3::uuid[])`,[user.id,user.tenant_id,ids]);
      }
      await client.query(`UPDATE approvals SET status=$1,decided_by=$2,decided_at=NOW(),decision_note=$3 WHERE id=$4 AND tenant_id=$5`,[decision==='approve'?'approved':'rejected',user.id,text(b.note||'',300),approval.id,user.tenant_id]);
      if (approval.run_id) {
        await client.query(`UPDATE workflow_tasks SET status='completed',output_data=output_data || jsonb_build_object('human_approval_result',$1::text,'external_messages_sent',0),finished_at=NOW() WHERE run_id=$2 AND tenant_id=$3 AND task_type='followup_draft' AND status='awaiting_approval'`,[decision==='approve'?'approved':'rejected',approval.run_id,user.tenant_id]);
        const remaining=await client.query(`SELECT COUNT(*)::int AS count FROM approvals WHERE run_id=$1 AND tenant_id=$2 AND status='pending' AND id<>$3`,[approval.run_id,user.tenant_id,approval.id]);
        if (remaining.rows[0].count===0) await client.query(`UPDATE workflow_runs SET status='completed',finished_at=COALESCE(finished_at,NOW()) WHERE id=$1 AND tenant_id=$2 AND status='completed_with_approval'`,[approval.run_id,user.tenant_id]);
      }
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK').catch(()=>{}); throw e; }
    finally { client.release(); }
    await activity({tenantId:user.tenant_id,runId:approval.run_id,actor:user.name,eventType:`approval_${decision}d`,title:`Follow-up drafts ${decision==='approve'?'approved':'rejected'}`,description:decision==='approve'?'Drafts marked simulated-sent. No external emails were sent.':'Drafts rejected; no external emails were sent.',metadata:{approval_id:approval.id,count:approval.target_ids.length}});
    await audit({tenantId:user.tenant_id,userId:user.id,actorLabel:user.name,action:'approval.decide',resourceType:'approval',resourceId:approval.id,decision:'completed',reason:decision==='approve'?'Human approved exact set of email drafts; status change is simulated only.':'Human rejected the proposed email drafts.',metadata:{draft_count:approval.target_ids.length,simulated_only:true}});
    return json(res,200,{ok:true,status:decision==='approve'?'approved':'rejected',simulatedOnly:true,message:decision==='approve'?'Approved. Drafts marked simulated-sent; no external email was sent.':'Rejected. Drafts were not sent.'});
  }
  if (pathname === '/api/activity' && req.method === 'GET') {
    requirePermission(user,'activity:read');
    const rows=await query(`SELECT a.id,a.actor,a.event_type,a.title,a.description,a.metadata,a.created_at,a.lead_id,a.run_id,l.company FROM activities a LEFT JOIN leads l ON l.id=a.lead_id WHERE a.tenant_id=$1 ORDER BY a.created_at DESC LIMIT 100`,[user.tenant_id]);
    return json(res,200,{activities:rows.rows});
  }
  if (pathname === '/api/insights' && req.method === 'GET') {
    requirePermission(user,'insights:read');
    const [sourceRows,statusRows,topRows,weekly,summary]=await Promise.all([
      query(`SELECT source,COUNT(*)::int AS leads,COALESCE(AVG(score),0)::int AS avg_score,COALESCE(SUM(estimated_value),0)::numeric AS value FROM leads WHERE tenant_id=$1 GROUP BY source ORDER BY leads DESC`,[user.tenant_id]),
      query(`SELECT status,COUNT(*)::int AS count FROM leads WHERE tenant_id=$1 GROUP BY status`,[user.tenant_id]),
      query(`SELECT id,first_name,last_name,company,industry,score,status,estimated_value,source FROM leads WHERE tenant_id=$1 AND status IN ('new','qualified','contacted') ORDER BY score DESC LIMIT 5`,[user.tenant_id]),
      query(`SELECT day::date AS day,COALESCE(runs,0)::int AS runs,COALESCE(leads,0)::int AS leads,COALESCE(drafts,0)::int AS drafts FROM generate_series(CURRENT_DATE-INTERVAL '6 days',CURRENT_DATE,INTERVAL '1 day') AS days(day) LEFT JOIN LATERAL (SELECT COUNT(*) AS runs,COALESCE(SUM(leads_processed),0) AS leads,COALESCE(SUM(drafts_created),0) AS drafts FROM workflow_runs r WHERE r.tenant_id=$1 AND r.created_at::date=days.day::date AND r.status IN ('completed','completed_with_approval')) x ON TRUE ORDER BY days.day`,[user.tenant_id]),
      query(`SELECT COUNT(*)::int AS total,COUNT(*) FILTER(WHERE status='converted')::int AS converted,COALESCE(SUM(estimated_value) FILTER(WHERE status='converted'),0)::numeric AS converted_value,COALESCE(SUM(estimated_value) FILTER(WHERE status IN ('new','qualified','contacted')),0)::numeric AS open_value FROM leads WHERE tenant_id=$1`,[user.tenant_id]),
    ]);
    const s=summary.rows[0];
    return json(res,200,{sources:sourceRows.rows.map(r=>({...r,value:Number(r.value)})),statuses:statusRows.rows,topLeads:topRows.rows.map(r=>({...r,estimated_value:Number(r.estimated_value)})),weekly:weekly.rows,summary:{...s,converted_value:Number(s.converted_value),open_value:Number(s.open_value),conversion_rate:s.total?Math.round((s.converted/s.total)*100):0}});
  }
  if (pathname === '/api/audit' && req.method === 'GET') {
    requirePermission(user,'audit:read');
    const rows=await query(`SELECT id,actor_label,action,resource_type,resource_id,decision,reason,metadata,created_at FROM audit_logs WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 150`,[user.tenant_id]);
    return json(res,200,{logs:rows.rows});
  }
  return json(res,404,{error:'API route not found.'});
}

async function requestHandler(req,res) {
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
  try {
    const url=new URL(req.url,'http://localhost');
    if (url.pathname.startsWith('/api/')) return await handleApi(req,res,url);
    if (!['GET','HEAD'].includes(req.method)) return json(res,405,{error:'Method not allowed.'});
    const normalized=decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname);
    const file=path.resolve(ROOT,`.${normalized}`);
    if (!file.startsWith(ROOT+path.sep) && file!==path.join(ROOT,'index.html')) return json(res,403,{error:'Forbidden.'});
    let target=file;
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) return json(res,404,{error:'Not found.'});
    const ext=path.extname(target).toLowerCase();
    const content=fs.readFileSync(target);
    res.writeHead(200,{'Content-Type':MIME[ext]||'application/octet-stream','Cache-Control':ext==='.html'?'no-cache':'public, max-age=300','Content-Length':content.length});
    return req.method==='HEAD'?res.end():res.end(content);
  } catch (error) {
    const status=error.status || (error.message?.includes('DATABASE_URL')?503:500);
    if (status === 403 && String(req.url || '').startsWith('/api/')) {
      try {
        const user = await getUser(req);
        if (user) await audit({ tenantId:user.tenant_id, userId:user.id, actorLabel:user.name, action:`api.${String(req.method).toLowerCase()}`, resourceType:'api_route', resourceId:String(req.url).split('?')[0].slice(0,240), decision:'denied', reason:String(error.message).slice(0,400) });
      } catch {}
    }
    if (status>=500) console.error('[http]',error.stack||error.message);
    return json(res,status,{error:status>=500?(status===503?error.message:'Unexpected server error. Check server logs.') : error.message});
  }
}

const server=http.createServer(requestHandler);
server.listen(config.port,()=>{
  console.log(`\nAI Workforce is running at http://localhost:${config.port}`);
  console.log(`Database: ${config.databaseUrl ? 'configured' : 'NOT CONFIGURED'} | AI: ${config.geminiApiKey ? `Gemini (${config.geminiModel})` : 'rules-based fallback'}\n`);
});

for (const signal of ['SIGINT','SIGTERM']) process.on(signal,async()=>{
  server.close(async()=>{ try { await (await import('./db/pool.js')).closePool(); } catch {} process.exit(0); });
  setTimeout(()=>process.exit(1),5000).unref();
});
