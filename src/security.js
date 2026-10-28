import crypto from 'node:crypto';
import { promisify } from 'node:util';
const scryptAsync = promisify(crypto.scrypt);

export function randomId() { return crypto.randomUUID(); }
export function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
export async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 200) {
    throw new Error('Password must be between 12 and 200 characters.');
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const key = await scryptAsync(password, salt, 64);
  return `scrypt$${salt}$${Buffer.from(key).toString('hex')}`;
}
export async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false;
  const [scheme, salt, expectedHex] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !expectedHex || !/^[a-f\d]+$/i.test(expectedHex)) return false;
  try {
    const actual = Buffer.from(await scryptAsync(password, salt, expectedHex.length / 2));
    const expected = Buffer.from(expectedHex, 'hex');
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch { return false; }
}

const permissions = {
  admin: new Set(['dashboard:read','leads:read','leads:create','leads:update','workflow:run','workflow:read','approvals:read','approvals:decide','activity:read','insights:read','audit:read']),
  sales: new Set(['dashboard:read','leads:read','leads:create','leads:update','workflow:run','workflow:read','approvals:read','activity:read','insights:read']),
  analyst: new Set(['dashboard:read','leads:read','workflow:read','activity:read','insights:read','audit:read']),
};
export function can(role, permission) { return permissions[role]?.has(permission) ?? false; }

export function decideAction({ role, action, leadCount = 1, allowedStatuses = ['new','qualified','contacted','converted','lost'] }) {
  if (!permissions[role]) return { decision: 'denied', reason: 'Unknown role.' };
  if (action === 'lead.update') return { decision: permissions[role].has('leads:update') ? 'allowed' : 'denied', reason: permissions[role].has('leads:update') ? 'Role permits lead updates.' : 'Role does not permit lead updates.' };
  if (action === 'email.draft') return { decision: permissions[role].has('workflow:run') ? 'allowed' : 'denied', reason: 'Draft creation is non-delivery and requires workflow permission.' };
  if (action === 'email.bulk_dispatch') return { decision: role === 'admin' ? 'approval_required' : 'denied', reason: role === 'admin' ? `Bulk message dispatch for ${leadCount} recipients requires explicit owner approval.` : 'Only an administrator may request bulk dispatch.' };
  if (action === 'lead.delete' || action === 'data.export' || action === 'payment.execute' || action === 'permission.grant') return { decision: 'denied', reason: 'This action is disabled in the MVP or requires a separate privileged workflow.' };
  if (action === 'lead.status.update' && !allowedStatuses.length) return { decision: 'denied', reason: 'No valid target status.' };
  return { decision: 'denied', reason: 'Action is not on the allowlist.' };
}
