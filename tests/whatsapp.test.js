import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWhatsAppPhone, classifyCustomerMessage, createCustomerReply } from '../src/services/whatsapp.js';

test('WhatsApp phones normalize to plus-prefixed digits and reject invalid values', () => {
  assert.equal(normalizeWhatsAppPhone(' +91 (98765) 43210 '), '+919876543210');
  assert.throws(() => normalizeWhatsAppPhone('abc'), /7–15 digits/);
  assert.throws(() => normalizeWhatsAppPhone('123'), /7–15 digits/);
});

test('customer messages classify opt-out, human handoff, sales intent and general query', () => {
  assert.equal(classifyCustomerMessage('STOP'), 'opt_out');
  assert.equal(classifyCustomerMessage('I want to speak to a human'), 'human_handoff');
  assert.equal(classifyCustomerMessage('Can I get a demo and pricing?'), 'sales_interest');
  assert.equal(classifyCustomerMessage('Where is your office?'), 'general_query');
  assert.equal(classifyCustomerMessage('I need to share my OTP'), 'human_handoff');
});

test('opt-out and handoff messages are handled by deterministic policy without an AI call', async () => {
  const stop = await createCustomerReply({ message:'STOP', businessName:'Demo Business' });
  assert.equal(stop.intent, 'opt_out');
  assert.equal(stop.disableBot, true);
  const handoff = await createCustomerReply({ message:'Please connect me to a human', businessName:'Demo Business' });
  assert.equal(handoff.humanHandoff, true);
  assert.match(handoff.reply, /team member/i);
});

test('fallback customer replies do not invent missing prices', async () => {
  const result = await createCustomerReply({ message:'What is your pricing?', businessName:'Demo Business', knowledgeBase:'' });
  assert.equal(result.intent, 'sales_interest');
  assert.equal(result.humanHandoff, true);
  assert.match(result.reply, /verified|team member/i);
});
