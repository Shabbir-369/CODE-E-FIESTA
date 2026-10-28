const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const state = {
  user: null, view: 'overview', dashboard: null, leads: [], approvals: [], runs: [],
  activity: [], audit: [], search: '', leadStatus: 'all', expandedRun: null,
  workflowsLoading: false, pollTimer: null, mobileOpen: false, whatsappConversations: [], whatsappMessages: [], selectedWhatsappConversation: null, whatsappStatus: null, whatsappSearch: '',
};

const iconPaths = {
  grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  workflow:'<rect x="3" y="3" width="7" height="6" rx="1.5"/><rect x="14" y="15" width="7" height="6" rx="1.5"/><rect x="3" y="15" width="7" height="6" rx="1.5"/><path d="M6.5 9v3h11v3M10 18h4"/>',
  shield:'<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/>',
  activity:'<path d="M3 12h4l3-8 4 16 3-8h4"/>' ,
  'message-circle':'<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 8.7 3.9a8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z"/>',
  'message-square':'<path d="M21 15a4 4 0 0 1-4 4H7l-4 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/>',
  download:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/>',
  'user-check':'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m16 11 2 2 4-4"/>',
  chart:'<path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-5 5"/><path d="M14 9h5v5"/>',
  'file-check':'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 15l2.5 2.5L16 12"/>',
  'shield-check':'<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/>',
  logout:'<path d="M10 17l5-5-5-5M15 12H3"/><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"/>',
  bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>',
  mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  key:'<circle cx="8" cy="15" r="5"/><path d="m11.5 11.5 9-9 2 2-3 3 2 2-2 2-2-2-3 3"/>',
  'key-round':'<circle cx="8" cy="15" r="5"/><path d="m11.5 11.5 9-9 2 2-3 3 2 2-2 2-2-2-3 3"/>',
  'lock-keyhole':'<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><circle cx="12" cy="15" r="1"/><path d="M12 16v2"/>',
  'arrow-up-right':'<path d="M7 17 17 7M7 7h10v10"/>',
  'arrow-right':'<path d="M5 12h14M12 5l7 7-7 7"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
  'trending-up':'<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  database:'<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>',
  sparkles:'<path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z"/><path d="m19 14 .9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14ZM5 16l.7 1.3L7 18l-1.3.7L5 20l-.7-1.3L3 18l1.3-.7L5 16Z"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  'check-circle':'<circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/>',
  'alert-circle':'<circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/>',
  'arrow-down':'<path d="M12 5v14M19 12l-7 7-7-7"/>',
  'file-text':'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h8"/>',
  send:'<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  'chevron-right':'<path d="m9 18 6-6-6-6"/>',
  'external-link':'<path d="M15 3h6v6M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  eye:'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  close:'<path d="m18 6-12 12M6 6l12 12"/>',
  refresh:'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.6 9a7 7 0 0 1 11.8-2L20 12M4 12l2.6 5a7 7 0 0 0 11.8-2"/>',
};
function icon(name, cls='') { return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${iconPaths[name] || iconPaths.sparkles}</svg>`; }
function applyIcons(root=document) { $$('[data-icon]',root).forEach(el=>{el.innerHTML=icon(el.dataset.icon);}); }
function esc(value) { return String(value ?? '').replace(/[&<>"']/g, ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
function cash(value) { return new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0,notation:'compact',compactDisplay:'short'}).format(Number(value)||0); }
function num(value) { return new Intl.NumberFormat('en-IN').format(Number(value)||0); }
function initials(name) { return String(name||'NA').split(/[\s@._-]+/).filter(Boolean).slice(0,2).map(s=>s[0].toUpperCase()).join('')||'NA'; }
function relativeTime(value) {
  if (!value) return 'just now';
  const ms=Date.now()-new Date(value).getTime(); if (!Number.isFinite(ms)) return 'recently';
  const mins=Math.floor(ms/60000); if(mins<1)return 'just now'; if(mins<60)return `${mins}m ago`;
  const hours=Math.floor(mins/60); if(hours<24)return `${hours}h ago`; const days=Math.floor(hours/24); if(days<7)return `${days}d ago`;
  return new Date(value).toLocaleDateString('en-IN',{day:'numeric',month:'short'});
}
function dateTime(value) { return value?new Date(value).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'—'; }
function prettyStatus(value) { return String(value||'unknown').replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase()); }
function statusChip(value) { return `<span class="state-chip state-${esc(value)}">${esc(prettyStatus(value))}</span>`; }
function leadStatus(value) { return `<span class="status-badge status-${esc(value)}">${esc(prettyStatus(value))}</span>`; }
function scoreBar(score) { const n=Math.max(0,Math.min(100,Number(score)||0)); const color=n<45?'low':n<70?'mid':''; return `<div class="score-cell"><span class="score-bar"><span class="${color}" style="width:${n}%"></span></span><span class="score-num">${n}</span></div>`; }
function showError(message) { const el=$('#login-error'); if(el){el.textContent=message;el.classList.remove('hidden');} }
function api(path, options={}) {
  const headers={...(options.headers||{})};
  if(options.body!==undefined){headers['Content-Type']='application/json';}
  if(options.method && !['GET','HEAD'].includes(options.method.toUpperCase())) headers['X-Requested-With']='AIWorkforce';
  return fetch(path,{credentials:'same-origin',...options,headers,body:options.body===undefined?undefined:JSON.stringify(options.body)}).then(async response=>{
    const data=await response.json().catch(()=>({}));
    if(!response.ok){const error=new Error(data.error||`Request failed (${response.status}).`);error.status=response.status;error.data=data;throw error;}
    return data;
  });
}
function toast(title,message='',kind='success') {
  const root=$('#toast-root'); const el=document.createElement('div'); el.className=`toast ${kind==='error'?'error':''}`;
  el.innerHTML=`${icon(kind==='error'?'alert-circle':'check-circle')}<div><strong>${esc(title)}</strong>${message?`<small>${esc(message)}</small>`:''}</div>`; root.append(el); setTimeout(()=>el.remove(),4600);
}
function setActiveView(view) {
  state.view=view; state.expandedRun=null;
  $$('.nav-item').forEach(el=>el.classList.toggle('active',el.dataset.view===view));
  const labels={overview:'Overview',leads:'Lead pipeline',whatsapp:'WhatsApp inbox',workflows:'Workflows',approvals:'Approvals','activity':'Agent activity',insights:'Insights',audit:'Audit log'};
  $('#page-crumb').textContent=labels[view]||'Overview';
  $('#sidebar').classList.remove('mobile-open'); $('#sidebar-scrim').classList.remove('visible'); state.mobileOpen=false;
  renderCurrentView();
}
function roleLabel(role) { return ({admin:'Administrator',sales:'Sales operator',analyst:'Read-only analyst'})[role]||role; }
function updateUserChrome() {
  if(!state.user)return;
  const initialsText=initials(state.user.name);
  $('#profile-avatar').textContent=initialsText; $('#top-avatar').textContent=initialsText;
  $('#profile-name').textContent=state.user.name; $('#top-user-name').textContent=state.user.name;
  $('#profile-role').textContent=roleLabel(state.user.role); $('#top-user-role').textContent=state.user.role==='admin'?'Admin':prettyStatus(state.user.role);
  $('#audit-nav').classList.toggle('hidden',!['admin','analyst'].includes(state.user.role));
}
async function signOut() {
  try{await api('/api/auth/logout',{method:'POST',body:{}});}catch{}
  state.user=null;state.whatsappStatus=null;state.whatsappConversations=[];state.whatsappMessages=[];state.selectedWhatsappConversation=null;clearInterval(state.pollTimer);$('#app').classList.add('hidden');$('#auth-screen').classList.remove('hidden');$('#login-password').value='';$('#login-error').classList.add('hidden');
}
function updateCounts() {
  if(state.dashboard){$('#nav-lead-count').textContent=num(state.dashboard.kpis.total_leads);$('#nav-approval-count').textContent=state.dashboard.kpis.pending_approvals;$('#top-approval-dot').style.display=state.dashboard.kpis.pending_approvals?'block':'none';}
  if(state.whatsappStatus)$('#nav-whatsapp-count').textContent=num(state.whatsappStatus.metrics?.needing_human||0);
}
async function refreshDashboard() {
  const data=await api('/api/dashboard'); state.dashboard=data; updateCounts();
  $('#workspace-name').textContent=data.businessName||'Your workspace';
  return data;
}
function heading(kicker,title,desc,actions='') { return `<div class="page-heading"><div><div class="eyebrow"><span class="eyebrow-dot"></span>${esc(kicker)}</div><h1>${title}</h1><p>${desc}</p></div><div class="heading-actions">${actions}</div></div>`; }
function metricCard(label,value,foot,iconName,tint='') { return `<div class="metric-card"><div class="metric-head"><span class="metric-label">${label}</span><span class="metric-icon ${tint}">${icon(iconName)}</span></div><div class="metric-value ${String(value).length>10?'compact':''}">${value}</div><div class="metric-foot">${foot}</div></div>`; }
function chartPipeline(data) {
  const colors={new:'#6d95f4',qualified:'#28b497',contacted:'#edb64e',converted:'#4dbe84',lost:'#aab2c0'};
  const labels={new:'New',qualified:'Qualified',contacted:'Contacted',converted:'Converted',lost:'Lost'};
  const map=Object.fromEntries((data.pipeline||[]).map(x=>[x.status,x]));
  const total=Number(data.kpis.total_leads)||0;
  return ['new','qualified','contacted','converted','lost'].map(status=>{const row=map[status]||{count:0,value:0};const pct=total?row.count/total*100:0;return `<div class="pipeline-row"><div class="pipeline-name"><span class="pipeline-dot" style="background:${colors[status]}"></span>${labels[status]}</div><div class="pipeline-bar"><div class="pipeline-fill" style="width:${pct}%;background:${colors[status]}"></div></div><div class="pipeline-count">${row.count}</div></div>`;}).join('');
}
function agentIcon(name) { if(/Discovery/.test(name))return 'users';if(/Qualification/.test(name))return 'target';if(/CRM/.test(name))return 'database';if(/Follow-up/.test(name))return 'mail';return 'chart'; }
function renderAgents(agents=[]) {
  const defaultAgents=[{agent_name:'Lead Discovery Agent',completed:0,failed:0,active:0},{agent_name:'Lead Qualification Agent',completed:0,failed:0,active:0},{agent_name:'CRM Update Agent',completed:0,failed:0,active:0},{agent_name:'Follow-up Agent',completed:0,failed:0,active:0},{agent_name:'Insights Agent',completed:0,failed:0,active:0}];
  const all=defaultAgents.map(a=>({...a,...(agents.find(x=>x.agent_name===a.agent_name)||{})}));
  return all.map(agent=>{const pending=agent.active>0;const failed=agent.failed>0&&agent.completed===0;const status=pending?'Working':failed?'Needs attention':'Ready';return `<div class="agent-row"><div class="agent-icon">${icon(agentIcon(agent.agent_name))}</div><div class="agent-info"><strong>${esc(agent.agent_name)}</strong><small>${num(agent.completed)} tasks completed · ${num(agent.failed)} failed</small></div><div class="agent-state ${pending||failed?'pending':''}"><span class="state-dot"></span>${status}</div></div>`;}).join('');
}
function eventIcon(type) { if(/approval/.test(type))return ['shield','warning'];if(/failed|denied/.test(type))return ['alert-circle','red'];if(/lead_scored|workflow_completed/.test(type))return ['check-circle',''];if(/email/.test(type))return ['mail','blue'];if(/workflow_started|workflow/.test(type))return ['workflow','blue'];return ['activity','']; }
function renderActivityItems(items, limit=8) {
  if(!items?.length)return `<div class="empty-state"><div class="empty-icon">${icon('activity')}</div><h3>No activity yet</h3><p>When your agents start working on leads, their actions and outcomes will appear here.</p></div>`;
  return items.slice(0,limit).map(item=>{const [i,tint]=eventIcon(item.event_type);return `<div class="activity-item"><div class="activity-symbol ${tint}">${icon(i)}</div><div class="activity-copy"><strong>${esc(item.title)}</strong><p>${esc(item.description||'')}</p>${item.company?`<span class="activity-company">${esc(item.company)}</span>`:''}</div><div class="activity-time">${relativeTime(item.created_at)}</div></div>`;}).join('');
}
function renderSourceBars(sources=[]) {
  if(!sources.length)return '<p class="panel-subtitle">Lead sources will appear when records are added.</p>';
  const max=Math.max(1,...sources.map(s=>Number(s.count)||0));
  return sources.slice(0,5).map((source,i)=>`<div class="source-row"><label>${esc(source.source)}</label><div class="source-track"><span style="width:${Math.max(3,(Number(source.count)/max)*100)}%;opacity:${1-i*.1}"></span></div><strong>${source.count}</strong></div>`).join('');
}
function renderRunCards(runs=[]) {
  if(!runs.length)return `<div class="panel"><div class="empty-state"><div class="empty-icon">${icon('workflow')}</div><h3>No workflow runs yet</h3><p>Launch your first lead operations workflow to see each agent's execution status here.</p><button class="primary-button" data-go="workflows">Run a workflow ${icon('arrow-right')}</button></div></div>`;
  return `<div class="run-list">${runs.map(run=>`<article class="run-card"><div class="run-icon">${icon('workflow')}</div><div class="run-content"><strong>${esc(run.request_text)}</strong><p>${dateTime(run.created_at)} · ${num(run.leads_processed)} leads · ${num(run.updates_applied)} CRM updates · ${num(run.drafts_created)} drafts</p></div><div class="run-meta">${run.ai_provider?`<span class="run-provider">${esc(run.ai_provider==='gemini'?'Gemini AI':run.ai_provider==='not-used'?'No model call':'Rules fallback')}</span>`:''}${statusChip(run.status)}<button class="table-action" data-run-details="${esc(run.id)}">Details</button></div></article>${state.expandedRun===run.id?'<div class="task-timeline" data-task-target="'+esc(run.id)+'"><div class="loading-skeleton" style="width:80%"></div></div>':''}`).join('')}</div>`;
}
function overviewMarkup(data) {
  const k=data.kpis;
  const actions=`<button class="date-pill">${icon('calendar')} Last 30 days</button><button class="primary-button" data-go="workflows">${icon('plus')} New workflow</button>`;
  return `${heading('YOUR BUSINESS AT A GLANCE','Good to have you back.',`Here's what your AI workforce has been moving forward today.`,actions)}
    <div class="metric-grid">
      ${metricCard('Total leads',num(k.total_leads),`<span class="trend neutral">${num(k.new_leads)} new</span><span>in your pipeline</span>`,'users')}
      ${metricCard('Qualified leads',num(k.qualified_leads),`<span class="trend">${Math.round((Number(k.qualified_leads)/(Number(k.total_leads)||1))*100)}%</span><span>of all leads</span>`,'target','teal')}
      ${metricCard('Open pipeline',cash(k.pipeline_value),`<span class="trend neutral">${num(k.hot_leads)} hot leads</span><span>score 75+</span>`,'chart','purple')}
      ${metricCard('Time reclaimed',`${Math.floor((Number(k.time_saved_minutes)||0)/60)}h ${(Number(k.time_saved_minutes)||0)%60}m`,`<span class="trend">Est.</span><span>workflow time saved</span>`,'clock','amber')}
    </div>
    <div class="dashboard-main-grid">
      <section class="panel"><div class="panel-header"><div><h2>Lead pipeline</h2><p class="panel-subtitle">How prospects move through your funnel</p></div><button class="outline-button" data-go="leads">View all leads ${icon('arrow-right')}</button></div><div class="panel-body"><div class="pipeline-list">${chartPipeline(data)}</div><div class="pipeline-footer"><div class="mini-kpi"><span>${icon('trending-up')}</span><span>Open opportunity value</span></div><strong class="value-positive">${cash(k.pipeline_value)}</strong></div></div></section>
      <section class="panel"><div class="panel-header"><div><h2>Your AI team</h2><p class="panel-subtitle">Specialists working in sync</p></div><span class="state-chip state-completed">5 agents</span></div><div class="panel-body"><div class="agent-list">${renderAgents(data.agents)}</div></div></section>
    </div>
    <div class="two-panel-grid">
      <section class="panel activity-panel"><div class="panel-header"><div><h2>Latest activity</h2><p class="panel-subtitle">A live record of your workforce's actions</p></div><button class="outline-button" data-go="activity">Activity log ${icon('arrow-right')}</button></div><div class="panel-body"><div class="activity-list">${renderActivityItems(data.activity,6)}</div></div></section>
      <section class="panel"><div class="panel-header"><div><h2>Lead sources</h2><p class="panel-subtitle">Where your prospects discover you</p></div><button class="outline-button" data-go="insights">Insights ${icon('arrow-right')}</button></div><div class="panel-body"><div class="source-bars">${renderSourceBars(data.sources)}</div></div></section>
    </div>
    <div class="section-label"><div><h2>Recent workflows</h2><p>Execution history, outcomes, and agent traceability.</p></div><button class="text-link" data-go="workflows">All workflows →</button></div>
    ${renderRunCards(data.runs)}
    <div class="lower-grid" style="margin-top:17px"><section class="workflow-prompt-panel"><div class="eyebrow"><span class="eyebrow-dot"></span> YOUR AI WORKFORCE</div><h2>Give your team its next assignment.</h2><p>One request. Coordinated agents. Every action checked against your business permissions.</p><textarea id="quick-workflow-prompt" aria-label="Workflow instruction">Qualify actionable leads, update CRM scores and statuses, draft personalized follow-ups, and prepare an insights summary. Do not send emails.</textarea><div class="workflow-run-actions"><small>Routine CRM updates run automatically.</small><button class="primary-button" id="quick-run">Start workflow ${icon('arrow-up-right')}</button></div><div class="agent-flow"><div class="flow-node"><span>${icon('sparkles')}</span>Plan</div><div class="flow-connector"></div><div class="flow-node"><span>${icon('users')}</span>Delegate</div><div class="flow-connector"></div><div class="flow-node"><span>${icon('shield-check')}</span>Authorize</div><div class="flow-connector"></div><div class="flow-node"><span>${icon('check-circle')}</span>Verify</div></div></section><section class="panel"><div class="panel-header"><div><h2>Needs your attention</h2><p class="panel-subtitle">Actions that wait for a human decision</p></div><span class="state-chip state-pending">${num(k.pending_approvals)} pending</span></div><div class="panel-body">${Number(k.pending_approvals)?`<div class="notice-box"><strong>${num(k.pending_approvals)} approval request(s) pending.</strong><br />Drafts and other restricted actions remain blocked until an authorized person reviews them.</div><button class="primary-button" data-go="approvals">Review approvals ${icon('arrow-right')}</button>`:`<div class="empty-state" style="padding:24px 10px"><div class="empty-icon">${icon('shield-check')}</div><h3>You're all caught up</h3><p>No restricted action is currently waiting for approval.</p></div>`}</div></section></div>`;
}
async function renderOverview() {
  const data=await refreshDashboard(); $('#page-content').innerHTML=overviewMarkup(data); applyIcons($('#page-content'));
  $('#quick-run')?.addEventListener('click',()=>runWorkflow($('#quick-workflow-prompt').value));
  bindNavigationActions();
}
function bindNavigationActions() { $$('[data-go]').forEach(el=>el.addEventListener('click',()=>setActiveView(el.dataset.go))); }

function leadRowsMarkup(leads) {
  if(!leads.length)return `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">${icon('users')}</div><h3>No leads match this view</h3><p>Try another search or status filter, or add a new lead to start building your pipeline.</p>${canEditLeads()?`<button class="primary-button" id="empty-add-lead">${icon('plus')} Add lead</button>`:''}</div></td></tr>`;
  return leads.map((lead,i)=>`<tr><td><div class="person-cell"><div class="person-avatar ${['','alt-a','alt-b','alt-c','alt-d'][i%5]}">${esc(initials(`${lead.first_name} ${lead.last_name}`))}</div><div class="person-copy"><strong>${esc(lead.first_name)} ${esc(lead.last_name)}</strong><small>${esc(lead.email)}</small></div></div></td><td><div class="company-cell"><strong>${esc(lead.company)}</strong><small>${esc(lead.industry||'Industry not set')}</small></div></td><td>${esc(lead.source)}</td><td>${leadStatus(lead.status)}</td><td>${scoreBar(lead.score)}</td><td><strong style="font-size:10px;color:#53627a">${cash(lead.estimated_value)}</strong></td><td>${canEditLeads()?`<button class="table-action" data-edit-lead="${esc(lead.id)}">Update</button>`:`<button class="table-action" data-view-lead="${esc(lead.id)}">View</button>`}</td></tr>`).join('');
}
function canEditLeads() { return ['admin','sales'].includes(state.user?.role); }
async function renderLeads() {
  const params=new URLSearchParams();if(state.search)params.set('search',state.search);if(state.leadStatus!=='all')params.set('status',state.leadStatus);
  const {leads}=await api(`/api/leads?${params.toString()}`);state.leads=leads;
  const actions=`${canEditLeads()?`<button class="outline-button" id="import-leads-note">${icon('file-text')} Import CSV <span style="font-size:9px;color:#9aa5b5">(coming next)</span></button><button class="primary-button" id="add-lead-btn">${icon('plus')} Add lead</button>`:''}`;
  $('#page-content').innerHTML=`${heading('CUSTOMER RELATIONSHIPS','Lead pipeline',`${num(leads.length)} lead(s) in this view. The AI scores opportunities; permissions control what it can change.`,actions)}
    <section class="panel"><div class="panel-header"><div><h2>All leads</h2><p class="panel-subtitle">Search customers, inspect priority scores, and manage CRM state.</p></div><span class="state-chip state-completed">${num(leads.length)} records</span></div>
    <div class="table-toolbar"><div class="search-wrap"><span>${icon('search')}</span><input id="lead-search" type="search" placeholder="Search name, company or email…" value="${esc(state.search)}" /></div><select id="lead-status-filter" class="filter-select" aria-label="Filter by status"><option value="all" ${state.leadStatus==='all'?'selected':''}>All statuses</option><option value="new" ${state.leadStatus==='new'?'selected':''}>New</option><option value="qualified" ${state.leadStatus==='qualified'?'selected':''}>Qualified</option><option value="contacted" ${state.leadStatus==='contacted'?'selected':''}>Contacted</option><option value="converted" ${state.leadStatus==='converted'?'selected':''}>Converted</option><option value="lost" ${state.leadStatus==='lost'?'selected':''}>Lost</option></select></div>
    <div class="table-wrap"><table class="data-table"><thead><tr><th>Contact</th><th>Company</th><th>Source</th><th>Status</th><th>AI score</th><th>Opportunity</th><th>Action</th></tr></thead><tbody>${leadRowsMarkup(leads)}</tbody></table></div><div class="table-bottom"><span>Showing ${leads.length} of up to 300 records</span><span>Scoped to your workspace</span></div></section>`;
  applyIcons($('#page-content'));bindNavigationActions();
  $('#lead-search').addEventListener('input',debounce(e=>{state.search=e.target.value;renderLeads().catch(handleViewError);},260));
  $('#lead-status-filter').addEventListener('change',e=>{state.leadStatus=e.target.value;renderLeads().catch(handleViewError);});
  $('#add-lead-btn')?.addEventListener('click',openAddLeadModal);
  $('#empty-add-lead')?.addEventListener('click',openAddLeadModal);
  $$('[data-edit-lead]').forEach(btn=>btn.addEventListener('click',()=>openEditLeadModal(btn.dataset.editLead)));
  $$('[data-view-lead]').forEach(btn=>btn.addEventListener('click',()=>openEditLeadModal(btn.dataset.viewLead,true)));
  $('#import-leads-note')?.addEventListener('click',()=>toast('CSV import is not enabled','The first MVP focuses on workflow execution; sample leads are already seeded.','error'));
}
function debounce(fn,wait){let timer;return(...args)=>{clearTimeout(timer);timer=setTimeout(()=>fn(...args),wait);};}

