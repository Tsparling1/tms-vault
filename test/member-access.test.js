'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { resendMailer, sendLoginLink, requireMember } = require('../src/member-access');
const { buildSystemPrompt } = require('../src/search');

const admin = (o = {}) => ({
  auth: {
    admin: { generateLink: async (p) => (o.linkError ? { data: null, error: { message: 'no user' } } : { data: { properties: { action_link: 'https://x.supabase.co/auth/v1/verify?token=T&type=magiclink&redirect_to=' + p.options.redirectTo } }, error: null }) },
    getUser: async (t) => (t === 'good' || t === 'closed' ? { data: { user: { email: t === 'good' ? 'Casey@Member.example' : 'gone@member.example' } }, error: null } : { data: null, error: { message: 'bad jwt' } }),
  },
  from: () => ({ select: () => ({ eq: (_c, email) => ({ maybeSingle: async () => ({ data: email === 'casey@member.example' ? { id: 'm1', first_name: 'Casey', last_name: 'Test' } : null }) }) }) }),
});
const res = () => { const r = { code: 200, body: null, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; } }; return r; };

test('the sign-in link is generated for the member and emailed once per minute through the TMS sender', async () => {
  const sent = [];
  const mailer = { configured: () => true, send: async (m, key) => (sent.push({ m, key }), 'e-' + sent.length) };
  const id = await sendLoginLink({ supabaseAdmin: admin(), mailer, email: 'casey@member.example', siteUrl: 'https://vault.example', now: 120000 });
  assert.equal(id, 'e-1');
  assert.deepEqual(sent[0].m.to, ['casey@member.example']);
  assert.match(sent[0].m.text, /redirect_to=https:\/\/vault\.example\/dashboard/);
  assert.match(sent[0].m.html, /Sign in to the Vault/);
  assert.match(sent[0].key, /-2$/, 'idempotency key is per member per minute');
  await assert.rejects(sendLoginLink({ supabaseAdmin: admin({ linkError: true }), mailer, email: 'x@y.example', siteUrl: 's' }), /could not be generated/);
});

test('a provider refusal is an error, never a silent success', async () => {
  const m = resendMailer('re_x', 'Vault <n@example.invalid>', async () => new Response('{}', { status: 422 }));
  await assert.rejects(m.send({ to: ['a@b.example'], subject: 's', text: 't', html: 'h' }, 'k'), /refused the message \(status 422\)/);
  assert.equal(resendMailer('', 'x').configured(), false);
});

test('search is for signed-in, current members only; the name comes from the members table', async () => {
  const mw = requireMember(admin());
  const run = async (auth) => { const r = res(); const req = { headers: auth ? { authorization: auth } : {} }; let passed = false; await mw(req, r, () => { passed = true; }); return { r, req, passed }; };
  assert.equal((await run()).r.code, 401);
  assert.equal((await run('Bearer forged')).r.code, 401);
  const closed = await run('Bearer closed');
  assert.equal(closed.r.code, 403);
  assert.equal(closed.passed, false);
  const ok = await run('Bearer good');
  assert.equal(ok.passed, true);
  assert.deepEqual(ok.req.member, { name: 'Casey Test' });
});

test('the assistant never claims TMS discounts or partnerships, and never quotes unsourced percentages', () => {
  const p = buildSystemPrompt({ name: 'Casey Test' });
  assert.match(p, /Never say or suggest that a member can get a discount, special rate or access through TMS/);
  assert.match(p, /do not claim that none exist either/);
  assert.match(p, /Do not state statistics or percentages .* unless you name the published source/);
});
