# Connect Chintu to AI Workforce

This is a bridge, not a replacement for Chintu. Chintu keeps its existing WhatsApp login/session and transport library; AI Workforce handles the customer-support policy, records the conversation, links it to a CRM lead, prepares replies, and updates the same PostgreSQL database used by the CRM portal.

## What it does

- Inbound direct messages: forwards the sender, optional display name, text, and provider message ID to AI Workforce.
- CRM matching: matches a sender to an existing lead by phone. If none exists, it creates a WhatsApp-sourced lead (email can be added later).
- Safe automation: clear pricing/demo/purchase intent can qualify a new lead. It never accepts arbitrary SQL or executes customer-directed refunds, cancellations, payments, contact-detail changes, permission changes, or data exports.
- Auto replies: with a verified knowledge base configured, Gemini can draft customer-safe replies. Without it, the service uses safe fallback responses. The service redacts email/phone patterns before asking Gemini, and sends `store:false`.
- Human hand-off: requests for a person, complaints, refunds/cancellations, contact changes, and sensitive credential/payment topics are flagged in the inbox.
- Dashboard replies: a staff member can queue a response in the WhatsApp inbox. Chintu polls the outbox and sends it through its existing WhatsApp client.
- Delivery status: Chintu acknowledges successful/failed sends. Duplicate provider message IDs are ignored.

## 1. Configure AI Workforce

In the AI Workforce project folder, create/edit `.env` and set:

```dotenv
WHATSAPP_BRIDGE_TOKEN=replace_with_a_random_secret_at_least_32_characters
WHATSAPP_TENANT_ID=2a5e20fc-3df4-42f5-a6bc-69b6e12d3d9e
PUBLIC_BASE_URL=https://your-public-https-host.example
WHATSAPP_KNOWLEDGE_BASE=Add approved business facts, published product details, customer-safe policies, opening hours, and support instructions here.
```

Generate a token with Node.js (run in PowerShell):

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the same value into Chintu's private environment/config. Do not place it in frontend JavaScript, do not log it, and never commit `.env`. Keep `WHATSAPP_TENANT_ID` aligned with the tenant seeded in this database. The default ID above is the MVP seed tenant.

Then run these commands from the AI Workforce project folder:

```powershell
npm run setup
npm test
npm start
```

If the site is on your own PC and Chintu runs on your phone, `localhost` on the phone is the phone itself, not your PC. Use a trusted HTTPS tunnel or a reachable LAN address with suitable firewall controls. For any public connection, HTTPS is required. Avoid exposing the service without access controls.

## 2. Adapt Chintu's message handler

The transport-neutral adapter is in `integrations/chintu-workforce-bridge.example.js`. Copy it into the Chintu source repo and import it. Connect its `sendMessage({to, text})` callback to the WhatsApp send API Chintu already uses. Do not replace Chintu's existing authentication/session setup with this example.

Example wiring (adapt variable names and the sender resolver to your actual WhatsApp library):

```js
import { createWorkforceBridge } from './integrations/chintu-workforce-bridge.example.js';

const workforce = createWorkforceBridge({
  baseUrl: process.env.AI_WORKFORCE_URL,
  token: process.env.AI_WORKFORCE_BRIDGE_TOKEN,
  // Replace this callback with Chintu's existing send function/JID conversion.
  sendMessage: async ({ to, text }) => existingWhatsAppSendFunction(to, text),
});

// Inside the existing inbound message handler, AFTER your own filters:
// - ignore fromMe/own messages
// - ignore groups, status updates, broadcasts and media-only messages
// - normalize `from` to an international phone number where possible
await workforce.handleIncoming({
  from: senderPhoneE164,
  name: displayName || '',
  text: incomingText,
  messageId: providerMessageId,
});

// Start once when Chintu is connected. This delivers dashboard replies too.
const stopWorkforceOutbox = workforce.startOutboxPoller(5000);
// Call stopWorkforceOutbox() during a graceful bot shutdown.
```

Chintu's private environment should contain:

```dotenv
AI_WORKFORCE_URL=https://your-public-https-host.example
AI_WORKFORCE_BRIDGE_TOKEN=the_same_random_secret_as_WHATSAPP_BRIDGE_TOKEN
```

The example's `existingWhatsAppSendFunction` is deliberately a placeholder. The exact callback depends on the WhatsApp library used in your full Chintu source, so do not paste this line unchanged unless it matches your bot's actual send function.

## 3. Protected endpoints

All endpoints below require `Authorization: Bearer <WHATSAPP_BRIDGE_TOKEN>`:

- `POST /api/integrations/whatsapp/inbound` JSON: `{ "from": "+919876543210", "name": "Customer", "text": "Can I get a demo?", "messageId": "provider-unique-id" }`
- `GET /api/integrations/whatsapp/outbound/pending?limit=10` returns messages claimed for dispatch.
- `POST /api/integrations/whatsapp/messages/:id/status` JSON: `{ "status": "sent", "providerMessageId": "whatsapp-id" }`; use `status: "failed"` and an `error` for failures.

The inbound response contains `reply` and `replyMessageId` when a reply is prepared. Chintu sends that reply and acknowledges the status. Dashboard replies are queued separately for the outbox poller.

## 4. Test the bridge without sending real WhatsApp messages

After setup and startup, set the token in a temporary PowerShell variable and send a test event. Use a unique `messageId` each time:

```powershell
$env:WHATSAPP_BRIDGE_TOKEN = 'paste-the-same-private-token-here'
$headers = @{ Authorization = "Bearer $env:WHATSAPP_BRIDGE_TOKEN" }
$body = @{ from = '+919876543210'; name = 'Demo Customer'; text = 'Hi, I would like a demo'; messageId = "local-test-$([guid]::NewGuid())" } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri 'http://localhost:4173/api/integrations/whatsapp/inbound' -Headers $headers -ContentType 'application/json' -Body $body
```

This test only creates CRM/chat records and prepares a reply. It does not send a message over WhatsApp by itself. When Chintu is connected, the callback sends it through your existing WhatsApp client.

## Security and production notes

- The bridge token grants access to a specific tenant's messaging endpoints. Treat it like a production credential and rotate it if exposed.
- Only forward direct customer DMs. Ignore groups, status events, self-messages, and non-text content unless intentionally supported.
- Messages and phone numbers are stored in your AI Workforce PostgreSQL database. Configure retention and access policies before using real customer data.
- Gemini is only used for replies when both a key and a non-empty verified knowledge base are configured. Customer phone/email patterns are redacted from the model prompt; all other customer text is still untrusted input and may contain personal data. Review your privacy obligations before enabling Gemini for live chats.
- Message delivery is real only when Chintu's transport callback is connected. The dashboard reports queued/sent/failed states from bridge acknowledgements.