async function renderWorkflows() {
  const data=await api('/api/workflows');state.runs=data.runs;
  const actions=canEditLeads()?`<button class="primary-button" id="workflow-new-top">${icon('plus')} New workflow</button>`:'';
  $('#page-content').innerHTML=`${heading('ORCHESTRATION CENTER','Workflows',`Assign a business outcome. Agents coordinate execution, while the policy gateway checks every action.`,actions)}
    <div class="lower-grid"><section class="workflow-prompt-panel"><div class="eyebrow"><span class="eyebrow-dot"></span> NEW WORKFLOW</div><h2>What should your AI workforce take care of?</h2><p>Describe the outcome in plain language. The system will find leads, qualify them, update permitted CRM fields, draft follow-ups, and prepare a summary.</p><textarea id="workflow-prompt" aria-label="Describe workflow">Process actionable leads, score and qualify them, update the CRM, draft personalized follow-ups, and prepare a report. Do not send emails.</textarea><div class="workflow-run-actions"><small>5 specialist agents · PostgreSQL execution trail</small><button id="run-workflow-btn" class="primary-button">Run workflow ${icon('arrow-up-right')}</button></div><div class="agent-flow"><div class="flow-node"><span>${icon('sparkles')}</span>Plan</div><div class="flow-connector"></div><div class="flow-node"><span>${icon('users')}</span>Delegate</div><div class="flow-connector"></div><div class="flow-node"><span>${icon('shield-check')}</span>Authorize</div><div class="flow-connector"></div><div class="flow-node"><span>${icon('check-circle')}</span>Verify</div></div></section>
    <section class="panel"><div class="panel-header"><div><h2>Workflow guardrails</h2><p class="panel-subtitle">What the system will and will not do</p></div>${icon('shield-check')}</div><div class="panel-body"><div class="stat-row"><span>Routine CRM score/status updates</span><strong style="color:#1a9a78">Auto-run</strong></div><div class="stat-row"><span>Follow-up creation</span><strong style="color:#1a9a78">Draft only</strong></div><div class="stat-row"><span>External email delivery</span><strong style="color:#b8832c">Approval gate</strong></div><div class="stat-row"><span>Payments, deletes, role grants</span><strong style="color:#ca5c68">Blocked</strong></div><div class="notice-box" style="margin-top:14px;margin-bottom:0">Customer names, email addresses, phone numbers and notes are not sent to Gemini by the lead assessment adapter. Gemini requests use <code>store:false</code>.</div></div></section></div>
    <div class="section-label"><div><h2>Execution history</h2><p>Every run keeps an agent-level task trail and outcome metrics.</p></div><button class="outline-button" id="refresh-runs">${icon('refresh')} Refresh</button></div>
    ${renderRunCards(data.runs)}
    <div class="notice-box" style="margin-top:16px"><strong>Honest simulation boundary:</strong> PostgreSQL lead updates and draft creation are real. Email delivery is simulated; approving a draft only records a simulated send and never contacts a customer.</div>`;
  applyIcons($('#page-content'));bindNavigationActions();
  $('#run-workflow-btn')?.addEventListener('click',()=>runWorkflow($('#workflow-prompt').value));
  $('#workflow-new-top')?.addEventListener('click',()=>$('#workflow-prompt')?.focus());
  $('#refresh-runs')?.addEventListener('click',()=>renderWorkflows().catch(handleViewError));
  bindRunDetails(data.runs);
}
function bindRunDetails(runs) {
  $$('[data-run-details]').forEach(btn=>btn.addEventListener('click',async()=>{
    const id=btn.dataset.runDetails;state.expandedRun=state.expandedRun===id?null:id;await renderWorkflows();
    if(state.expandedRun===id)loadRunTasks(id).catch(handleViewError);
  }));
  $$('[data-task-target]').forEach(el=>{if(el.dataset.taskTarget===state.expandedRun)loadRunTasks(state.expandedRun).catch(handleViewError);});
}
async function loadRunTasks(id) {
  const target=$(`[data-task-target="${CSS.escape(id)}"]`);if(!target)return;
  const {run,tasks}=await api(`/api/workflows/${id}`);
  target.innerHTML=`<div style="font-size:10px;font-weight:800;color:#69788d;margin-bottom:5px">AGENT EXECUTION TRACE · ${esc(run.ai_provider==='gemini'?'GEMINI AI':'RULES FALLBACK')}</div>${tasks.map(task=>`<div class="task-row"><div class="task-check ${task.status==='failed'?'fail':task.status==='awaiting_approval'?'wait':''}">${icon(task.status==='completed'?'check':task.status==='failed'?'alert-circle':'clock')}</div><div><strong>${esc(task.agent_name)} · ${esc(task.task_name)}</strong><small>${esc(task.error_message||task.output_data?.summary||task.output_data?.note||task.output_data?.reason||task.output_data?.action||task.status)}</small></div>${statusChip(task.status)}</div>`).join('')||'<p class="panel-subtitle">Tasks are being created…</p>'}`;
  applyIcons(target);
}
async function runWorkflow(request) {
  if(!canEditLeads())return toast('Permission denied','Your role cannot launch workflows.','error');
  const button=$('#run-workflow-btn')||$('#quick-run');if(button){button.disabled=true;button.dataset.oldText=button.textContent;button.textContent='Queueing…';}
  try {
    const result=await api('/api/workflows/run',{method:'POST',body:{request}});
    toast('Workflow queued','Five agents will coordinate the run. Follow the execution history.');
    setActiveView('workflows');
    if(state.pollTimer)clearInterval(state.pollTimer);
    let attempts=0;
    state.pollTimer=setInterval(async()=>{
      attempts++;
      try {
        await renderWorkflows();
        const run=state.runs.find(r=>r.id===result.id);
        if(run && ['completed','completed_with_approval','failed'].includes(run.status)){clearInterval(state.pollTimer);state.pollTimer=null;await refreshDashboard().catch(()=>{});if(state.view==='workflows')await renderWorkflows();toast(run.status==='failed'?'Workflow needs attention':'Workflow finished',run.summary||'Execution state updated.',run.status==='failed'?'error':'success');}
      } catch(e) { if(e.status===401){clearInterval(state.pollTimer);state.pollTimer=null;signOut();} }
      if(attempts>75){clearInterval(state.pollTimer);state.pollTimer=null;}
    },1800);
  } catch(error){toast('Could not start workflow',error.message,'error');}
  finally {if(button&&button.isConnected){button.disabled=false;button.textContent=button.dataset.oldText||'Run workflow';}}
}

