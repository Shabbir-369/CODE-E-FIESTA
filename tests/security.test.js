import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, can, decideAction } from '../src/security.js';
import { fallbackLeadAssessment } from '../src/services/gemini.js';

test('password hashes are salted and verify correctly', async () => {
  const password = 'A-Strong-Test-Password-2026!';
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.notEqual(first, second, 'fresh hashes should use different salts');
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword('wrong-password', first), false);
});

test('password policy rejects short values', async () => {
  await assert.rejects(() => hashPassword('short'), /12 and 200/);
});

test('roles follow default-deny permission policy', () => {
  assert.equal(can('admin','approvals:decide'), true);
  assert.equal(can('sales','approvals:decide'), false);
  assert.equal(can('analyst','workflow:run'), false);
  assert.equal(can('unknown','leads:update'), false);
});

test('bulk dispatch is approval-gated and privileged operations stay blocked', () => {
  assert.equal(decideAction({role:'admin',action:'email.bulk_dispatch',leadCount:6}).decision, 'approval_required');
  assert.equal(decideAction({role:'sales',action:'email.bulk_dispatch',leadCount:6}).decision, 'denied');
  assert.equal(decideAction({role:'admin',action:'lead.delete'}).decision, 'denied');
  assert.equal(decideAction({role:'admin',action:'permission.grant'}).decision, 'denied');
  assert.equal(decideAction({role:'sales',action:'lead.update'}).decision, 'allowed');
});

test('fallback scoring preserves terminal states and returns a usable draft', () => {
  const lead={company:'BluePeak Logistics',source:'Referral',title:'COO',industry:'Logistics',status:'new',score:72};
  const result=fallbackLeadAssessment(lead);
  assert.ok(result.score>=0 && result.score<=100);
  assert.equal(result.status,'qualified');
  assert.match(result.body,/\{\{first_name\}\}/);
  const lost=fallbackLeadAssessment({...lead,status:'lost'});
  assert.equal(lost.status,'lost');
});

test('workflow planner selects task steps and blocks unsupported external actions', async () => {
  const { planLeadWorkflow } = await import('../src/services/planner.js');
  const full = planLeadWorkflow('Qualify actionable leads, update CRM, draft follow-ups, and prepare a report. Do not send emails.');
  assert.equal(full.supported, true);
  assert.equal(full.qualify, true);
  assert.equal(full.update_crm, true);
  assert.equal(full.draft_followups, true);
  assert.equal(full.report, true);
  assert.equal(planLeadWorkflow('Send follow-up emails to every customer').supported, false);
  assert.equal(planLeadWorkflow('Delete the CRM records and export customer data').supported, false);
  const reportOnly = planLeadWorkflow('Prepare a report only on the current lead pipeline');
  assert.equal(reportOnly.supported, true);
  assert.equal(reportOnly.qualify, false);
  assert.equal(reportOnly.draft_followups, false);
  assert.equal(reportOnly.report, true);
});
