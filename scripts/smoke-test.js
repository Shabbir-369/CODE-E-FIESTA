const base = process.env.SMOKE_BASE_URL || 'http://localhost:4173';
const email = process.env.ADMIN_EMAIL || 'owner@example.com';
const password = process.env.ADMIN_PASSWORD;

async function main() {
  const healthRes = await fetch(`${base}/api/health`);
  const health = await healthRes.json();
  console.log('Health:', health);
  if (!health.database) throw new Error(`Database is not ready: ${health.databaseMessage}`);
  if (!password) throw new Error('Set ADMIN_PASSWORD in the environment before running the authenticated smoke test.');
  const loginRes = await fetch(`${base}/api/auth/login`, {
    method:'POST', headers:{'content-type':'application/json','x-requested-with':'AIWorkforce'},
    body:JSON.stringify({email,password}),
  });
  const login = await loginRes.json();
  if (!loginRes.ok) throw new Error(`Login failed: ${login.error || loginRes.status}`);
  const cookie = loginRes.headers.get('set-cookie')?.split(';')[0];
  const dashboardRes = await fetch(`${base}/api/dashboard`, { headers:{cookie} });
  const dashboard = await dashboardRes.json();
  if (!dashboardRes.ok) throw new Error(`Dashboard failed: ${dashboard.error || dashboardRes.status}`);
  const leadsRes = await fetch(`${base}/api/leads`, { headers:{cookie} });
  const leads = await leadsRes.json();
  if (!leadsRes.ok) throw new Error(`Lead list failed: ${leads.error || leadsRes.status}`);
  const waRes = await fetch(`${base}/api/whatsapp/status`, { headers:{cookie} });
  const wa = await waRes.json();
  if (!waRes.ok) throw new Error(`WhatsApp schema/status check failed: ${wa.error || waRes.status}. Run npm run setup to apply all migrations.`);
  console.log(`✓ Smoke test passed: ${dashboard.kpis.total_leads} total leads, ${leads.leads.length} leads listed, WhatsApp tables available (${wa.metrics.conversations} conversations).`);
}
main().catch(error=>{console.error('✗ Smoke test failed:',error.message);process.exitCode=1;});
