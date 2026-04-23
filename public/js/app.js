/* ── TMS Vault — Frontend App ──────────────────────────────── */

// ── Member state (populated from Supabase session or stub) ──
const member = {
  name: window.__MEMBER_NAME__ || 'Member',
  businessType: window.__MEMBER_BUSINESS_TYPE__ || null
};

// ── Seed member chip ────────────────────────────────────────
(function initMemberChip() {
  const nameEl = document.getElementById('memberName');
  const avatarEl = document.getElementById('memberAvatar');
  if (!nameEl || !avatarEl) return;
  nameEl.textContent = member.name;
  // Use first letter of first name
  const initial = member.name.trim().charAt(0).toUpperCase();
  avatarEl.textContent = initial;
})();

// ── Member chip dropdown ─────────────────────────────────────
(function initDropdown() {
  const chip = document.getElementById('memberChip');
  const dropdown = document.getElementById('memberDropdown');
  if (!chip || !dropdown) return;

  function open() {
    dropdown.classList.add('open');
    chip.setAttribute('aria-expanded', 'true');
  }
  function close() {
    dropdown.classList.remove('open');
    chip.setAttribute('aria-expanded', 'false');
  }
  function toggle() {
    dropdown.classList.contains('open') ? close() : open();
  }

  chip.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
  chip.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    if (e.key === 'Escape') close();
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!chip.contains(e.target)) close();
  });

  // Log Out links
  const logoutLink = document.getElementById('logoutLink');
  const footerLogout = document.getElementById('footerLogout');
  function doLogout(e) {
    e.preventDefault();
    // Clear any stored session then redirect to root (Supabase signOut wired later)
    window.location.href = '/logout';
  }
  if (logoutLink) logoutLink.addEventListener('click', doLogout);
  if (footerLogout) footerLogout.addEventListener('click', doLogout);
})();

// ── Pills — autofill and submit ──────────────────────────────
(function initPills() {
  const pills = document.querySelectorAll('.pill');
  const input = document.getElementById('searchInput');
  const form = document.getElementById('searchForm');
  if (!pills.length || !input || !form) return;

  pills.forEach((pill) => {
    pill.addEventListener('click', () => {
      const query = pill.dataset.query;
      if (!query) return;
      input.value = query;
      input.focus();
      // Slight delay so user sees fill before submit
      setTimeout(() => form.requestSubmit(), 100);
    });
  });
})();

// ── Simple Markdown renderer (headers, bold, italic, lists) ──
function renderMarkdown(text) {
  // Escape HTML first
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Block rules (process line by line)
  const lines = html.split('\n');
  const out = [];
  let inList = false;
  let listTag = '';

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // ATX headings
    if (/^### (.+)/.test(line)) {
      if (inList) { out.push(`</${listTag}>`); inList = false; }
      out.push(`<h3>${line.replace(/^### /, '')}</h3>`);
      continue;
    }
    if (/^## (.+)/.test(line)) {
      if (inList) { out.push(`</${listTag}>`); inList = false; }
      out.push(`<h2>${line.replace(/^## /, '')}</h2>`);
      continue;
    }
    if (/^# (.+)/.test(line)) {
      if (inList) { out.push(`</${listTag}>`); inList = false; }
      out.push(`<h1>${line.replace(/^# /, '')}</h1>`);
      continue;
    }

    // Unordered list
    if (/^[-*] (.+)/.test(line)) {
      if (!inList || listTag !== 'ul') {
        if (inList) out.push(`</${listTag}>`);
        out.push('<ul>'); inList = true; listTag = 'ul';
      }
      out.push(`<li>${applyInline(line.replace(/^[-*] /, ''))}</li>`);
      continue;
    }

    // Ordered list
    if (/^\d+\. (.+)/.test(line)) {
      if (!inList || listTag !== 'ol') {
        if (inList) out.push(`</${listTag}>`);
        out.push('<ol>'); inList = true; listTag = 'ol';
      }
      out.push(`<li>${applyInline(line.replace(/^\d+\. /, ''))}</li>`);
      continue;
    }

    // Close any open list
    if (inList && line.trim() === '') {
      out.push(`</${listTag}>`); inList = false;
    }

    // Blank line
    if (line.trim() === '') {
      out.push('<br>');
      continue;
    }

    out.push(`<p>${applyInline(line)}</p>`);
  }

  if (inList) out.push(`</${listTag}>`);
  return out.join('\n');
}

function applyInline(text) {
  // Bold **text**
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic *text* or _text_
  text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
  text = text.replace(/_(.+?)_/g, '<em>$1</em>');
  // Code `text`
  text = text.replace(/`(.+?)`/g, '<code>$1</code>');
  return text;
}

// ── Search — SSE streaming ────────────────────────────────────
let activeController = null;

async function runSearch(query) {
  const resultsSection = document.getElementById('resultsSection');
  const resultsCard = document.getElementById('resultsCard');
  const resultsQuery = document.getElementById('resultsQuery');
  const resultsBody = document.getElementById('resultsBody');
  const submitBtn = document.getElementById('searchSubmit');

  if (!resultsSection) return;

  // Cancel any in-flight request
  if (activeController) activeController.abort();
  activeController = new AbortController();

  // Show results area
  resultsSection.hidden = false;
  resultsQuery.textContent = `Results for: "${query}"`;
  resultsBody.className = 'results-body';
  resultsBody.innerHTML = '<span class="cursor"></span>';

  submitBtn.classList.add('loading');
  submitBtn.disabled = true;

  let rawText = '';

  try {
    const response = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, member }),
      signal: activeController.signal
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Server error ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop(); // keep incomplete chunk

      for (const part of parts) {
        const line = part.trim();
        if (!line.startsWith('data:')) continue;
        const json = line.slice(5).trim();
        if (!json) continue;

        let payload;
        try { payload = JSON.parse(json); } catch { continue; }

        if (payload.done) break;
        if (payload.error) throw new Error(payload.error);
        if (payload.chunk) {
          rawText += payload.chunk;
          // Re-render markdown on each chunk
          resultsBody.innerHTML = renderMarkdown(rawText) + '<span class="cursor"></span>';
          // Auto-scroll to keep results in view
          resultsCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }
    }

    // Final render — remove cursor
    resultsBody.innerHTML = renderMarkdown(rawText);

  } catch (err) {
    if (err.name === 'AbortError') return;
    console.error('[search]', err);
    resultsBody.className = 'results-body error';
    resultsBody.textContent = err.message || 'Something went wrong. Please try again.';
  } finally {
    submitBtn.classList.remove('loading');
    submitBtn.disabled = false;
    activeController = null;
  }
}

// ── Form submit ──────────────────────────────────────────────
(function initForm() {
  const form = document.getElementById('searchForm');
  const input = document.getElementById('searchInput');
  if (!form || !input) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const query = input.value.trim();
    if (!query) return;
    runSearch(query);
  });
})();
