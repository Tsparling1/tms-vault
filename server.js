require('dotenv').config();

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { handleSearch } = require('./src/search');

const app = express();
const PORT = process.env.PORT || 3099;

// ── Middleware ──────────────────────────────────────────────────────────────

app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*' }));
app.use(express.json({ limit: '50kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Rate limiting — 20 search requests per minute per IP
const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please wait a moment and try again.' }
});

// ── API Routes ──────────────────────────────────────────────────────────────

/**
 * POST /api/search
 * Body: { query: string, member: { name: string, businessType?: string } }
 * Streams: text/event-stream — data: { chunk: string } | data: { done: true } | data: { error: string }
 */
app.post('/api/search', searchLimiter, async (req, res) => {
  const { query, member } = req.body;

  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    return res.status(400).json({ error: 'Query is required.' });
  }
  if (query.length > 2000) {
    return res.status(400).json({ error: 'Query is too long (max 2000 characters).' });
  }

  // Set up SSE for streaming
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    await handleSearch(query.trim(), member || {}, send);
    send({ done: true });
  } catch (err) {
    console.error('[/api/search] Error:', err.message);
    send({ error: 'Search failed. Please try again.' });
  } finally {
    res.end();
  }
});

/**
 * POST /api/login-request
 * Body: { email: string }
 * 1. Validates the email exists in the members table (service-role client).
 * 2. Sends a Supabase magic-link OTP to that address.
 * Returns: { success: true } | { error: string }
 */
const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please wait a minute and try again.' }
});

app.post('/api/login-request', loginLimiter, async (req, res) => {
  const email = (typeof req.body?.email === 'string' ? req.body.email : '').trim().toLowerCase();

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Email is required.' });
  }

  const { supabaseAdmin, supabaseAnon } = require('./src/supabase-admin');

  // Gate: only pre-registered members may receive a magic link
  const { data: member } = await supabaseAdmin
    .from('members')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (!member) {
    return res.status(403).json({
      error: "We don't have a membership on file for that email. Please contact TMS."
    });
  }

  const siteUrl = process.env.SITE_URL || 'http://localhost:3099';

  const { error: otpError } = await supabaseAnon.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${siteUrl}/dashboard` }
  });

  if (otpError) {
    console.error('[login-request] OTP error:', otpError.message);
    return res.status(500).json({ error: 'Failed to send login link. Please try again.' });
  }

  res.json({ success: true });
});

/**
 * GET /api/health
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    claude: !!process.env.ANTHROPIC_API_KEY,
    openai: !!process.env.OPENAI_API_KEY,
    supabase: !!process.env.SUPABASE_URL
  });
});

// ── Page routes ─────────────────────────────────────────────────────────────

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/overhead-optimizer', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'overhead-optimizer.html'));
});

app.get('/revenue-maximizer', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'revenue-maximizer.html'));
});

app.get('/ai-strategy', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'ai-strategy.html'));
});

app.get('/operational-efficiency', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'operational-efficiency.html'));
});

app.get('/digital-marketing', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'digital-marketing.html'));
});

app.get('/tools', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'tools.html'));
});

app.get('/weekly-vault-updates', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'weekly-vault-updates.html'));
});

// ── Catchall — serve frontend ───────────────────────────────────────────────
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start ───────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`TMS Vault running on http://localhost:${PORT}`);
  console.log(`Claude API: ${process.env.ANTHROPIC_API_KEY ? 'configured' : 'MISSING'}`);
  console.log(`OpenAI API: ${process.env.OPENAI_API_KEY ? 'configured' : 'not set (fallback disabled)'}`);
  console.log(`Supabase:   ${process.env.SUPABASE_URL ? 'configured' : 'not set (auth stubbed)'}`);
});
