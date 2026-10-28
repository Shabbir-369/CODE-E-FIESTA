# Northstar — Secure AI Workforce (Hackathon MVP)

A working MVP for the **“Build an AI Workforce for Businesses”** challenge. Northstar accepts a natural-language lead-operations request, orchestrates five specialist agents, persists CRM updates and execution history to PostgreSQL, drafts customer follow-ups, places outbound communication behind a human-approval gate, and presents the work in a dashboard.

## Demo Video

**Watch the project walkthrough:** [Open the Northstar demo on YouTube](https://youtu.be/13z7OgtBnB8)

[![Watch the Northstar AI Workforce demo on YouTube](https://img.youtube.com/vi/13z7OgtBnB8/hqdefault.jpg)](https://youtu.be/13z7OgtBnB8)

*Click the thumbnail above to watch the demo video.*

## Live Demo & Admin Login

**Hosted website:** [http://code-e-fiesta1234.vercel.app/](http://code-e-fiesta1234.vercel.app/)

> **Demo login credentials**
>
> **Email / ID:** `owner@example.com`  
> **Password:** `paswword12345678910`
>
> Open the hosted website above, then enter the email and password exactly as shown. These are the credentials supplied for this demo. Anyone who can read this README can see them, so use them only for a demo account. Change the password before using the site with real data or deploying it publicly. The credentials must also match the values configured for the seeded admin in `.env`.

## What is implemented

- **Business dashboard:** Lead volume, qualification, open opportunity value, estimated time reclaimed, pipeline stages, lead sources, agent status, latest activity, and recent workflow runs.
- **Lead pipeline:** Search and filter leads, add a lead, update status and internal notes, and inspect the AI priority score.
- **WhatsApp customer desk:** Connect the existing Chintu bot through a bearer-token webhook; match inbound customers to CRM records by phone; create new WhatsApp-sourced leads; store chat history; qualify clear purchase/demo interest; prepare safe AI replies; flag sensitive requests for human follow-up; and queue agent replies for Chintu to deliver.
- **WhatsApp delivery bridge:** A transport-neutral Node adapter example forwards inbound DMs, polls the reply outbox, and acknowledges sent/failed outcomes without replacing the bot's existing WhatsApp session.
- **Multi-agent run:** Lead Discovery → Lead Qualification → CRM Update → Follow-up Drafting → Insights. Each task has a persisted state, inputs/outputs, timing, and error field.
- **Gemini adapter:** Uses Google's Interactions API over HTTPS, configured with `GEMINI_API_KEY` and `GEMINI_MODEL`. Requests set `store: false`. If the key is absent or Gemini errors, the workflow transparently uses a rules-based fallback.
- **Data minimization:** Lead-assessment requests omit names, email addresses, phone numbers, free-text notes, and actual database IDs. The app fills customer-name placeholders on the server after the model response.
- **PostgreSQL state:** Tenant-scoped tables for users, sessions, leads, workflow runs/tasks, email drafts, approvals, activities, and audit records.
- **Authentication:** Salted Node.js `scrypt` password hashes, random opaque session tokens, SHA-256 token hashes in PostgreSQL, HttpOnly/SameSite=Strict cookies, session expiry, login rate limiting, and logout revocation.
- **Authorization gateway:** Default-deny role/permission map. Tenant scope is read from the authenticated session, never from a client-provided tenant ID. Routine lead score/status writes are automatic only for authorized roles. Analysts are read-only; only admins can decide approvals.
- **Approval center:** The exact draft set is locked and checked before a decision. Approval changes draft state to `simulated_sent`; rejection changes it to `rejected`.
- **Audit and activity:** Workflow actions, authorization decisions, draft creation, approvals, and failures are recorded.
- **Security headers:** CSP, MIME-sniffing protection, frame denial, referrer policy, same-site cookies, and a mutation request-integrity header.
- **Test suite:** Built-in `node:test` coverage for password hashing, role permissions, approval gates, blocked sensitive actions, fallback lead assessment, and WhatsApp policy/phone normalization.

## Explicit demo boundary

Database updates, workflow records, audit events, WhatsApp conversation records, and the outgoing WhatsApp queue are real. **WhatsApp delivery becomes live only after you connect Chintu's transport callback and configure the bridge token.** Email delivery remains simulated: approving an email draft does not send it. Lead deletion, payments, data export, and granting roles are disabled by policy in this MVP. The time-saved number is a configurable estimate, not a measured time study.

## Chintu source inspection and reuse status

The supplied `Not-Your-Type-Chintu-Final(1).zip` was inspected. It contains seven files: `docs/ASSUMPTIONS.md`, `docs/BUILD_PLAN.md`, `docs/VERIFICATION.md`, three `data/*.json` files, and `migrations/001_init.sql`. It does **not** contain `src/`, `package.json`, `.env.example`, or executable Gemini/PostgreSQL connection modules. The included build plan documents Node.js 20+, PostgreSQL, Gemini, zod, pino, and repository modules; the included migration demonstrates Chintu's PostgreSQL persistence conventions. Because executable modules are absent, this project reuses the documented stack and configuration-by-environment approach, not missing source-level modules. It does not import, share, or migrate Chintu data.

## Requirements

- Node.js 20+ (Node.js 22 also works)
- PostgreSQL 15+ (local or hosted)
- Optional Gemini API key from Google AI Studio

## Windows setup (PowerShell)

1. Extract the project ZIP into a new folder, for example `C:\projects\ai-workforce\`.

2. Install dependencies:

   ```powershell
   npm install
   ```

3. Create a **new** PostgreSQL database. Do not use Chintu's `chintu_db`:

   ```sql
   CREATE ROLE ai_workforce_app WITH LOGIN PASSWORD 'ChooseYourOwnStrongPassword123!';
   CREATE DATABASE ai_workforce_db OWNER ai_workforce_app;
   ```

   Run these statements in pgAdmin Query Tool. If the role/database already exists, do not recreate it; set the database owner with `ALTER DATABASE ai_workforce_db OWNER TO ai_workforce_app;`. Use your own unique database password and set the same credentials in `DATABASE_URL`.

4. Create the environment file:

   ```powershell
   Copy-Item .env.example .env
   notepad .env
   ```

   Set `DATABASE_URL` and the admin credentials below. Optionally set `GEMINI_API_KEY`; leave it blank to use the rules-based fallback.

   ```dotenv
   ADMIN_EMAIL=owner@example.com
   ADMIN_PASSWORD=paswword12345678910
   ```

   The `ADMIN_EMAIL` and `ADMIN_PASSWORD` values must match the credentials you intend to use to sign in. Keep `.env` private and do not commit it to Git.

5. Create the schema and seed the admin plus demo leads:

   ```powershell
   npm run setup
   ```

6. Start the dashboard:

   ```powershell
   npm start
   ```

7. Open `http://localhost:4173` and sign in with the admin email and password shown at the top of this README, provided those same values were configured in `.env` before setup.

8. To connect WhatsApp, follow [`docs/WHATSAPP_BRIDGE.md`](docs/WHATSAPP_BRIDGE.md). Set `WHATSAPP_BRIDGE_TOKEN`, keep `WHATSAPP_TENANT_ID` aligned with the seeded tenant, configure `WHATSAPP_KNOWLEDGE_BASE` with approved facts, and connect the adapter to Chintu's existing message handler. Rerun `npm run setup` after updating an existing project so migration `002_whatsapp_crm.sql` is applied.

> Use HTTPS and `NODE_ENV=production` when deploying. The production cookie is marked `Secure`, so a plain-HTTP production deployment will not retain the session cookie.

## PostgreSQL URL example

```dotenv
DATABASE_URL=postgresql://postgres:YOUR_LOCAL_PASSWORD@127.0.0.1:5432/ai_workforce_db
```

URL-encode reserved characters in the password (for example, `@` as `%40`). This database is separate from Chintu's.

## WhatsApp bridge setup

Read [`docs/WHATSAPP_BRIDGE.md`](docs/WHATSAPP_BRIDGE.md) for endpoint payloads and the adapter example. Generate a secret with:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Set the generated value as `WHATSAPP_BRIDGE_TOKEN` only in private environment files on both applications, and use HTTPS if Chintu runs on another device. Add only vetted public-facing facts to `WHATSAPP_KNOWLEDGE_BASE`. Gemini replies are enabled only when a key and non-empty knowledge base are configured; otherwise, deterministic fallback responses avoid inventing prices or commitments.

## Gemini configuration

```dotenv
GEMINI_API_KEY=your_google_ai_studio_key
GEMINI_MODEL=gemini-3.8-flash
```

The model can be changed via `GEMINI_MODEL` without changing the workflow. The adapter calls `POST https://generativelanguage.googleapis.com/v1beta/interactions` with `x-goog-api-key` and `{model,input,store:false}`. For current model availability and API behavior, see the [Gemini Interactions API documentation](https://ai.google.dev/gemini-api/docs/interactions-overview).

Do not commit `.env`, real customer data, or Chintu's WhatsApp authentication/session material. No credentials are embedded in the application source code; the demo login shown in this README is documentation and should be rotated before any public or production use.

## Suggested live demo flow

1. Sign in as the seeded admin and show the lead dashboard.
2. Open **Lead pipeline** and inspect the preloaded sample prospects.
3. Open **Workflows** and run: “Process actionable leads, qualify high-priority prospects, update CRM scores/statuses, prepare follow-up drafts, and summarize the results. Do not send emails.”
4. Show the execution trail with all five agents and the real PostgreSQL changes.
5. Open **Approvals**. Review recipients and contents, then approve or reject the exact draft set. The demo marks approved drafts as simulated-sent only.
6. Show **Insights**, **Agent activity**, and **Audit log** to explain value, traceability, and governance.
7. Explain that unauthorized roles are denied server-side and that an agent cannot grant itself permissions or call arbitrary SQL.

## Tests

Run the test suite:

```powershell
npm test
```

After configuring PostgreSQL, migrating/seeding, and starting the server in another terminal, run an authenticated smoke test:

```powershell
$env:ADMIN_EMAIL = "owner@example.com"
$env:ADMIN_PASSWORD = "paswword12345678910"
npm run smoke
```

## Security notes before production

This is a hackathon-ready MVP, not a certified enterprise deployment. Before using real customer data, add HTTPS termination, managed secret storage, persistent rate limiting, CSRF/origin policy aligned to the deployed proxy, database least-privilege credentials, formal backups, monitoring, audit-log export to an append-only system, data-retention controls, security review, and organization-level tenant administration. Re-check permissions on every new tool/integration. Never let a model return arbitrary SQL to execute.
