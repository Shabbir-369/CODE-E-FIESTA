BEGIN;

-- WhatsApp-only customers may not have an email at first contact.
ALTER TABLE leads ALTER COLUMN email DROP NOT NULL;

CREATE TABLE IF NOT EXISTS whatsapp_conversations (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  phone_e164 TEXT NOT NULL,
  contact_name TEXT NOT NULL DEFAULT '',
  last_message_preview TEXT NOT NULL DEFAULT '',
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  human_handoff BOOLEAN NOT NULL DEFAULT FALSE,
  bot_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, phone_e164)
);
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_tenant_recent ON whatsapp_conversations(tenant_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_lead ON whatsapp_conversations(tenant_id, lead_id);

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
  body TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'whatsapp',
  status TEXT NOT NULL CHECK (status IN ('received','reply_ready','queued','dispatching','sent','failed')) DEFAULT 'received',
  intent TEXT NOT NULL DEFAULT 'general_query',
  provider_message_id TEXT,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  claimed_at TIMESTAMPTZ,
  last_error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_provider_message_id ON whatsapp_messages(tenant_id, provider_message_id) WHERE provider_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_conversation ON whatsapp_messages(tenant_id, conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_outbox ON whatsapp_messages(tenant_id, status, created_at) WHERE direction='outbound';

INSERT INTO app_meta(key, value) VALUES ('schema_version', '2') ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW();
COMMIT;