async function renderApprovals() {
  const {approvals}=await api('/api/approvals');state.approvals=approvals;
  const pending=approvals.filter(a=>a.status==='pending');
  const actions=`<button class="outline-button" id="refresh-approvals">${icon('refresh')} Refresh</button>`;
  $('#page-content').innerHTML=`${heading('HUMAN-IN-THE-LOOP','Approval center',`Sensitive actions stay on hold until an authorized reviewer approves the exact action and target set.`,actions)}
    <div class="metric-grid">${metricCard('Awaiting review',num(pending.length),'<span>Needs a decision</span>','shield','amber')}${metricCard('Reviewed',num(approvals.filter(a=>a.status!=='pending').length),'<span>Approved or rejected</span>','file-check','teal')}${metricCard('Outbound sends',num(approvals.filter(a=>a.action_type==='email_dispatch').length),'<span>Simulated only</span>','mail','purple')}${metricCard('Actual emails sent','0','<span>External delivery disabled</span>','lock-keyhole')}</div>
    <div class="notice-box"><strong>Safety contract:</strong> Approve marks the selected drafts as <code>simulated-sent</code> for demo purposes. This MVP has no email provider and does not send messages to customers.</div>
    ${pending.length?`<div class="section-label"><div><h2>Waiting for your decision</h2><p>Review recipients and draft content before approving.</p></div><span class="state-chip state-pending">${pending.length} pending</span></div><div class="approval-list">${pending.map(a=>approvalCard(a,true)).join('')}</div>`:`<section class="panel"><div class="empty-state"><div class="empty-icon">${icon('shield-check')}</div><h3>No pending approvals</h3><p>When agents prepare a restricted action, you'll see the full request here before anything is executed.</p><button class="outline-button" id="show-history">View approval history</button></div></section>`}
    ${approvals.some(a=>a.status!=='pending')?`<div class="section-label"><div><h2>Decision history</h2><p>Previously reviewed actions and their outcomes.</p></div></div><div class="approval-list">${approvals.filter(a=>a.status!=='pending').map(a=>approvalCard(a,false)).join('')}</div>`:''}`;
  applyIcons($('#page-content'));bindNavigationActions();
  $('#refresh-approvals')?.addEventListener('click',()=>renderApprovals().catch(handleViewError));
  $$('[data-approval-decision]').forEach(btn=>btn.addEventListener('click',()=>decideApproval(btn.dataset.approvalDecision,btn.dataset.approvalId)));
  $('#show-history')?.addEventListener('click',()=>{$('.section-label')?.scrollIntoView({behavior:'smooth'});});
}
function approvalCard(a,isPending) {
  const drafts=Array.isArray(a.drafts)?a.drafts:[];const payload=typeof a.payload==='string'?(()=>{try{return JSON.parse(a.payload)}catch{return {}}})():(a.payload||{});
  return `<article class="approval-card ${isPending?'pending-card':''}"><div class="approval-top"><div class="approval-icon">${icon('shield-check')}</div><div class="approval-main"><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><h3>${a.action_type==='email_dispatch'?'Follow-up message review':'Restricted action review'}</h3>${statusChip(a.status)}</div><p>${esc(payload.description||`${drafts.length} draft(s) are included in this request.`)} Requested by ${esc(a.requester||'Workspace user')} · ${dateTime(a.created_at)}</p><p style="margin-top:6px;color:#607087">${esc(a.request_text||'Review drafted customer follow-ups before simulated dispatch.')}</p></div></div>
    ${drafts.length?`<details class="draft-detail"><summary>Review ${drafts.length} draft(s) and recipient details</summary>${drafts.map(d=>`<div class="draft-item"><strong>${esc(d.first_name)} · ${esc(d.company)}</strong><small>To: ${esc(d.email)} · Subject: ${esc(d.subject)}</small><p>${esc(d.body)}</p></div>`).join('')}</details>`:''}
    ${isPending&&state.user?.role==='admin'?`<div class="approval-actions"><button class="approve-button" data-approval-decision="approve" data-approval-id="${esc(a.id)}">${icon('check-circle')} Approve & simulate</button><button class="reject-button" data-approval-decision="reject" data-approval-id="${esc(a.id)}">${icon('close')} Reject</button></div>`:!isPending?`<div class="form-help" style="margin-top:12px">${a.status==='approved'?'Approved by an authorized reviewer. Any send outcome is simulated only.':'Rejected; no external message was sent.'}${a.decision_note?` Note: ${esc(a.decision_note)}`:''}</div>`:state.user?.role!=='admin'?`<div class="form-help" style="margin-top:12px">Only a workspace administrator can decide this request.</div>`:''}</article>`;
}
async function decideApproval(decision,id) {
  const button=$(`[data-approval-id="${CSS.escape(id)}"][data-approval-decision="${decision}"]`);if(button){button.disabled=true;button.textContent=decision==='approve'?'Approving…':'Rejecting…';}
  try{const result=await api(`/api/approvals/${id}/decision`,{method:'POST',body:{decision}});toast(decision==='approve'?'Approval recorded':'Drafts rejected',result.message);await renderApprovals();await refreshDashboard();}
  catch(error){toast('Decision failed',error.message,'error');if(button)button.disabled=false;}
}
async function renderActivity() {
  const {activities}=await api('/api/activity');state.activity=activities;
  $('#page-content').innerHTML=`${heading('OBSERVABILITY','Agent activity',`Follow every customer-facing decision, database update, draft, and approval gate.`, `<button class="outline-button" id="refresh-activity">${icon('refresh')} Refresh</button>`)}<section class="panel"><div class="panel-header"><div><h2>Activity stream</h2><p class="panel-subtitle">Latest 100 events across this workspace</p></div><span class="state-chip state-completed">${activities.length} events</span></div><div class="activity-page-list">${renderActivityItems(activities,100)}</div></section>`;
  applyIcons($('#page-content'));bindNavigationActions();$('#refresh-activity')?.addEventListener('click',()=>renderActivity().catch(handleViewError));
}
async function renderInsights() {
  const data=await api('/api/insights');
  const maxDaily=Math.max(1,...data.weekly.map(x=>Number(x.leads)||0));
  const bars=data.weekly.map(row=>`<div class="bar-group"><strong>${num(row.leads)}</strong><div class="bar-stack"><span style="height:${Math.max(3,Number(row.leads)/maxDaily*100)}%"></span></div><label>${new Date(row.day).toLocaleDateString('en-IN',{weekday:'short'})}</label></div>`).join('');
  const top=data.topLeads.map((lead,i)=>`<div class="top-lead-row"><div class="person-avatar ${['','alt-a','alt-b','alt-c','alt-d'][i%5]}">${esc(initials(lead.company))}</div><div class="top-lead-copy"><strong>${esc(lead.company)}</strong><small>${esc(lead.industry||'Industry not set')} · ${prettyStatus(lead.status)}</small></div><div class="top-lead-score">${lead.score}<small style="display:block;font-size:8px;color:#99a4b2;font-weight:600">score</small></div></div>`).join('');
  $('#page-content').innerHTML=`${heading('BUSINESS INTELLIGENCE','Insights',`Turn workflow activity into a clear view of lead quality, pipeline value, and operating impact.`, `<button class="outline-button" id="refresh-insights">${icon('refresh')} Refresh data</button>`)}
    <div class="metric-grid">${metricCard('Conversion rate',`${data.summary.conversion_rate}%`,`<span>Converted / all leads</span>`,'trending-up','teal')}${metricCard('Converted value',cash(data.summary.converted_value),'<span>Won opportunity value</span>','check-circle')}${metricCard('Open opportunity',cash(data.summary.open_value),'<span>New · qualified · contacted</span>','chart','purple')}${metricCard('Lead sources',num(data.sources.length),'<span>Distinct acquisition channels</span>','users','amber')}</div>
    <div class="insights-grid"><section class="panel"><div class="panel-header"><div><h2>Workflow throughput</h2><p class="panel-subtitle">Lead records processed by completed workflows · last 7 days</p></div><span class="state-chip state-completed">7 days</span></div><div class="chart-area"><div class="bar-chart">${bars||''}</div><div class="chart-legend"><span><i class="legend-square"></i> Leads processed</span></div></div></section><section class="panel"><div class="panel-header"><div><h2>Source quality</h2><p class="panel-subtitle">Average AI score and lead volume by channel</p></div></div><div class="panel-body"><div class="source-bars">${data.sources.map((s,i)=>`<div style="margin-bottom:3px"><div class="source-row"><label>${esc(s.source)}</label><div class="source-track"><span style="width:${Math.max(2,Number(s.avg_score))}%;background:${['#4fc8b9','#6c8cf1','#edb44d','#a586df','#68a5d2'][i%5]}"></span></div><strong>${s.avg_score}</strong></div><div style="font-size:8px;color:#a1abba;margin:4px 0 0 3px">${s.leads} lead(s) · ${cash(s.value)} potential</div></div>`).join('')}</div></div></section></div>
    <div class="two-panel-grid"><section class="panel"><div class="panel-header"><div><h2>Highest-priority prospects</h2><p class="panel-subtitle">Leads to consider next, ranked by score</p></div><button class="outline-button" data-go="leads">Open pipeline ${icon('arrow-right')}</button></div><div class="panel-body">${top?`<div>${top}</div>`:'<div class="empty-state"><h3>No prospects to rank yet</h3></div>'}</div></section><section class="panel"><div class="panel-header"><div><h2>Business impact</h2><p class="panel-subtitle">Current workspace summary</p></div></div><div class="panel-body"><div class="stat-row"><span>Total leads analyzed</span><strong>${num(data.summary.total)}</strong></div><div class="stat-row"><span>Converted customers</span><strong>${num(data.summary.converted)}</strong></div><div class="stat-row"><span>Average lead score</span><strong>${data.sources.length?Math.round(data.sources.reduce((s,x)=>s+Number(x.avg_score),0)/data.sources.length):0}/100</strong></div><div class="stat-row"><span>Delivery model</span><strong>Simulated</strong></div><div class="notice-box" style="margin-top:13px;margin-bottom:0">Time reclaimed is an estimate (4 minutes per processed lead + 3 minutes per draft), not a measured time study. Replace the assumption with observed business data before production reporting.</div></div></section></div>`;
  applyIcons($('#page-content'));bindNavigationActions();$('#refresh-insights')?.addEventListener('click',()=>renderInsights().catch(handleViewError));
}
async function renderAudit() {
  if(!['admin','analyst'].includes(state.user?.role))return toast('Access restricted','Your role cannot view audit logs.','error');
  const {logs}=await api('/api/audit');state.audit=logs;
  const rows=logs.map(log=>`<tr><td><div class="company-cell"><strong>${esc(log.action)}</strong><small>${esc(log.resource_type)}${log.resource_id?` · ${esc(log.resource_id.slice(0,8))}`:''}</small></div></td><td>${esc(log.actor_label)}</td><td><span class="audit-decision ${esc(log.decision)}">${esc(prettyStatus(log.decision))}</span></td><td>${esc(log.reason)}</td><td>${dateTime(log.created_at)}</td></tr>`).join('');
  $('#page-content').innerHTML=`${heading('SECURITY & GOVERNANCE','Audit log',`An accountable record of authorization decisions and workflow changes.`, `<button class="outline-button" id="refresh-audit">${icon('refresh')} Refresh</button>`)}<div class="notice-box"><strong>Audit integrity note:</strong> The application restricts audit writes to the backend and records decision context. For production-grade tamper resistance, forward audit events to an append-only external log service.</div><section class="panel audit-table"><div class="panel-header"><div><h2>Recent security events</h2><p class="panel-subtitle">Latest 150 records for this tenant</p></div><span class="state-chip state-completed">${logs.length} entries</span></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Action / resource</th><th>Actor</th><th>Decision</th><th>Reason</th><th>Time</th></tr></thead><tbody>${rows||'<tr><td colspan="5"><div class="empty-state"><h3>No audit events yet</h3></div></td></tr>'}</tbody></table></div></section>`;
  applyIcons($('#page-content'));bindNavigationActions();$('#refresh-audit')?.addEventListener('click',()=>renderAudit().catch(handleViewError));
}

async function renderWhatsApp() {
  const convPath=state.whatsappSearch?`/api/whatsapp/conversations?search=${encodeURIComponent(state.whatsappSearch)}`:'/api/whatsapp/conversations';
  const [status, conversationData] = await Promise.all([api('/api/whatsapp/status'),api(convPath)]);
  state.whatsappStatus=status; state.whatsappConversations=conversationData.conversations||[];
  if(!state.whatsappConversations.some(c=>c.id===state.selectedWhatsappConversation))state.selectedWhatsappConversation=state.whatsappConversations[0]?.id||null;
  const selected=state.whatsappConversations.find(c=>c.id===state.selectedWhatsappConversation)||null;
  let messages=[];
  if(selected){const data=await api(`/api/whatsapp/conversations/${selected.id}/messages`);messages=data.messages||[];}
  state.whatsappMessages=messages;updateCounts();
  const metrics=status.metrics||{};
  const setupNotice=status.configured
    ? `<div class="wa-connection-note connected"><span class="wa-connection-dot"></span><div><strong>Bridge token configured</strong><p>Incoming customer messages can enter through the protected webhook. ${status.baseUrlConfigured?'A public base URL is configured.':'For a bot on another device, set PUBLIC_BASE_URL to your reachable HTTPS URL.'}</p></div></div>`
    : `<div class="wa-connection-note"><span class="wa-connection-dot"></span><div><strong>WhatsApp bridge not connected yet</strong><p>Add WHATSAPP_BRIDGE_TOKEN to the server .env, use the same secret in Chintu, run the database migration, then restart AI Workforce. The token is never displayed in this dashboard.</p><code>POST ${esc(status.webhookPath)}</code></div></div>`;
  const list=state.whatsappConversations.map(c=>{
    const title=c.contact_name||[c.first_name,c.last_name].filter(Boolean).join(' ')||c.phone_e164;
    const active=c.id===state.selectedWhatsappConversation;
    return `<button class="wa-conversation-item ${active?'active':''}" data-wa-select="${esc(c.id)}"><span class="wa-avatar">${esc(initials(title))}</span><span class="wa-conversation-copy"><strong>${esc(title)}</strong><small>${esc(c.phone_e164)}${c.company?` · ${esc(c.company)}`:''}</small><span>${esc(c.last_message_preview||'No messages yet')}</span></span><span class="wa-conversation-meta">${esc(relativeTime(c.last_message_at))}${c.human_handoff?'<i class="wa-handoff-dot" title="Needs human follow-up"></i>':''}</span></button>`;
  }).join('');
  const messageItems=messages.map(m=>`<article class="wa-message ${m.direction==='outbound'?'outbound':'inbound'}"><div class="wa-bubble">${esc(m.body).replace(/\n/g,'<br>')}</div><div class="wa-message-meta">${m.direction==='inbound'?'Customer':m.source==='dashboard'?'Team reply':'AI agent'} · ${dateTime(m.created_at)} · ${esc(prettyStatus(m.status))}</div>${m.direction==='outbound'&&['failed','reply_ready'].includes(m.status)?`<button class="wa-retry-button" data-wa-retry="${esc(m.id)}">${icon('refresh')} Queue retry</button>`:''}</article>`).join('');
  const selectedTitle=selected?(selected.contact_name||[selected.first_name,selected.last_name].filter(Boolean).join(' ')||selected.phone_e164):'Select a conversation';
  const thread=selected?`<div class="wa-thread-header"><div><h2>${esc(selectedTitle)}</h2><p>${esc(selected.phone_e164)} · ${esc(selected.company||'WhatsApp customer')} · CRM: ${esc(prettyStatus(selected.lead_status||'new'))}</p></div><div class="wa-thread-actions">${selected.human_handoff?'<span class="state-chip state-awaiting_approval">Human follow-up</span>':'<span class="state-chip state-completed">Bot routing</span>'}<button class="outline-button compact-button" id="wa-toggle-bot">${selected.bot_enabled?'Pause bot':'Resume bot'}</button><button class="outline-button compact-button" id="wa-resolve-handoff">${selected.human_handoff?'Mark resolved':'Flag for human'}</button></div></div><div class="wa-messages" id="wa-messages">${messageItems||'<div class="empty-state"><h3>No messages yet</h3><p>Messages from this customer will appear here.</p></div>'}</div><form class="wa-reply-form" id="wa-reply-form"><label for="wa-reply-body">Reply to customer</label><textarea id="wa-reply-body" name="body" maxlength="1800" required placeholder="Write a helpful, approved response…"></textarea><div class="wa-reply-bottom"><span>Queued for delivery by Chintu. Do not include passwords, OTPs, or payment details.</span><button class="primary-button" type="submit" id="wa-send-reply">Queue reply ${icon('send')}</button></div><div id="wa-reply-error" class="form-error hidden"></div></form>`:`<div class="wa-empty-thread"><div class="empty-icon">${icon('message-circle')}</div><h3>Your customer conversations will appear here</h3><p>When Chintu forwards an inbound message to the protected webhook, AI Workforce creates or matches a CRM lead and prepares a response.</p></div>`;
  $('#page-content').innerHTML=`${heading('CUSTOMER SUPPORT CHANNEL','WhatsApp inbox','Customer queries, bot replies, CRM changes, and human hand-offs in one place.',`<button class="outline-button" id="wa-refresh">${icon('refresh')} Refresh inbox</button>`)}
    <div class="metric-grid wa-metrics">${metricCard('Conversations',num(metrics.conversations),'<span>Distinct customer chats</span>','message-circle','teal')}${metricCard('Inbound messages',num(metrics.inbound_messages),'<span>Received through Chintu</span>','download')}${metricCard('Needs a person',num(metrics.needing_human),'<span>Human follow-up flagged</span>','user-check','amber')}${metricCard('Pending delivery',num(metrics.pending_delivery),'<span>Replies waiting for Chintu</span>','send','purple')}</div>
    ${setupNotice}
    <section class="panel wa-workspace"><div class="wa-inbox-side"><div class="wa-list-header"><div><h2>Conversations</h2><p>${state.whatsappConversations.length} recent customer chats</p></div></div><div class="wa-search">${icon('search')}<input id="wa-search-input" aria-label="Search conversations" value="${esc(state.whatsappSearch)}" placeholder="Search name, phone, company…" /></div><div class="wa-conversation-list">${list||'<div class="empty-state"><h3>No WhatsApp chats yet</h3><p>Connect Chintu to receive your first conversation.</p></div>'}</div></div><div class="wa-thread">${thread}</div></section>
    <div class="notice-box wa-safety-note"><strong>Safety boundary:</strong> The bot can create/match leads and qualify clear buying interest. Refunds, cancellations, contact-detail changes, complaints, and other sensitive requests are routed to a person. Dashboard replies are queued, not delivered by this website directly; Chintu must poll the outbox and acknowledge delivery.</div>`;
  applyIcons($('#page-content'));bindNavigationActions();
  $('#wa-refresh')?.addEventListener('click',()=>renderWhatsApp().catch(handleViewError));
  $('#wa-search-input')?.addEventListener('input',e=>{const term=e.currentTarget.value.trim().toLowerCase();$$('.wa-conversation-item').forEach(item=>item.classList.toggle('hidden',!item.textContent.toLowerCase().includes(term)));});
  $$('[data-wa-select]').forEach(btn=>btn.addEventListener('click',()=>{state.selectedWhatsappConversation=btn.dataset.waSelect;renderWhatsApp().catch(handleViewError);}));
  $('#wa-reply-form')?.addEventListener('submit',async e=>{
    e.preventDefault();if(!selected)return;const body=$('#wa-reply-body').value.trim();if(!body)return;
    const btn=$('#wa-send-reply');btn.disabled=true;btn.textContent='Queueing…';$('#wa-reply-error').classList.add('hidden');
    try{await api(`/api/whatsapp/conversations/${selected.id}/reply`,{method:'POST',body:{body}});toast('Reply queued','Chintu will pick it up from the outbound queue.');await renderWhatsApp();}
    catch(error){const err=$('#wa-reply-error');err.textContent=error.message;err.classList.remove('hidden');btn.disabled=false;btn.innerHTML=`Queue reply ${icon('send')}`;applyIcons(btn);}
  });
  $('#wa-toggle-bot')?.addEventListener('click',async()=>{try{await api(`/api/whatsapp/conversations/${selected.id}`,{method:'PATCH',body:{bot_enabled:!selected.bot_enabled}});toast(selected.bot_enabled?'Bot paused':'Bot resumed','Conversation routing updated.');await renderWhatsApp();}catch(e){toast('Could not update bot',e.message,'error');}});
  $('#wa-resolve-handoff')?.addEventListener('click',async()=>{try{await api(`/api/whatsapp/conversations/${selected.id}`,{method:'PATCH',body:{human_handoff:!selected.human_handoff}});toast(selected.human_handoff?'Marked as resolved':'Flagged for human follow-up','Conversation status updated.');await renderWhatsApp();}catch(e){toast('Could not update follow-up',e.message,'error');}});
  $$('[data-wa-retry]').forEach(btn=>btn.addEventListener('click',async()=>{btn.disabled=true;try{await api(`/api/whatsapp/messages/${btn.dataset.waRetry}/retry`,{method:'POST',body:{}});toast('Message queued','Chintu will retry delivery.');await renderWhatsApp();}catch(e){toast('Retry failed',e.message,'error');btn.disabled=false;}}));
}

function renderCurrentView() {
  const container=$('#page-content');container.innerHTML='<div class="metric-grid">'+Array.from({length:4},()=>'<div class="metric-card"><div class="loading-skeleton" style="width:65%"></div><div class="loading-skeleton" style="width:50%;height:28px;margin-top:15px"></div><div class="loading-skeleton" style="width:80%;margin-top:11px"></div></div>').join('')+'</div><div class="panel" style="padding:20px"><div class="loading-skeleton" style="width:30%"></div><div class="loading-skeleton" style="width:80%;margin-top:18px"></div><div class="loading-skeleton" style="width:65%;margin-top:12px"></div></div>';
  const renderers={overview:renderOverview,leads:renderLeads,whatsapp:renderWhatsApp,workflows:renderWorkflows,approvals:renderApprovals,activity:renderActivity,insights:renderInsights,audit:renderAudit};
  (renderers[state.view]||renderOverview)().catch(handleViewError);
}
function handleViewError(error) {
  if(error.status===401){signOut();return;}
  $('#page-content').innerHTML=`<section class="panel"><div class="empty-state"><div class="empty-icon">${icon('alert-circle')}</div><h3>We couldn't load this view</h3><p>${esc(error.message||'Unexpected error.')} Check the database connection and server logs, then try again.</p><button class="outline-button" id="retry-view">${icon('refresh')} Try again</button></div></section>`;applyIcons($('#page-content'));$('#retry-view')?.addEventListener('click',renderCurrentView);
}

