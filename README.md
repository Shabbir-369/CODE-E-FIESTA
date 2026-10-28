# Northstar — Secure AI Workforce (Hackathon MVP)

A working MVP for the “Build an AI Workforce for Businesses” challenge. It takes a natural-language lead-operations request, orchestrates five specialist agents, persists CRM updates and execution history to PostgreSQL, drafts customer follow-ups, puts outbound communication behind a human approval gate, and surfaces the work in a dashboard.

## What is implemented

- **Business dashboard:** lead volume, qualification, open opportunity value, estimated time reclaimed, pipeline stages, lead sources, agent status, latest activity, and recent workflow runs.
- **Lead pipeline:** search/filter leads, add a lead, update status and internal notes, inspect AI priority score.
- **WhatsApp customer desk:** link the existing Chintu bot through a bearer-token webhook; match inbound customers to CRM records by phone, create new WhatsApp-sourced leads, store chat history, qualify clear purchase/demo interest, prepare safe AI replies, flag sensitive requests for human follow-up, and queue agent replies for Chintu to deliver.
- **WhatsApp delivery bridge:** a transport-neutral Node adapter example forwards inbound DMs, polls the reply outbox, and acknowledges sent/failed outcomes without replacing the bot's existing WhatsApp session.
- **Multi-agent run:** Lead Discovery → Lead Qualification → CRM Update → Follow-up Drafting → Insights. Each task has a persisted state, inputs/outputs, timing, and error field.
- **Gemini adapter:** uses Google's current Interactions API through HTTPS, configured by `GEMINI_API_KEY` and `GEMINI_MODEL`. Requests set `store:false`. If the key is absent or Gemini errors, the workflow transparently uses a rules-based fallback.
- **Data minimization:** lead assessment requests omit names, email addresses, phone numbers, free-text notes, and actual database IDs. The app fills customer-name placeholders on the server after the model response.
- **Real PostgreSQL state:** tenant-scoped tables for users, sessions, leads, workflow runs/tasks, email drafts, approvals, activities, and audit records.
- **Authentication:** salted Node.js `scrypt` password hashes, random opaque session tokens, SHA-256 token hashes in PostgreSQL, HttpOnly/SameSite=Strict cookies, session expiry, login rate limiting, and logout revocation.
- **Authorization gateway:** default-deny role/permission map; tenant scope is read from the authenticated session, never from a client-provided tenant ID. Routine lead score/status writes are automatic only for authorized roles. Analysts are read-only; only admins can decide approvals.
- **Approval center:** exact draft set is locked and checked before decision. Approving changes draft state to `simulated_sent`; rejecting changes it to `rejected`.
- **Audit & activity:** workflow actions, authorization decisions, draft creation, approvals, and failures are recorded.
- **Security headers:** CSP, MIME sniffing protection, frame denial, referrer policy, same-site cookies, and a mutation request-integrity header.
- **Test suite:** built-in `node:test` coverage for password hashing, role permissions, approval gates, blocked sensitive actions, fallback lead assessment, and WhatsApp policy/phone normalization.

## Explicit demo boundary

The database updates, workflow records, audit events, WhatsApp conversation records, and outgoing WhatsApp queue are real. **WhatsApp delivery only becomes live after you connect Chintu's transport callback and configure the bridge token.** Email delivery remains simulated: approving an email draft does not send it. Lead deletion, payments, data export, and granting roles are disabled by policy in this MVP. The time-saved number is a configurable estimate, not a measured time study.

## Chintu source inspection and reuse status

The supplied `Not-Your-Type-Chintu-Final(1).zip` was inspected. It contains seven files: `docs/ASSUMPTIONS.md`, `docs/BUILD_PLAN.md`, `docs/VERIFICATION.md`, three `data/*.json` files, and `migrations/001_init.sql`. It does **not** contain `src/`, `package.json`, `.env.example`, or executable Gemini/PG connection modules. The included build plan documents Node.js 20+, PostgreSQL, Gemini, zod, pino, and repository modules; the included migration demonstrates Chintu's PostgreSQL persistence conventions. Because executable modules are absent, this project reuses the documented stack and configuration-by-environment approach, not missing source-level modules. It does not import, share, or migrate Chintu data.

## Requirements

- Node.js 20+ (tested design target; Node 22 also works)
- PostgreSQL 15+ (local or hosted)
- Optional Gemini API key from Google AI Studio

## Windows setup (PowerShell)

1. Extract the project ZIP into a new folder, for example `C:\projects\ai-workforce`.
2. Install dependencies:

   ```powershell
   npm install
   ```

