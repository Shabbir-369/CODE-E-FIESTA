import { randomId } from './security.js';
import { query } from './db/pool.js';

export async function audit({ tenantId, userId = null, actorLabel = 'system', action, resourceType, resourceId = null, decision, reason = '', metadata = {} }) {
  await query(
    `INSERT INTO audit_logs(id,tenant_id,actor_user_id,actor_label,action,resource_type,resource_id,decision,reason,metadata)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
    [randomId(), tenantId, userId, actorLabel, action, resourceType, resourceId, decision, reason, JSON.stringify(metadata)]
  );
}

export async function activity({ tenantId, leadId = null, runId = null, actor, eventType, title, description = '', metadata = {} }) {
  await query(
    `INSERT INTO activities(id,tenant_id,lead_id,run_id,actor,event_type,title,description,metadata)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
    [randomId(), tenantId, leadId, runId, actor, eventType, title, description, JSON.stringify(metadata)]
  );
}