function openModal(title,description,body,footer) {
  const root=$('#modal-root');root.innerHTML=`<div class="modal-backdrop" id="modal-backdrop"><section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-header"><div><h2 id="modal-title">${title}</h2><p>${description}</p></div><button class="modal-close" id="modal-close" aria-label="Close dialog">×</button></div><div class="modal-body">${body}${footer}</div></section></div>`;
  $('#modal-close').addEventListener('click',closeModal);$('#modal-backdrop').addEventListener('click',e=>{if(e.target.id==='modal-backdrop')closeModal();});
  document.addEventListener('keydown',escapeModal,{once:true});
}
function escapeModal(e){if(e.key==='Escape')closeModal();}
function closeModal(){ $('#modal-root').innerHTML=''; }
function openAddLeadModal() {
  if(!canEditLeads())return;
  openModal('Add a lead','Add a prospect to this workspace. The AI workforce can qualify the lead on its next run.',`<form id="lead-form"><div class="form-grid"><div class="form-field"><label for="lf-first">First name *</label><input id="lf-first" name="first_name" required maxlength="80" /></div><div class="form-field"><label for="lf-last">Last name</label><input id="lf-last" name="last_name" maxlength="80" /></div><div class="form-field full"><label for="lf-company">Company *</label><input id="lf-company" name="company" required maxlength="160" /></div><div class="form-field full"><label for="lf-email">Work email *</label><input id="lf-email" name="email" type="email" required maxlength="254" /></div><div class="form-field"><label for="lf-phone">Phone</label><input id="lf-phone" name="phone" maxlength="40" /></div><div class="form-field"><label for="lf-title">Job title</label><input id="lf-title" name="title" maxlength="120" /></div><div class="form-field"><label for="lf-industry">Industry</label><input id="lf-industry" name="industry" maxlength="100" /></div><div class="form-field"><label for="lf-source">Source</label><select id="lf-source" name="source"><option>Website</option><option>Referral</option><option>LinkedIn</option><option>Event</option><option>Partner</option><option>Webinar</option><option>Manual</option></select></div><div class="form-field full"><label for="lf-value">Estimated opportunity value (INR)</label><input id="lf-value" name="estimated_value" type="number" min="0" max="100000000" step="1000" value="0" /></div><div class="form-field full"><label for="lf-notes">Notes</label><textarea id="lf-notes" name="notes" maxlength="1200" placeholder="Context that helps your team follow up…"></textarea><div class="form-help">Notes are stored in PostgreSQL. This MVP does not send notes or customer contact details to Gemini.</div></div></div><div id="lead-form-error" class="form-error hidden"></div></form>`,`<div class="modal-footer"><button class="outline-button" type="button" id="cancel-lead">Cancel</button><button class="primary-button" type="submit" form="lead-form" id="save-lead">Save lead ${icon('arrow-right')}</button></div>`);
  applyIcons($('#modal-root'));$('#cancel-lead').addEventListener('click',closeModal);$('#lead-form').addEventListener('submit',saveLead);
}
async function saveLead(event) {
  event.preventDefault();const form=event.currentTarget;const fd=new FormData(form);const body=Object.fromEntries(fd.entries());body.estimated_value=Number(body.estimated_value||0);
  const button=$('#save-lead');button.disabled=true;button.textContent='Saving…';
  try{await api('/api/leads',{method:'POST',body});closeModal();toast('Lead added','The record is saved in PostgreSQL.');state.search='';state.leadStatus='all';await renderLeads();await refreshDashboard();}
  catch(error){const err=$('#lead-form-error');err.textContent=error.message;err.classList.remove('hidden');button.disabled=false;button.innerHTML=`Save lead ${icon('arrow-right')}`;applyIcons(button);}
}
function openEditLeadModal(id,readOnly=false) {
  const lead=state.leads.find(l=>l.id===id);if(!lead)return;
  openModal(readOnly?'Lead details':`Update ${esc(lead.company)}`,'Review lead status and CRM notes.',`<form id="edit-lead-form"><div class="form-grid"><div class="form-field"><label>Contact</label><input value="${esc(`${lead.first_name} ${lead.last_name}`)}" disabled /></div><div class="form-field"><label>AI score</label><input value="${esc(lead.score)}/100" disabled /></div><div class="form-field full"><label>Company and email</label><input value="${esc(lead.company)} · ${esc(lead.email)}" disabled /></div><div class="form-field"><label for="ef-status">CRM status</label><select id="ef-status" name="status" ${readOnly?'disabled':''}>${['new','qualified','contacted','converted','lost'].map(s=>`<option value="${s}" ${lead.status===s?'selected':''}>${prettyStatus(s)}</option>`).join('')}</select></div><div class="form-field"><label>Lead source</label><input value="${esc(lead.source)}" disabled /></div><div class="form-field full"><label for="ef-notes">Internal notes</label><textarea id="ef-notes" name="notes" maxlength="1200" ${readOnly?'disabled':''}>${esc(lead.notes||'')}</textarea></div></div><div id="edit-lead-error" class="form-error hidden"></div></form>`,`${readOnly?'<div class="modal-footer"><button class="primary-button" type="button" id="cancel-edit">Close</button></div>':`<div class="modal-footer"><button class="outline-button" type="button" id="cancel-edit">Cancel</button><button class="primary-button" type="submit" form="edit-lead-form" id="save-edit">Save changes ${icon('arrow-right')}</button></div>`}`);
  applyIcons($('#modal-root'));$('#cancel-edit').addEventListener('click',closeModal);if(!readOnly)$('#edit-lead-form').addEventListener('submit',async event=>{
    event.preventDefault();const fd=new FormData(event.currentTarget);const body={status:fd.get('status'),notes:fd.get('notes')};const button=$('#save-edit');button.disabled=true;button.textContent='Saving…';
    try{await api(`/api/leads/${id}`,{method:'PATCH',body});closeModal();toast('Lead updated','CRM changes saved and recorded in the audit log.');await renderLeads();await refreshDashboard();}
    catch(error){const err=$('#edit-lead-error');err.textContent=error.message;err.classList.remove('hidden');button.disabled=false;button.innerHTML=`Save changes ${icon('arrow-right')}`;applyIcons(button);}
  });
}