3. Create a **new** PostgreSQL database. Do not use Chintu's `chintu_db`:

   ```sql
   CREATE ROLE ai_workforce_app WITH LOGIN PASSWORD 'ChooseYourOwnStrongPassword123!';
   CREATE DATABASE ai_workforce_db OWNER ai_workforce_app;
   ```

   Run in pgAdmin Query Tool. If the role/database already exists, do not recreate it; set the database owner with `ALTER DATABASE ai_workforce_db OWNER TO ai_workforce_app;`. Use your own unique password and set the same credentials in `DATABASE_URL`.

4. Create the environment file:

   ```powershell
   Copy-Item .env.example .env
   notepad .env
   ```

   Set `DATABASE_URL`, a unique `ADMIN_PASSWORD` of at least 12 characters, and `ADMIN_EMAIL`. Optionally set `GEMINI_API_KEY`. Leave the sample API-key value blank if you want to use the fallback.

5. Create the schema and seed the admin plus demo leads:

   ```powershell
   npm run setup
   ```

6. Start the dashboard:

   ```powershell
   npm start
   ```

7. Open `http://localhost:4173` and sign in using the admin email/password from `.env`.
8. To connect WhatsApp, follow [`docs/WHATSAPP_BRIDGE.md`](docs/WHATSAPP_BRIDGE.md). Set `WHATSAPP_BRIDGE_TOKEN`, keep `WHATSAPP_TENANT_ID` aligned with the seeded tenant, configure `WHATSAPP_KNOWLEDGE_BASE` with approved facts, and connect the adapter to Chintu's existing message handler. Rerun `npm run setup` after updating an existing project so migration `002_whatsapp_crm.sql` is applied.

> Use HTTPS and `NODE_ENV=production` when deploying. The production cookie is marked `Secure`, so a plain-HTTP production deployment will not retain the session cookie.

## PostgreSQL URL example

```dotenv
DATABASE_URL=postgresql://postgres:YOUR_LOCAL_PASSWORD@127.0.0.1:5432/ai_workforce_db
```

URL-encode reserved characters in the password (for example `@` as `%40`). This is a separate database from Chintu.

## WhatsApp bridge setup

Read [`docs/WHATSAPP_BRIDGE.md`](docs/WHATSAPP_BRIDGE.md) for endpoint payloads and the adapter example. Generate a secret with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`, set the value as `WHATSAPP_BRIDGE_TOKEN` only in private environment files on both applications, and use HTTPS if Chintu runs on another device. Add only vetted public-facing facts to `WHATSAPP_KNOWLEDGE_BASE`. Gemini replies are enabled only when a key and non-empty knowledge base are configured; otherwise deterministic fallback responses avoid inventing prices or commitments.

## Gemini configuration

```dotenv
GEMINI_API_KEY=your_google_ai_studio_key
GEMINI_MODEL=gemini-3.8-flash
```

The model can be changed via `GEMINI_MODEL` without changing the workflow. The adapter calls `POST https://generativelanguage.googleapis.com/v1beta/interactions` with `x-goog-api-key` and `{model,input,store:false}`. For current model availability and API behavior, see the [Gemini Interactions API documentation](https://ai.google.dev/gemini-api/docs/interactions-overview).

No credentials are embedded in the source code. Never commit `.env`, real customer data, or Chintu's WhatsApp auth/session material.

## Suggested live demo flow

1. Sign in as the seeded admin and show the lead dashboard.
2. Open **Lead pipeline** and inspect the preloaded sample prospects.
3. Open **Workflows** and run: “Process actionable leads, qualify high-priority prospects, update CRM scores/statuses, prepare follow-up drafts, and summarize the results. Do not send emails.”
4. Show the execution trail with all five agents and the real PostgreSQL changes.
5. Open **Approvals**. Review the recipients/contents and approve or reject the exact draft set. The demo marks approved drafts simulated-sent only.
6. Show **Insights**, **Agent activity**, and **Audit log** to explain value, traceability, and governance.
7. Explain that unauthorized roles are denied server-side and that an agent cannot grant itself permissions or call arbitrary SQL.

## Tests

```powershell
npm test
```

After configuring PostgreSQL, migrating/seeding, and starting the server in another terminal, run an authenticated smoke test:

```powershell
$env:ADMIN_EMAIL = "owner@example.com"
$env:ADMIN_PASSWORD = "your configured admin password"
npm run smoke
```

## Security notes before production

This is a hackathon-ready MVP, not a certified enterprise deployment. Before using real customer data, add HTTPS termination, managed secret storage, persistent rate limiting, CSRF/origin policy aligned to the deployed proxy, database least-privilege credentials, formal backups, monitoring, audit-log export to an append-only system, data retention controls, security review, and organization-level tenant administration. Re-check permissions on every new tool/integration. Never let a model return arbitrary SQL to execute.
