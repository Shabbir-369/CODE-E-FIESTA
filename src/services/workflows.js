import { query } from '../db/pool.js';
import { randomId, decideAction } from '../security.js';
import { assessLeads, fallbackLeadAssessment } from './gemini.js';
import { planLeadWorkflow } from './planner.js';
import { activity, audit } from '../audit.js';

const taskPlan = [
  { agent_name: 'Lead Discovery Agent', task_name: 'Find actionable leads', task_type: 'lead_discovery', planKey: 'discover', always: true },
  { agent_name: 'Lead Qualification Agent', task_name: 'Score and qualify leads', task_type: 'lead_scoring', planKey: 'qualify' },
  { agent_name: 'CRM Update Agent', task_name: 'Apply permitted CRM updates', task_type: 'crm_update', planKey: 'update_crm' },
  { agent_name: 'Follow-up Agent', task_name: 'Prepare personalized follow-up drafts', task_type: 'followup_draft', planKey: 'draft_followups' },
  { agent_name: 'Insights Agent', task_name: 'Summarize results and next steps', task_type: 'report', planKey: 'report' },
];

async function createTask(tenantId, runId, task, input = {}, enabled = true) {
  const id = randomId();
  const status = enabled ? 'running' : 'skipped';
  const skippedOutput = enabled ? {} : { skipped: true, reason: 'Not requested by the validated workflow plan.' };
  await query(
    `INSERT INTO workflow_tasks(id,tenant_id,run_id,agent_name,task_name,task_type,status,input_data,output_data,started_at,finished_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,CASE WHEN $7='running' THEN NOW() ELSE NULL END,CASE WHEN $7='skipped' THEN NOW() ELSE NULL END)`,
    [id, tenantId, runId, task.agent_name, task.task_name, task.task_type, status, JSON.stringify(input), JSON.stringify(skippedOutput)]
  );
  return id;
}
async function finishTask(taskId, tenantId, status, output, errorMessage = null) {
  await query(
    `UPDATE workflow_tasks SET status=$1, output_data=$2::jsonb,error_message=$3,finished_at=NOW() WHERE id=$4 AND tenant_id=$5`,
    [status, JSON.stringify(output || {}), errorMessage, taskId, tenantId]
  );
}
async function noteDenied(tenantId, userId, action, reason, resourceId = null) {
  await audit({ tenantId, userId, actorLabel: 'AI Workforce', action, resourceType: 'workflow_action', resourceId, decision: 'denied', reason });
}
function fillTemplate(value, lead) {
  return String(value || '')
    .replaceAll('{{first_name}}', lead.first_name || 'there')
    .replaceAll('{{company}}', lead.company || 'your team')
    .replaceAll('{{industry}}', lead.industry || 'your industry')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function executeWorkflow({ runId, tenantId, userId, userName, requestText, role, plan: incomingPlan }) {
  const taskIds = {};
  let approvalsCreated = 0;
  let updatesApplied = 0;
  let draftsCreated = 0;
  let leadsProcessed = 0;
  let provider = 'not-used';
  let plan = incomingPlan;
  try {
    if (!plan?.supported) {
      const runMeta = await query(`SELECT plan_data FROM workflow_runs WHERE id=$1 AND tenant_id=$2`, [runId, tenantId]);
      plan = runMeta.rows[0]?.plan_data || planLeadWorkflow(requestText);
    }
    if (!plan?.supported) throw new Error(plan?.reason || 'Unsupported workflow request.');

    await query(`UPDATE workflow_runs SET status='running',started_at=NOW() WHERE id=$1 AND tenant_id=$2`, [runId, tenantId]);
    await activity({ tenantId, runId, actor: userName, eventType: 'workflow_started', title: 'Lead operations workflow started', description: requestText, metadata: { role, plan } });
    for (const task of taskPlan) {
      const enabled = task.always || Boolean(plan[task.planKey]);
      taskIds[task.task_type] = await createTask(tenantId, runId, task, { request: requestText.slice(0, 1000), included_in_plan: enabled }, enabled);
    }

    const discoverySql = plan.new_only
      ? `SELECT * FROM leads WHERE tenant_id=$1 AND status='new' ORDER BY score DESC, created_at ASC LIMIT 20`
      : `SELECT * FROM leads WHERE tenant_id=$1 AND status IN ('new','qualified','contacted') ORDER BY score DESC, created_at ASC LIMIT 20`;
    const leadRows = (await query(discoverySql, [tenantId])).rows;
    leadsProcessed = leadRows.length;
    await finishTask(taskIds.lead_discovery, tenantId, 'completed', { leads_found: leadsProcessed, filter: plan.new_only ? 'new_only' : 'actionable_statuses', planned_operations: plan.operations.filter((item) => item.included).map((item) => item.id) });

    if (!leadRows.length) {
      for (const task of taskPlan.filter((item) => item.task_type !== 'lead_discovery')) {
        if (plan[task.planKey]) await finishTask(taskIds[task.task_type], tenantId, 'completed', { note: 'No actionable leads found; no action was required.' });
      }
      const summary = 'No actionable leads were found. Your CRM was left unchanged.';
      await query(`UPDATE workflow_runs SET status='completed',summary=$1,ai_provider=$2,leads_processed=0,finished_at=NOW() WHERE id=$3 AND tenant_id=$4`, [summary, provider, runId, tenantId]);
      await activity({ tenantId, runId, actor: 'Workflow Engine', eventType: 'workflow_completed', title: 'Workflow completed — no actionable leads', description: summary });
      await audit({ tenantId, userId, actorLabel: userName, action: 'workflow.run', resourceType: 'workflow_run', resourceId: runId, decision: 'completed', reason: 'No actionable leads found.' });
      return;
    }

    const leadsForAi = leadRows.map((lead, index) => ({
      ref: `L${index + 1}`, id: lead.id, first_name: lead.first_name,
      company: lead.company, email: lead.email, title: lead.title, industry: lead.industry,
      source: lead.source, status: lead.status, score: lead.score, estimated_value: Number(lead.estimated_value),
    }));
    let assessmentByRef = new Map();
    if (plan.qualify) {
      const aiResult = await assessLeads(leadsForAi);
      provider = aiResult.provider;
      assessmentByRef = new Map(aiResult.assessments.map((item) => [item.ref, item]));
      await finishTask(taskIds.lead_scoring, tenantId, 'completed', { provider, assessed: aiResult.assessments.length, fallback_reason: aiResult.fallbackReason || null });
    } else {
      assessmentByRef = new Map(leadsForAi.map((lead) => { const assessment = fallbackLeadAssessment(lead); return [lead.ref, { ...assessment, score:Number(lead.score)||30, status:lead.status }]; }));
    }

    let updatedLeads = [];
    if (plan.update_crm) {
      for (const lead of leadsForAi) {
        const assessment = assessmentByRef.get(lead.ref);
        if (!assessment) continue;
        const decision = decideAction({ role, action: 'lead.update' });
        if (decision.decision !== 'allowed') {
          await noteDenied(tenantId, userId, 'lead.update', decision.reason, lead.id);
          continue;
        }
        // Status transitions are deliberately narrow: only score-driven new -> qualified is automatic.
        // Contacted/converted/lost are never inferred from a model response or an email draft.
        const status = lead.status === 'contacted' ? 'contacted' : (lead.status === 'qualified' ? 'qualified' : (lead.status === 'new' && assessment.score >= 55 ? 'qualified' : 'new'));
        const update = await query(
          `UPDATE leads SET score=$1,status=$2,updated_at=NOW(),last_activity_at=NOW()
           WHERE id=$3 AND tenant_id=$4 AND status IN ('new','qualified','contacted') RETURNING id,first_name,last_name,company,email,industry,source,status,score,estimated_value,notes`,
          [assessment.score, status, lead.id, tenantId]
        );
        if (!update.rowCount) continue;
        const fresh = update.rows[0];
        updatedLeads.push({ ...fresh, estimated_value: Number(fresh.estimated_value), ref: lead.ref, reason: assessment.reason, subject: assessment.subject, body: assessment.body });
        updatesApplied++;
        await activity({ tenantId, leadId: lead.id, runId, actor: 'CRM Update Agent', eventType: 'lead_scored', title: `${fresh.company} scored ${fresh.score}/100`, description: `Status: ${fresh.status}. ${assessment.reason}`, metadata: { score: fresh.score, status: fresh.status, provider } });
        await audit({ tenantId, userId, actorLabel: 'CRM Update Agent', action: 'lead.score_status.update', resourceType: 'lead', resourceId: lead.id, decision: 'completed', reason: 'Role permission allowed routine lead qualification update.', metadata: { score: fresh.score, status: fresh.status, provider } });
      }
      await finishTask(taskIds.crm_update, tenantId, 'completed', { records_updated: updatesApplied, action: 'score_and_status_update', mode: 'authorized_auto_execution' });
    } else {
      updatedLeads = leadsForAi.map((lead) => ({ ...assessmentByRef.get(lead.ref), ...lead, score:Number(lead.score)||30, status:lead.status, estimated_value:Number(lead.estimated_value) }));
    }

    const draftIds = [];
    if (plan.draft_followups) {
      const draftTargets = updatedLeads.filter((lead) => ['new','qualified','contacted'].includes(lead.status)).slice(0, 12);
      for (const lead of draftTargets) {
        const permission = decideAction({ role, action: 'email.draft' });
        if (permission.decision !== 'allowed') {
          await noteDenied(tenantId, userId, 'email.draft', permission.reason, lead.id);
          continue;
        }
        const assessment = assessmentByRef.get(lead.ref);
        const subject = fillTemplate(assessment?.subject || `A practical next step for ${lead.company}`, lead).slice(0, 180);
        const body = fillTemplate(assessment?.body || `Hi {{first_name}},\n\nI thought it could be useful to share a few practical ideas for ${lead.company}. Would a short conversation next week be useful?\n\nBest,\nYour business team`, lead).slice(0, 3500);
        const id = randomId();
        await query(
          `INSERT INTO email_drafts(id,tenant_id,lead_id,run_id,to_email,subject,body,status,created_by)
           VALUES($1,$2,$3,$4,$5,$6,$7,'awaiting_approval',$8)`,
          [id, tenantId, lead.id, runId, lead.email, subject, body, userId]
        );
        draftIds.push(id);
        draftsCreated++;
        await activity({ tenantId, leadId: lead.id, runId, actor: 'Follow-up Agent', eventType: 'email_draft_created', title: `Follow-up drafted for ${lead.first_name} at ${lead.company}`, description: 'Draft prepared; no external message has been sent.', metadata: { draft_id: id, status: 'awaiting_approval' } });
      }
      await finishTask(taskIds.followup_draft, tenantId, draftIds.length ? 'awaiting_approval' : 'completed', { drafts_created: draftsCreated, delivery: 'simulated_only', external_messages_sent: 0, approval_required: draftIds.length > 0 });
    }

    if (draftIds.length) {
      // Creating a review request is not delivery; only an admin can decide it.
      const policy = decideAction({ role: 'admin', action: 'email.bulk_dispatch', leadCount: draftIds.length });
      const approvalId = randomId();
      await query(
        `INSERT INTO approvals(id,tenant_id,run_id,action_type,target_type,target_ids,payload,status,requested_by)
         VALUES($1,$2,$3,'email_dispatch','email_draft',$4::jsonb,$5::jsonb,'pending',$6)`,
        [approvalId, tenantId, runId, JSON.stringify(draftIds), JSON.stringify({ count: draftIds.length, policy_decision: policy.decision, description: `Review ${draftIds.length} follow-up draft(s). Approval marks them as simulated-sent; no external email is sent.` }), userId]
      );
      approvalsCreated++;
      await activity({ tenantId, runId, actor: 'Policy Gateway', eventType: 'approval_requested', title: 'Follow-up dispatch approval required', description: `${draftIds.length} draft(s) are waiting for review.`, metadata: { approval_id: approvalId, draft_count: draftIds.length } });
      await audit({ tenantId, userId, actorLabel: 'Policy Gateway', action: 'email.dispatch', resourceType: 'approval', resourceId: approvalId, decision: 'approval_required', reason: 'External communication is blocked until an authorized human approves the exact draft set.', metadata: { draft_count: draftIds.length, simulated_only: true } });
    }

    const qualifiedCount = updatedLeads.filter((lead) => lead.status === 'qualified').length;
    const topLead = [...updatedLeads].sort((a,b) => b.score - a.score)[0];
    const operations = [];
    operations.push(`processed ${leadsProcessed} actionable lead(s)`);
    if (plan.update_crm) operations.push(`updated ${updatesApplied} CRM record(s)`);
    if (plan.draft_followups) operations.push(`prepared ${draftsCreated} follow-up draft(s)`);
    if (plan.report) operations.push(`created an insights summary`);
    if (plan.report) {
      const summary = `Workflow ${operations.join(', ')} and created ${approvalsCreated} approval request(s). ${qualifiedCount} lead(s) are qualified.${topLead ? ` Highest-priority lead: ${topLead.company} (${topLead.score}/100).` : ''} Email delivery is simulated and no external messages were sent.`;
      await finishTask(taskIds.report, tenantId, 'completed', { summary, qualified_count: qualifiedCount, top_lead_company: topLead?.company || null, leads_processed: leadsProcessed, updates_applied: updatesApplied, drafts_created: draftsCreated, approvals_created: approvalsCreated });
    }
    const summary = `Completed: ${operations.join(', ')}. Created ${approvalsCreated} approval request(s). ${qualifiedCount} lead(s) are qualified.${topLead ? ` Highest-priority lead: ${topLead.company} (${topLead.score}/100).` : ''} External messages sent: 0 (simulated delivery only).`;
    const finalStatus = approvalsCreated ? 'completed_with_approval' : 'completed';
    await query(
      `UPDATE workflow_runs SET status=$1,summary=$2,ai_provider=$3,leads_processed=$4,drafts_created=$5,updates_applied=$6,approvals_created=$7,finished_at=NOW()
       WHERE id=$8 AND tenant_id=$9`,
      [finalStatus, summary, provider, leadsProcessed, draftsCreated, updatesApplied, approvalsCreated, runId, tenantId]
    );
    await activity({ tenantId, runId, actor: 'Workflow Engine', eventType: 'workflow_completed', title: 'Lead operations workflow completed', description: summary, metadata: { provider, plan, leads_processed: leadsProcessed, updates_applied: updatesApplied, drafts_created: draftsCreated, approvals_created: approvalsCreated } });
    await audit({ tenantId, userId, actorLabel: userName, action: 'workflow.run', resourceType: 'workflow_run', resourceId: runId, decision: 'completed', reason: 'Workflow completed with policy-gated follow-up approval where required.', metadata: { provider, plan, leads_processed: leadsProcessed, updates_applied: updatesApplied, drafts_created: draftsCreated, approvals_created: approvalsCreated } });
  } catch (error) {
    console.error('[workflow] execution failed:', error.stack || error.message);
    for (const taskId of Object.values(taskIds)) {
      try {
        const current = await query(`SELECT status FROM workflow_tasks WHERE id=$1 AND tenant_id=$2`, [taskId, tenantId]);
        if (current.rows[0]?.status === 'running') await finishTask(taskId, tenantId, 'failed', {}, error.message.slice(0, 500));
      } catch {}
    }
    await query(`UPDATE workflow_runs SET status='failed',error_message=$1,summary=$2,ai_provider=$3,leads_processed=$4,drafts_created=$5,updates_applied=$6,approvals_created=$7,finished_at=NOW() WHERE id=$8 AND tenant_id=$9`,
      [error.message.slice(0, 800), 'Workflow failed. Review the activity log for completed steps; already-committed CRM updates are not automatically rolled back.', provider, leadsProcessed, draftsCreated, updatesApplied, approvalsCreated, runId, tenantId]).catch(() => {});
    await activity({ tenantId, runId, actor: 'Workflow Engine', eventType: 'workflow_failed', title: 'Workflow execution failed', description: error.message.slice(0, 500), metadata: { partial_updates: updatesApplied, drafts_created: draftsCreated } }).catch(() => {});
    await audit({ tenantId, userId, actorLabel: userName, action: 'workflow.run', resourceType: 'workflow_run', resourceId: runId, decision: 'failed', reason: error.message.slice(0, 500), metadata: { partial_updates: updatesApplied, drafts_created: draftsCreated } }).catch(() => {});
  }
}
