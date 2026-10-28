# Setup (Windows / PowerShell)

## 1. Prerequisites

- Node.js 20 or newer
- PostgreSQL 15 or newer (local installation or a hosted PostgreSQL instance)
- Optional: Gemini API key from Google AI Studio

## 2. Install dependencies

Open PowerShell in the extracted project folder:

```powershell
npm install
```

## 3. Create a separate database and app role

Open pgAdmin's Query Tool while connected to the `postgres` database. If the `ai_workforce_app` role does not already exist, run this first (replace the sample password):

```sql
CREATE ROLE ai_workforce_app WITH LOGIN PASSWORD 'ChooseYourOwnStrongPassword123!';
```

If `ai_workforce_db` does not exist, create it and give this role ownership:

```sql
CREATE DATABASE ai_workforce_db OWNER ai_workforce_app;
```

If the database already exists, do not run `CREATE DATABASE` again; run this instead:

```sql
ALTER DATABASE ai_workforce_db OWNER TO ai_workforce_app;
```

The app role should own the new database so it can create its own tables during migration. Do not point this app at Chintu's `chintu_db`.

## 4. Configure `.env`

```powershell
Copy-Item .env.example .env
notepad .env
```

Update these fields:

```dotenv
DATABASE_URL=postgresql://ai_workforce_app:YOUR_APP_PASSWORD@127.0.0.1:5432/ai_workforce_db
ADMIN_NAME=Business Owner
ADMIN_EMAIL=you@example.com
ADMIN_PASSWORD=replace-with-a-unique-password-of-at-least-12-characters
BUSINESS_NAME=Your Business
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.8-flash
WHATSAPP_BRIDGE_TOKEN=
WHATSAPP_TENANT_ID=2a5e20fc-3df4-42f5-a6bc-69b6e12d3d9e
WHATSAPP_KNOWLEDGE_BASE=
PUBLIC_BASE_URL=
```

If your PostgreSQL password contains URL-reserved characters, URL-encode them. Keep `.env` private and never commit it.

## 5. Create schema and demo data

```powershell
npm run setup
```

This runs the SQL migration and creates the initial administrator plus sample lead records. The seed script refuses the unchanged placeholder password.

## 6. Start and sign in

```powershell
npm start
```

Browse to `http://localhost:4173`. Sign in using `ADMIN_EMAIL` and `ADMIN_PASSWORD` from `.env`.

## 7. Connect the existing Chintu bot (optional)

1. Generate a random bridge secret in PowerShell:

   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

2. Put that secret in `WHATSAPP_BRIDGE_TOKEN` in AI Workforce `.env` and the same value in Chintu's private environment as `AI_WORKFORCE_BRIDGE_TOKEN`. Keep `WHATSAPP_TENANT_ID` aligned with your seeded tenant.
3. Add only verified customer-facing facts in `WHATSAPP_KNOWLEDGE_BASE` before enabling Gemini customer replies.
4. Adapt [`integrations/chintu-workforce-bridge.example.js`](integrations/chintu-workforce-bridge.example.js) to your bot's existing message handler and send function. Then follow [`docs/WHATSAPP_BRIDGE.md`](docs/WHATSAPP_BRIDGE.md) for details.
5. If Chintu runs on your phone, use a reachable HTTPS URL for the PC/server (for example a securely configured tunnel); `localhost` on the phone is not the PC.

The website stores chats and queues human replies, but does not speak directly to WhatsApp. Chintu sends the messages and posts a delivery acknowledgement. Run `npm run setup` again after adding this feature to apply migration `002_whatsapp_crm.sql`.

## 8. Run tests

In a separate terminal:

```powershell
npm test
```

With the app running and PostgreSQL configured, run a basic authenticated API smoke test:

```powershell
$env:ADMIN_EMAIL = "you@example.com"
$env:ADMIN_PASSWORD = "your configured password"
npm run smoke
```

## Quick troubleshooting

- **`DATABASE_URL is missing`:** copy `.env.example` to `.env` and edit it.
- **Connection refused:** ensure PostgreSQL is running, the database exists, and the URL/port/user/password are correct.
- **Role does not exist:** use a real PostgreSQL role for `DATABASE_URL`; this app does not assume a role named `postgres` exists.
- **Gemini falls back to rules:** check `GEMINI_API_KEY`, model access, and network connectivity. The workflow still runs with the fallback scorer.
- **Production deployment:** use HTTPS, set `NODE_ENV=production`, and provision secrets securely. The session cookie is marked `Secure` in production.
