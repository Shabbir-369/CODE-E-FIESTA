import { config } from '../config.js';

function clampScore(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : fallback;
}

export function fallbackLeadAssessment(lead) {
  let score = Number(lead.score) || 30;
  const signals = `${lead.source || ''} ${lead.title || ''} ${lead.industry || ''}`.toLowerCase();
  if (/referral|partner|webinar/.test(signals)) score += 6;
  if (/founder|chief|director|head|revenue|growth|operations/.test(signals)) score += 7;
  if (/demo|pricing|budget|implementation/.test(signals)) score += 5;
  score = Math.max(0, Math.min(100, score));
  let status = lead.status;
  if (status === 'new' && score >= 75) status = 'qualified';
  if (status === 'new' && score >= 55) status = 'qualified';
  return {
    score,
    status,
    reason: score >= 75 ? 'Strong role or source signals suggest prompt sales follow-up.' : score >= 50 ? 'Moderate fit; a personalized follow-up may clarify intent.' : 'Early or lower-confidence lead; nurture with useful context.',
    subject: `A practical next step for ${lead.company}`,
    body: `Hi {{first_name}},\n\nThanks for your interest in ${lead.company}. Based on your team's work in {{industry}}, I thought it could be useful to share a few practical ways to reduce manual lead follow-up and keep your pipeline organized.\n\nWould a short conversation next week be useful?\n\nBest,\nNorthstar Growth Studio`,
  };
}

function parseJson(text) {
  if (!text) throw new Error('Gemini returned an empty response.');
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  try { return JSON.parse(cleaned); } catch {}
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first >= 0 && last > first) return JSON.parse(cleaned.slice(first, last + 1));
  throw new Error('Gemini response was not valid JSON.');
}

export async function assessLeads(leads) {
  if (!config.geminiApiKey) {
    return { provider: 'rules-fallback', assessments: leads.map((lead) => ({ ref: lead.ref, ...fallbackLeadAssessment(lead) })) };
  }
  // Data-minimizing prompt: no customer names, email addresses, phone numbers, free-text notes, or actual DB IDs leave the server.
  const safeLeads = leads.map((lead) => ({
    ref: lead.ref,
    company: lead.company,
    title: lead.title || 'Unknown role',
    industry: lead.industry || 'Unknown industry',
    source: lead.source || 'Unknown source',
    current_status: lead.status,
    current_score: Number(lead.score) || 30,
    value_band: Number(lead.estimated_value) >= 500000 ? 'high' : Number(lead.estimated_value) >= 200000 ? 'medium' : 'low',
  }));
  const input = [
    'You are the lead qualification agent in a permission-controlled business workflow.',
    'Assess only the supplied business metadata. Do not invent facts or imply that a person has consented to contact.',
    'Return only valid JSON with shape: {"assessments":[{"ref":"L1","score":0,"status":"new|qualified|contacted","reason":"brief reason","subject":"email subject with no personal data","body":"short follow-up body using {{first_name}} and {{company}} placeholders; include {{industry}} if useful"}]}.',
    'Score 0-100. Preserve contacted status. Do not change any converted/lost lead; none should be included. Keep messages polite, specific to industry/context, under 110 words, and do not claim previous conversations.',
    'Leads:', JSON.stringify(safeLeads),
  ].join('\n');
  try {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.geminiApiKey },
      body: JSON.stringify({ model: config.geminiModel, input, store: false }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`Gemini API returned HTTP ${response.status}.`);
    const payload = await response.json();
    const parsed = parseJson(payload.output_text || payload.output?.map?.((item) => item.text || '').join('\n'));
    const byRef = new Map(leads.map((lead) => [lead.ref, lead]));
    const received = Array.isArray(parsed.assessments) ? parsed.assessments : [];
    const assessments = leads.map((lead) => {
      const model = received.find((item) => item.ref === lead.ref);
      if (!model) return { ref: lead.ref, ...fallbackLeadAssessment(lead) };
      const fallback = fallbackLeadAssessment(lead);
      const allowedStatus = ['new', 'qualified', 'contacted'].includes(model.status) ? model.status : fallback.status;
      const status = lead.status === 'contacted' ? 'contacted' : allowedStatus;
      const subject = typeof model.subject === 'string' && model.subject.length < 180 ? model.subject : fallback.subject;
      const body = typeof model.body === 'string' && model.body.length >= 20 && model.body.length < 1800 ? model.body : fallback.body;
      return { ref: lead.ref, score: clampScore(model.score, fallback.score), status, reason: typeof model.reason === 'string' ? model.reason.slice(0, 300) : fallback.reason, subject, body };
    });
    return { provider: 'gemini', assessments };
  } catch (error) {
    console.warn('[gemini] falling back to rules:', error.message);
    return { provider: 'rules-fallback', assessments: leads.map((lead) => ({ ref: lead.ref, ...fallbackLeadAssessment(lead) })), fallbackReason: error.message };
  }
}
