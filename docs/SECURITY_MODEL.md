# Security model and test boundaries

## Identity and session

- Passwords are salted and hashed with Node.js `scrypt`; plaintext passwords are never stored.
- A random opaque token is held in an `HttpOnly`, `SameSite=Strict` cookie; only the token's SHA-256 hash is stored in PostgreSQL.
- Sessions expire and logout revokes the session record.
- Login is rate-limited by source address in the running process.

## Authorization

| Role | Read CRM/insights | Add/update leads | Run workflow | Decide approval | Read audit |
|---|---:|---:|---:|---:|---:|
| Admin | Yes | Yes | Yes | Yes | Yes |
| Sales | Yes | Yes | Yes | No | No |
| Analyst | Yes | No | No | No | Yes |

The role map is enforced in the API. Tenant scope comes from the session. The policy gateway denies unknown actions and disables deletion, payments, data exports, and permission grants.

## Approval boundary

- Lead score/status update: allowed for admin/sales and automatically executed through a fixed backend function.
- Follow-up draft: permitted to workflow users; no message is sent.
- Simulated outbound dispatch: requires explicit admin approval for a fixed list of draft IDs in the same tenant. The target set is rechecked under a transaction/row lock before a decision is applied.
- No external email provider exists in this MVP, so even an approval cannot deliver an actual email.

## Audit events

Workflow requests, task outcomes, lead scoring/status changes, draft creation, approval decisions, and access denials are recorded. PostgreSQL audit rows are backend-controlled but are not cryptographically immutable; send them to an append-only external sink before production.

## Verification

`npm test` currently tests password hash verification/salting, minimum password length, role permissions, policy denial/approval, fallback scoring, and request planning. `npm run smoke` checks health, admin login, dashboard, and leads against a configured PostgreSQL database. Full PostgreSQL-backed verification must be run in the deployment environment because this build environment has no PostgreSQL server.

## WhatsApp bridge

- Bot-to-server endpoints use a dedicated bearer secret of at least 32 characters, checked server-side with constant-time comparison. Keep the same secret in private environment configuration for AI Workforce and Chintu; never embed it in public frontend assets.
- The bridge is mapped to the configured `WHATSAPP_TENANT_ID`; incoming payloads cannot select a tenant. Every database query is tenant-scoped. Provider message IDs are deduplicated where supplied.
- The bot should forward only direct customer DMs, not groups, status messages, or the bot's own messages. Use HTTPS for a remote bot.
- Incoming content is treated as untrusted. The model is not given tools or database credentials. The server performs only fixed allowlisted CRM behavior: link/create a lead and qualify a new lead on clear purchase/demo intent. Refunds, cancellations, contact changes, credential/payment topics, and complaints are routed to a human.
- Team replies are queued by an authenticated user and delivered by Chintu. The bridge acknowledges send success/failure, and delivery status is persisted.
- Customer messages and phone numbers are persisted in PostgreSQL. If Gemini is enabled, contact patterns are redacted and the model receives customer text plus approved support knowledge; review privacy/consent obligations before using live customer data.
