# TMS Vault — Claude Code Instructions

This is the TMS Vault member search app. Claude Code is pre-approved to run the following without per-command confirmation:

## Pre-approved operations
- `git` — any git command (add, commit, push, pull, status, log, diff, branch, checkout)
- `node` — run Node.js scripts
- `npm` — install packages, run scripts
- File read/write/edit operations within this project directory

## Project structure
- `server.js` — Express server, SSE streaming endpoint at POST /api/search
- `src/search.js` — Dual API search (Claude primary, OpenAI fallback)
- `public/index.html` — Single-page frontend
- `public/css/styles.css` — All styles (design tokens at top)
- `public/js/app.js` — Frontend JS (dropdown, pills, SSE stream, markdown render)
- `ecosystem.config.js` — PM2 config for DigitalOcean deploy

## Environment variables
See `.env.example`. Copy to `.env` with real keys. Never commit `.env`.

## Deploy target
DigitalOcean Droplet, managed with PM2. See README.md for full setup steps.
