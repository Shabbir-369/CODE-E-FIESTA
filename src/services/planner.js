const ACTION_WORDS = /\b(lead|leads|prospect|prospects|customer|customers|crm|pipeline|sales|follow.?up|outreach|qualification|qualify|score|prioriti[sz]e|report|insight|summari[sz]e|overview)\b/i;
const DESTRUCTIVE_OR_PRIVILEGE = /\b(delete|erase|drop|truncate|destroy|payment|pay|wire transfer|transfer funds|grant admin|change permissions|elevate privileges|execute sql|arbitrary sql)\b/i;
const DATA_EXPORT = /\b(export|download)\b.{0,40}\b(?:all|bulk|customer|lead|contact|database|records?|data)\b/i;
const NO_SEND = /\b(?:do not|don't|never|must not|should not|shouldn't|won't)\s+(?:send|dispatch|deliver)\s+(?:any\s+)?(?:emails?|messages?|follow.?ups?)\b/gi;

function removeNegated(text, pattern) {
  return text.replace(pattern, ' [NEGATED_ACTION] ');
}

export function planLeadWorkflow(requestText) {
  const request = String(requestText || '').trim();
  const noSendRemoved = removeNegated(request, NO_SEND);
  const noSend = noSendRemoved !== request;
  if (!request || request.length < 8) return { supported:false, reason:'Please provide a more specific business request.' };
  if (!ACTION_WORDS.test(request)) {
    return { supported:false, reason:'This MVP supports lead management, CRM qualification, follow-up drafting, and lead insights. Please describe one of those outcomes.' };
  }
  if (DESTRUCTIVE_OR_PRIVILEGE.test(request) || DATA_EXPORT.test(request)) {
    return { supported:false, reason:'This request includes a destructive, financial, privilege-changing, or arbitrary-SQL action. That action is outside the MVP allowlist.' };
  }
  const affirmativeSend = !noSend && /\b(send|dispatch|deliver)\b.{0,60}\b(?:email|emails|message|messages|follow.?ups?|customers?|leads?|recipients?)\b/i.test(request);
  if (affirmativeSend) {
    return { supported:false, reason:'External message delivery is not enabled. Ask the workforce to draft follow-ups for human review instead.' };
  }
  const lower = request.toLowerCase();
  const reportOnly = /\b(?:report|summari[sz]e|insight|overview|analy[sz]e)\b.{0,30}\bonly\b/i.test(lower) || /\b(?:only|just)\b.{0,20}\b(?:report|summari[sz]e|insight|overview|analy[sz]e)\b/i.test(lower);
  const mentionsQualification = /\b(qualif\w*|score|rank|prioriti[sz]e|process)\b/i.test(lower);
  const mentionsUpdate = /\b(update|sync|crm|status)\b/i.test(lower);
  const mentionsDraft = /\b(draft|prepare|write|create)\b.{0,35}\b(follow.?up|email|outreach|message)\b/i.test(lower) || /\b(follow.?ups?|outreach)\b/i.test(lower);
  const mentionsReport = /\b(report|summari[sz]e|insight|overview|analy[sz]e)\b/i.test(lower);
  const viewOnly = /\b(show|list|view|display|check)\b/i.test(lower) && !mentionsQualification && !mentionsUpdate && !mentionsDraft;
  const noWrites = /\b(no updates|without changing|do not update|don't update|read.?only)\b/i.test(lower);
  const hasSpecificAction = mentionsQualification || mentionsUpdate || mentionsDraft || mentionsReport;
  const defaultFull = !reportOnly && !viewOnly && !noWrites && !hasSpecificAction;
  const qualify = !reportOnly && !viewOnly && (mentionsQualification || defaultFull);
  const updateCrm = qualify && !noWrites && (mentionsUpdate || mentionsQualification || defaultFull);
  const draftFollowups = !reportOnly && !viewOnly && (mentionsDraft || defaultFull);
  const report = mentionsReport || defaultFull;
  const newOnly = /\b(only|just|exclusively)\s+(the\s+)?new\s+leads\b/i.test(lower);
  const operations = [];
  operations.push({ id:'discover', name:'Find actionable leads', agent:'Lead Discovery Agent', included:true });
  operations.push({ id:'qualify', name:'Score and qualify leads', agent:'Lead Qualification Agent', included:qualify });
  operations.push({ id:'crm', name:'Apply permitted CRM updates', agent:'CRM Update Agent', included:updateCrm });
  operations.push({ id:'drafts', name:'Prepare follow-up drafts', agent:'Follow-up Agent', included:draftFollowups });
  operations.push({ id:'report', name:'Summarize results and next steps', agent:'Insights Agent', included:report });
  if (!qualify && !updateCrm && !draftFollowups && !report) return { supported:false, reason:'No supported lead operation was identified. Ask to qualify leads, draft follow-ups, or summarize the pipeline.' };
  return { supported:true, mode:'lead_operations', new_only:newOnly, qualify, update_crm:updateCrm, draft_followups:draftFollowups, report, operations, note:noSend?'External sending explicitly disabled by request.':'External communication is approval-gated and simulated only.' };
}
