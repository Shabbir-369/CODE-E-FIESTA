/**
 * Copy/adapt this transport-neutral bridge into your existing Chintu bot.
 * Your bot remains responsible for WhatsApp login/session and sending messages.
 * The AI Workforce server stores conversations and CRM changes.
 *
 * Required Node.js: 20+ (built-in fetch).
 */
export function createWorkforceBridge({ baseUrl, token, sendMessage, logger = console }) {
  if (!baseUrl || !token || typeof sendMessage !== 'function') {
    throw new Error('baseUrl, token, and sendMessage({to, text}) are required.');
  }
  const root = baseUrl.replace(/\/$/, '');
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };

  async function request(route, options = {}) {
    const response = await fetch(`${root}${route}`, { ...options, headers: { ...headers, ...(options.headers || {}) }, signal: AbortSignal.timeout(20_000) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`AI Workforce bridge HTTP ${response.status}: ${data.error || 'request failed'}`);
    return data;
  }

  async function acknowledge(id, status, details = {}) {
    return request(`/api/integrations/whatsapp/messages/${encodeURIComponent(id)}/status`, {
      method: 'POST', body: JSON.stringify({ status, providerMessageId: details.providerMessageId || '', error: details.error || '' }),
    });
  }

  /** Call only for a direct customer DM; filter out own messages, groups, status posts and media-only events first. */
  async function handleIncoming({ from, name = '', text, messageId }) {
    const data = await request('/api/integrations/whatsapp/inbound', {
      method: 'POST', body: JSON.stringify({ from, name, text, messageId }),
    });
    if (data.duplicate || !data.reply || !data.replyMessageId) return data;
    try {
      const sent = await sendMessage({ to: from, text: data.reply });
      const providerMessageId = sent?.key?.id || sent?.id || sent?.messageId || '';
      await acknowledge(data.replyMessageId, 'sent', { providerMessageId });
    } catch (error) {
      await acknowledge(data.replyMessageId, 'failed', { error: String(error?.message || error).slice(0, 350) }).catch(() => {});
      logger.error?.('[ai-workforce] automatic WhatsApp reply failed:', error?.message || error);
    }
    return data;
  }

  /** Poll for replies manually queued in the AI Workforce dashboard. Start this once after Chintu is ready. */
  async function deliverPending() {
    const { messages = [] } = await request('/api/integrations/whatsapp/outbound/pending?limit=10');
    for (const message of messages) {
      try {
        const sent = await sendMessage({ to: message.phone_e164, text: message.body });
        const providerMessageId = sent?.key?.id || sent?.id || sent?.messageId || '';
        await acknowledge(message.id, 'sent', { providerMessageId });
      } catch (error) {
        await acknowledge(message.id, 'failed', { error: String(error?.message || error).slice(0, 350) }).catch(() => {});
        logger.error?.('[ai-workforce] queued WhatsApp reply failed:', error?.message || error);
      }
    }
    return messages.length;
  }

  function startOutboxPoller(intervalMs = 5000) {
    let stopped = false;
    let timer;
    const tick = async () => {
      if (stopped) return;
      try { await deliverPending(); } catch (error) { logger.warn?.('[ai-workforce] outbox poll failed:', error?.message || error); }
      if (!stopped) timer = setTimeout(tick, Math.max(3000, intervalMs));
    };
    timer = setTimeout(tick, 1000);
    return () => { stopped = true; clearTimeout(timer); };
  }

  return { handleIncoming, deliverPending, startOutboxPoller };
}
