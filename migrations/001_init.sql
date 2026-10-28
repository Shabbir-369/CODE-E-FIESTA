BEGIN;

CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','sales','analyst')) DEFAULT 'sales',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL DEFAULT '',
  company TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  title TEXT,
  industry TEXT,
  source TEXT NOT NULL DEFAULT 'Website',
  status TEXT NOT NULL CHECK (status IN ('new','qualified','contacted','converted','lost')) DEFAULT 'new',
  score INTEGER NOT NULL DEFAULT 30 CHECK (score BETWEEN 0 AND 100),
  estimated_value NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (estimated_value >= 0),
  notes TEXT NOT NULL DEFAULT '',
  owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  last_activity_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, email)
);
CREATE INDEX IF NOT EXISTS idx_leads_tenant_status ON leads(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_leads_tenant_score ON leads(tenant_id, score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_tenant_updated ON leads(tenant_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS workflow_runs (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES users(id),
  request_text TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued','running','completed','completed_with_approval','failed')) DEFAULT 'queued',
  plan_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary TEXT NOT NULL DEFAULT '',
  ai_provider TEXT NOT NULL DEFAULT 'rules-fallback',
  leads_processed INTEGER NOT NULL DEFAULT 0,
  drafts_created INTEGER NOT NULL DEFAULT 0,
  updates_applied INTEGER NOT NULL DEFAULT 0,
  approvals_created INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_tenant_created ON workflow_runs(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS workflow_tasks (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  run_id UUID NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  agent_name TEXT NOT NULL,
  task_name TEXT NOT NULL,
  task_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued','running','completed','failed','awaiting_approval','skipped')) DEFAULT 'queued',
  input_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_workflow_tasks_run ON workflow_tasks(run_id, created_at);

CREATE TABLE IF NOT EXISTS email_drafts (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  run_id UUID REFERENCES workflow_runs(id) ON DELETE SET NULL,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','awaiting_approval','approved','simulated_sent','rejected')) DEFAULT 'draft',
  created_by UUID NOT NULL REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_drafts_tenant_status ON email_drafts(tenant_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS approvals (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  run_id UUID REFERENCES workflow_runs(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL CHECK (status IN ('pending','approved','rejected','expired')) DEFAULT 'pending',
  requested_by UUID NOT NULL REFERENCES users(id),
  decided_by UUID REFERENCES users(id),
  decision_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_approvals_tenant_status ON approvals(tenant_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS activities (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  run_id UUID REFERENCES workflow_runs(id) ON DELETE SET NULL,
  actor TEXT NOT NULL,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_activities_tenant_created ON activities(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_label TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  decision TEXT NOT NULL CHECK (decision IN ('allowed','denied','approval_required','completed','failed')),
  reason TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_tenant_created ON audit_logs(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO app_meta(key, value) VALUES ('schema_version', '1') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

COMMIT;
