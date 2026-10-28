# 3–4 minute hackathon demo

## 0:00–0:30 — The problem

“Small teams are losing time between lead forms, CRM updates, follow-ups, and reporting. Northstar turns one business request into a tracked workflow with five agents and a security gateway.”

## 0:30–1:00 — Dashboard / pipeline

Sign in as the admin. Show lead volume, qualified prospects, opportunity value, time-saved estimate, lead sources, latest agent events, and the seeded lead pipeline. Explain that the sample customer records are only demo data.

## 1:00–2:00 — Run the workflow

Use: “Qualify actionable leads, update CRM scores and statuses, draft personalized follow-ups, and prepare a report. Do not send emails.”

Show the planned tasks and execution trace. Explain that CRM score/status updates are persisted in PostgreSQL and the activity/audit records describe what actually happened. If Gemini is configured, mention the Gemini qualification step; otherwise show the rules-based fallback honestly.

## 2:00–2:45 — WhatsApp customer support

Open **WhatsApp inbox**. If Chintu is not linked yet, explain the webhook and show `docs/WHATSAPP_BRIDGE.md`; do not claim the phone bot is connected. Once linked, send a direct test DM such as “Hi, I’d like a demo,” show the new or matched CRM lead and saved conversation, show the prepared reply, and demonstrate a human hand-off by requesting a person or mentioning a refund. The bridge stores history and can qualify leads, while Chintu owns actual message delivery.

## 2:45–3:30 — Approval boundary

Open Approval Center. Inspect one draft's recipient and body, then approve or reject. Explain that the exact draft IDs are locked and rechecked in a database transaction. Approval only marks records as simulated-sent; it does not send an external message.

## 3:30–4:00 — Insights and trust

Show Insights, Activity, and Audit Log. Demonstrate the planner rejecting “send follow-up emails to every customer” and destructive data requests. Explain that agents cannot run arbitrary SQL or grant themselves permissions.

## Judge-ready framing

- **Technical execution:** real PostgreSQL writes, persisted workflow tasks, sessions, approval queue, API, and audit events.
- **Problem relevance:** lead qualification, CRM hygiene, follow-up preparation, and operating insight.
- **Originality:** permission-gated agent orchestration with a verified execution trace and data-minimizing AI request.
- **Impact:** measured leads processed and drafts prepared, plus clearly labeled estimated time reclaimed.
- **AI use:** Gemini Interactions API with a deterministic fallback; structured output validation.
- **Honesty:** simulated email delivery is disclosed; do not claim a live email was sent.
