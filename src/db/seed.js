import { config } from '../config.js';
import { getPool, closePool } from './pool.js';
import { hashPassword, randomId } from '../security.js';

const tenantId = '2a5e20fc-3df4-42f5-a6bc-69b6e12d3d9e';
const sampleLeads = [
  { first_name:'Aarav', last_name:'Shah', company:'Aster Foods', email:'aarav.shah@example.com', phone:'+91 90000 10001', title:'Operations Head', industry:'Food & Beverage', source:'Website', status:'new', score:78, value:420000, notes:'Looking to automate inbound distributor lead qualification and sales follow-up.' },
  { first_name:'Meera', last_name:'Kapoor', company:'BluePeak Logistics', email:'meera.kapoor@example.com', phone:'+91 90000 10002', title:'COO', industry:'Logistics', source:'Referral', status:'qualified', score:91, value:850000, notes:'Asked for a demo next week; currently uses spreadsheets to track inbound prospects.' },
  { first_name:'Rohan', last_name:'Desai', company:'CedarPay', email:'rohan.desai@example.com', phone:'+91 90000 10003', title:'Growth Lead', industry:'Fintech', source:'LinkedIn', status:'new', score:67, value:650000, notes:'Interested in reducing manual follow-ups; has a small sales team.' },
  { first_name:'Isha', last_name:'Nair', company:'DwellCraft', email:'isha.nair@example.com', phone:'+91 90000 10004', title:'Founder', industry:'Home & Lifestyle', source:'Website', status:'contacted', score:72, value:310000, notes:'Requested pricing and wants to understand implementation timeline.' },
  { first_name:'Kabir', last_name:'Malhotra', company:'Evergreen Clinics', email:'kabir.malhotra@example.com', phone:'+91 90000 10005', title:'Business Manager', industry:'Healthcare', source:'Event', status:'new', score:56, value:290000, notes:'Exploring tools for patient enquiry routing and appointment reminders.' },
  { first_name:'Ananya', last_name:'Rao', company:'ForgeWorks', email:'ananya.rao@example.com', phone:'+91 90000 10006', title:'Sales Director', industry:'Manufacturing', source:'Referral', status:'qualified', score:88, value:1200000, notes:'Needs a consistent CRM process across two regional sales teams.' },
  { first_name:'Vihaan', last_name:'Joshi', company:'GreenCart', email:'vihaan.joshi@example.com', phone:'+91 90000 10007', title:'Founder', industry:'Retail', source:'Website', status:'new', score:43, value:180000, notes:'Early research stage. Asked for a short overview and examples.' },
  { first_name:'Sara', last_name:'Khan', company:'Helio Academy', email:'sara.khan@example.com', phone:'+91 90000 10008', title:'Admissions Head', industry:'Education', source:'Webinar', status:'lost', score:24, value:220000, notes:'Paused evaluation until next quarter; no immediate action requested.' },
  { first_name:'Dev', last_name:'Patel', company:'Indigo Mobility', email:'dev.patel@example.com', phone:'+91 90000 10009', title:'Revenue Operations', industry:'Mobility', source:'LinkedIn', status:'new', score:83, value:760000, notes:'Wants a unified view of incoming leads and response-time reporting.' },
  { first_name:'Nisha', last_name:'Bose', company:'Juniper Living', email:'nisha.bose@example.com', phone:'+91 90000 10010', title:'Marketing Manager', industry:'Real Estate', source:'Partner', status:'converted', score:95, value:980000, notes:'Recently converted. Keep customer success follow-up separate from sales outreach.' },
];

let client;
try {
  if (!config.adminPassword || config.adminPassword.includes('ChangeThis-Strong-Password')) {
    throw new Error('Set a unique ADMIN_PASSWORD (12+ characters) in .env before seeding.');
  }
  client = await getPool().connect();
  await client.query('BEGIN');
  await client.query('INSERT INTO tenants(id,name) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name', [tenantId, config.businessName]);
  const passwordHash = await hashPassword(config.adminPassword);
  const userId = randomId();
  const userRes = await client.query(
    `INSERT INTO users(id,tenant_id,name,email,password_hash,role,active)
     VALUES($1,$2,$3,$4,$5,'admin',TRUE)
     ON CONFLICT(email) DO UPDATE SET name=EXCLUDED.name,password_hash=EXCLUDED.password_hash,role='admin',active=TRUE,tenant_id=EXCLUDED.tenant_id
     RETURNING id`,
    [userId, tenantId, config.adminName, config.adminEmail, passwordHash]
  );
  const adminId = userRes.rows[0].id;
  for (const lead of sampleLeads) {
    await client.query(
      `INSERT INTO leads(id,tenant_id,first_name,last_name,company,email,phone,title,industry,source,status,score,estimated_value,notes,owner_id,last_activity_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW())
       ON CONFLICT(tenant_id,email) DO NOTHING`,
      [randomId(),tenantId,lead.first_name,lead.last_name,lead.company,lead.email,lead.phone,lead.title,lead.industry,lead.source,lead.status,lead.score,lead.value,lead.notes,adminId]
    );
  }
  await client.query('COMMIT');
  console.log(`✓ Seed complete. Admin: ${config.adminEmail}; tenant: ${tenantId}; sample leads ensured.`);
} catch (error) {
  try { if (client) await client.query('ROLLBACK'); } catch {}
  console.error('Seed failed:', error.message);
  process.exitCode = 1;
} finally { if (client) client.release(); await closePool(); }
