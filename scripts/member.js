/**
 * Add or remove ONE Vault member (the operator step for a TMS Solutions
 * customer who chose the Vault). Uses the server's own service-role settings
 * from .env; nothing secret is printed.
 *
 *   node scripts/member.js add    --email owner@example.com [--first Casey] [--last Owner] [--service "TMS Solutions Starter"] --confirm
 *   node scripts/member.js remove --email owner@example.com --confirm   # also deletes their sign-in user
 *   node scripts/member.js show   --email owner@example.com
 *
 * Adding makes the address a member; the member then asks for a sign-in link
 * on the Vault login page (members without a sign-in user get one created).
 * Removing deletes the members row, which ends search access at once (every
 * search re-checks it), and deletes the sign-in user so no session outlives it.
 */
require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');

const [cmd, ...rest] = process.argv.slice(2);
const flag = (n, d = '') => { const i = rest.indexOf('--' + n); return i === -1 ? d : (rest[i + 1] ?? ''); };
const email = flag('email').trim().toLowerCase();
const die = (m) => { console.error(m); process.exit(2); };
if (!['add', 'remove', 'show'].includes(cmd)) die('Use add, remove or show');
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) die('Give --email');
if (cmd !== 'show' && !rest.includes('--confirm')) die('Refusing without --confirm');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function authUser() {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const u = data.users.find((x) => (x.email || '').toLowerCase() === email);
    if (u || data.users.length < 1000) return u || null;
  }
  return null;
}
(async () => {
  const { data: rows, error } = await sb.from('members').select('id,email,services,created_at').ilike('email', email);
  if (error) throw error;
  if (cmd === 'show') {
    const u = await authUser();
    console.log(JSON.stringify({ member: rows[0] ?? null, signInUser: u ? { created: u.created_at, lastSignIn: u.last_sign_in_at } : null }));
  } else if (cmd === 'add') {
    if (rows.length) return console.log(JSON.stringify({ added: false, reason: 'already a member', member: rows[0] }));
    const { data, error: e } = await sb
      .from('members')
      .insert({ email, first_name: flag('first'), last_name: flag('last'), services: flag('service') ? [flag('service')] : [] })
      .select('id,email,services,created_at');
    if (e) throw e;
    console.log(JSON.stringify({ added: true, member: data[0] }));
  } else {
    const { error: e } = await sb.from('members').delete().ilike('email', email);
    if (e) throw e;
    const u = await authUser();
    if (u) { const { error: d } = await sb.auth.admin.deleteUser(u.id); if (d) throw d; }
    const { data: left } = await sb.from('members').select('id').ilike('email', email);
    console.log(JSON.stringify({ removed: rows.length, signInUserDeleted: !!u, remaining: left.length }));
  }
})().catch((e) => { console.error('Failed:', String(e.message || e).slice(0, 200)); process.exit(1); });
