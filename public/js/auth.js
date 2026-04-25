/* TMS Vault — Client-side Auth
 * Loaded on every protected page, after the Supabase CDN script.
 *
 * On every page load:
 *   1. Hides <body> immediately to prevent a flash of placeholder content.
 *   2. Checks the Supabase session (also handles the #access_token URL hash
 *      that Supabase appends on magic-link callback).
 *   3. No session  → redirects to /login (body stays hidden).
 *   4. Valid session → fetches the member's first/last name from the
 *      `members` table, hydrates the member chip, and reveals the page.
 *   5. Wires every <a href="/login"> element as a proper signOut+redirect.
 *   6. Exposes window.__VAULT_MEMBER for app.js search context.
 */
(async function vaultAuth() {
  'use strict';

  const SUPABASE_URL  = 'https://wdwdbdbbcuxbfceulwim.supabase.co';
  const SUPABASE_ANON = 'sb_publishable_7yDTX_g2Yn8YC7UXDS4FPQ_ka4Q23oy';

  // Hide body immediately — prevents flash of placeholder name/content
  document.body.style.visibility = 'hidden';

  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

  // getSession also exchanges any #access_token in the URL hash (magic-link callback)
  const { data: { session } } = await sb.auth.getSession();

  if (!session) {
    window.location.replace('/login');
    return; // body stays hidden — navigating away
  }

  // ── Fetch member profile ──────────────────────────────────────
  const { data: profile } = await sb
    .from('members')
    .select('first_name, last_name')
    .eq('email', session.user.email)
    .maybeSingle();

  const firstName = profile?.first_name || '';
  const lastName  = profile?.last_name  || '';
  const fullName  = [firstName, lastName].filter(Boolean).join(' ') || session.user.email;
  const initial   = (firstName || session.user.email).charAt(0).toUpperCase();

  // ── Hydrate member chip ───────────────────────────────────────
  const nameEl   = document.getElementById('memberName');
  const avatarEl = document.getElementById('memberAvatar');
  if (nameEl)   nameEl.textContent   = fullName;
  if (avatarEl) avatarEl.textContent = initial;

  // ── Expose to app.js search context ──────────────────────────
  window.__VAULT_MEMBER = { name: fullName, email: session.user.email };

  // ── Wire logout ───────────────────────────────────────────────
  // Intercepts every <a href="/login"> and performs a proper Supabase signOut
  document.querySelectorAll('a[href="/login"]').forEach(function (el) {
    el.addEventListener('click', async function (e) {
      e.preventDefault();
      await sb.auth.signOut();
      window.location.replace('/login');
    });
  });

  // ── Reveal page ───────────────────────────────────────────────
  document.body.style.visibility = '';
})();
