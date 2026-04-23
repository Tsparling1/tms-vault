# TMS Vault — Business Resource Search

Member-facing search page for TMS Solutions Group. Uses Claude (primary) + OpenAI (fallback) to answer business resource questions via streaming SSE.

## Stack
- **Server:** Node.js + Express
- **Frontend:** Static HTML / CSS / JS (no framework)
- **AI:** Anthropic Claude Sonnet (primary), OpenAI GPT-4o (fallback)
- **Auth:** Supabase (session-based member lookup)
- **Deploy:** DigitalOcean Droplet via PM2

---

## Local setup

```bash
git clone https://github.com/Tsparling1/tms-vault.git
cd tms-vault
npm install
cp .env.example .env
# Fill in .env with your API keys
npm run dev        # starts with --watch (auto-reload)
# open http://localhost:3000
```

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key — primary search |
| `OPENAI_API_KEY` | No | OpenAI key — fallback if Claude fails |
| `SUPABASE_URL` | Yes (auth) | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | Yes (auth) | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes (auth) | Supabase service role key (server-side only) |
| `PORT` | No | Defaults to `3000` |
| `NODE_ENV` | No | Set to `production` on droplet |
| `ALLOWED_ORIGIN` | No | CORS origin (defaults to `*`) |

---

## DigitalOcean Droplet deploy

### 1. SSH into your droplet

```bash
ssh root@YOUR_DROPLET_IP
```

### 2. Install Node.js (if not already)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 3. Install PM2 globally

```bash
npm install -g pm2
```

### 4. Clone and configure

```bash
cd /var/www
git clone https://github.com/Tsparling1/tms-vault.git
cd tms-vault
npm install --production
cp .env.example .env
nano .env   # fill in keys
```

### 5. Start with PM2

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup   # follow the printed command to enable on boot
```

### 6. Nginx config snippet

```nginx
server {
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;

        # Required for SSE streaming
        proxy_buffering off;
        proxy_read_timeout 120s;
        proxy_set_header X-Accel-Buffering no;
    }

    listen 443 ssl;
    # ssl_certificate / ssl_certificate_key added by Certbot
}
```

Run `sudo certbot --nginx -d yourdomain.com` for SSL.

### 7. Deploy updates

```bash
cd /var/www/tms-vault
git pull
npm install --production
pm2 restart tms-vault
```

---

## API

### `POST /api/search`
Streams search results as Server-Sent Events.

**Body:**
```json
{
  "query": "small business grants for 2026",
  "member": {
    "name": "Jane Smith",
    "businessType": "service business"
  }
}
```

**Stream events:**
```
data: {"chunk": "Here are some grants..."}
data: {"chunk": " you may qualify for..."}
data: {"done": true}
data: {"error": "message"}  // on failure
```

### `GET /api/health`
Returns API key and Supabase config status.
