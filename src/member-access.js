'use strict';
/**
 * Member access for the Vault.
 *
 * - Sign-in links are generated with the service role and emailed through
 *   Resend (a TMS-owned, send-only key), so each one has a provider id and
 *   delivery events instead of disappearing into an unobservable mailer.
 * - Search requires the member's own session token AND a current members row,
 *   checked on every request: removing the row ends access at once.
 */

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const mask = (email) => email.replace(/^(.).*(@.*)$/, '$1***$2');

function resendMailer(key, from, fetchImpl = fetch) {
  return {
    configured: () => !!key && !!from,
    async send(msg, idempotencyKey) {
      const r = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({ from, ...msg }),
      });
      if (!r.ok) throw new Error('mail provider refused the message (status ' + r.status + ')');
      const d = await r.json();
      if (!d || typeof d.id !== 'string') throw new Error('mail provider returned no message id');
      return d.id;
    },
  };
}

/** Generates the member's magic link and emails it. Returns the provider message id. */
async function sendLoginLink({ supabaseAdmin, mailer, email, siteUrl, now = Date.now() }) {
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: siteUrl + '/dashboard' },
  });
  const link = data && data.properties && data.properties.action_link;
  if (error || !link) throw new Error('sign-in link could not be generated' + (error ? ': ' + error.message : ''));
  const text = [
    'Here is your sign-in link for the TMS Solutions Vault:',
    link,
    'The link works once and expires in one hour. If you did not ask for it, you can ignore this email.',
    'TMS Solutions Group',
  ].join('\n\n');
  const html =
    '<div style="font-family:Arial,sans-serif;line-height:1.6"><p>Here is your sign-in link for the TMS Solutions Vault:</p>' +
    '<p><a href="' + esc(link) + '">Sign in to the Vault</a></p>' +
    '<p>The link works once and expires in one hour. If you did not ask for it, you can ignore this email.</p><p>TMS Solutions Group</p></div>';
  // One send per member per minute, whatever retries happen.
  const key = 'vault-login-' + Buffer.from(email).toString('hex').slice(0, 40) + '-' + Math.floor(now / 60000);
  const id = await mailer.send({ to: [email], subject: 'Your TMS Solutions Vault sign-in link', text, html }, key);
  console.log('[login-request] sign-in link sent to ' + mask(email) + ' resend ' + id);
  return id;
}

/** Express middleware: a signed-in, current member, or 401/403. Sets req.member. */
function requireMember(supabaseAdmin) {
  return async (req, res, next) => {
    const h = String(req.headers.authorization || '');
    const token = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
    if (!token) return res.status(401).json({ error: 'Please sign in to search the Vault.' });
    let user;
    try {
      const { data, error } = await supabaseAdmin.auth.getUser(token);
      user = !error && data && data.user;
    } catch {
      user = null;
    }
    if (!user || !user.email) return res.status(401).json({ error: 'Your sign-in has expired. Please sign in again.' });
    const { data: member } = await supabaseAdmin
      .from('members')
      .select('id, first_name, last_name')
      .eq('email', user.email.toLowerCase())
      .maybeSingle();
    if (!member) return res.status(403).json({ error: "We don't have a membership on file for that email. Please contact TMS." });
    req.member = { name: [member.first_name, member.last_name].filter(Boolean).join(' ') || user.email };
    next();
  };
}

module.exports = { resendMailer, sendLoginLink, requireMember, mask };