async function boot() {
  applyIcons();
  $('#login-form').addEventListener('submit',async event=>{
    event.preventDefault();const email=$('#login-email').value.trim();const password=$('#login-password').value;const button=$('#login-submit');button.disabled=true;button.textContent='Signing in…';$('#login-error').classList.add('hidden');
    try{const result=await api('/api/auth/login',{method:'POST',body:{email,password}});state.user=result.user;$('#auth-screen').classList.add('hidden');$('#app').classList.remove('hidden');updateUserChrome();setActiveView('overview');toast('Welcome back',`Signed in as ${result.user.name}.`);}
    catch(error){showError(error.message);}
    finally{button.disabled=false;button.innerHTML=`Enter workspace ${icon('arrow-up-right')}`;applyIcons(button);}
  });
  $('#toggle-password').addEventListener('click',()=>{const input=$('#login-password');const show=input.type==='password';input.type=show?'text':'password';$('#toggle-password').textContent=show?'Hide':'Show';});
  $('#logout-btn').addEventListener('click',signOut);$('#top-approvals').addEventListener('click',()=>setActiveView('approvals'));
  $$('.nav-item').forEach(el=>el.addEventListener('click',()=>setActiveView(el.dataset.view)));
  $('#open-mobile-nav').addEventListener('click',()=>{$('#sidebar').classList.add('mobile-open');$('#sidebar-scrim').classList.add('visible');});
  $('#close-mobile-nav').addEventListener('click',()=>{$('#sidebar').classList.remove('mobile-open');$('#sidebar-scrim').classList.remove('visible');});
  $('#sidebar-scrim').addEventListener('click',()=>{$('#sidebar').classList.remove('mobile-open');$('#sidebar-scrim').classList.remove('visible');});
  try {
    const health=await fetch('/api/health').then(r=>r.json());
    if(!health.database){$('#login-db-note').textContent=`Database unavailable: ${health.databaseMessage}. Configure .env and run npm run setup.`;$('#login-db-note').classList.remove('hidden');}
  } catch {}
  try {
    const result=await api('/api/auth/me');state.user=result.user;$('#auth-screen').classList.add('hidden');$('#app').classList.remove('hidden');updateUserChrome();setActiveView('overview');
  } catch(error) {
    if(error.status!==401&&error.status!==undefined){showError(error.message);}
  }
}
boot();
