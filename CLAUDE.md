# TRACE · Art Intelligence — AI Agent Guide

## Project Overview

TRACE is a web app (`trace.html`) served by a Node.js backend (`trace_server.js`). It uses AI (Anthropic Claude) to identify artworks, build provenance timelines, and cross-reference stolen art databases. Three subscription tiers: Discover (free), Collector (€49/mo), Professional (€299/mo).

## File Map

```
trace.html              ← MAIN APP: HTML + CSS + JS (self-contained)
trace_server.js         ← Backend: API proxy, subscriptions, Stripe, INTERPOL
trace_subscription.js   ← Client: subscription verification, upgrade flow
trace_hq.html           ← Admin panel (146KB, decoupled — files fetched via /api/files)
trace_sw.js             ← Service worker
trace_db.js             ← SQLite database layer
trace_cluster.js        ← Cluster manager (optional)
trace.css               ← Styles
manifest.json           ← PWA manifest
restart.sh              ← Auto-recovery script
routes/                 ← Route modules (subscriptions, timeline, events, ops, patterns)
src/                    ← Client-side JS modules
tests/                  ← Server core unit tests
ops/                    ← Error patterns
scripts/                ← Utility scripts
.subscriptions.json     ← Subscription DB (auto-generated)
.subscriptions.json.bak ← Auto-backup

### Key Modules
- `routes/helpers.js` — Shared HTTP utilities (sendJSON, collectBody, security headers, CSRF)
- `routes/patterns.js` — Shared error-pattern loader (reads ops/error-patterns.json with mtime caching) and event logger (bounded log array); used by both ops.js and agent.js
```

## Architecture Rules

### API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Server health + config status (API key, Stripe, subscriptions, uptime, memory) |
| GET | `/api/debug` | Full self-diagnosis (memory, rate limits, subscriptions, recent errors, DB file sizes) |
| POST | `/api/create-checkout-session` | Stripe Checkout session creation (falls back to demo mode) |
| POST | `/api/stripe-webhook` | Stripe webhook handler (signature-verified, auto-generates license keys on payment) |
| POST | `/api/subscribe` | License key creation (requires adminToken matching ADMIN_SECRET) |
| POST | `/api/verify-subscription` | Verify token or license key against HMAC-signed store |
| GET | `/api/subscription-status` | List all active subscriptions (for HQ dashboard) |
| POST | `/api/interpol-check` | Cross-reference INTERPOL/ALR/AAMD/UNESCO databases |
| POST | `/analyse` | Anthropic Claude API proxy for AI analysis |
| GET/POST | `/events` | Telemetry event logging |
| GET | `/api/bulk-export` | Bulk CSV/JSON export for batch scan results |
| GET | `/api/files` | List app files for HQ download (sorted, filtered for size/mtime) |
| GET | `/api/files/:name` | Serve individual app file for download |

### Critical: Never modify these without understanding the full chain:
- `TIERS` config object in `trace.html` — drives ALL feature gating per tier
- `TRACE_SUB` module in `trace_subscription.js` — subscription verification on every page load
- `handleSubscribe` in `trace_server.js` — requires `adminToken` matching `ADMIN_SECRET`
- HMAC token signing/verification in `trace_server.js` — all subscription tokens are signed with `SUBSCRIPTION_SECRET`

### Subscription Security Model:
1. License keys (`TRACE-XXXX-XXXX-XXXX-XXXX`) are created ONLY via:
   - HQ admin panel (production) with `ADMIN_SECRET`
   - Stripe Checkout webhook (production, when `STRIPE_SECRET_KEY` is set)
   - Demo key button in upgrade dialog (local dev only, uses default admin token)
2. The main app (`trace_subscription.js`) can NEVER create keys — it can only verify them via `/api/verify-subscription`
3. Tokens are HMAC-SHA256 signed and stored in `sessionStorage`
4. License keys are stored in `localStorage`
5. Server verifies both on each page load

### Coding Conventions:
- **Single-file philosophy**: All UI logic stays in `trace.html`. Server logic in `trace_server.js`. Client modules in separate `.js` files.
- **No build step**: Vanilla JS, no bundlers, no TypeScript compilation
- **CSS variables**: Tier colors via `--accent`, `--gold`, `--bg`, `--surface`, `--text` — never hardcode
- **Tier overrides**: `body.tier-professional` and `body.tier-discover` CSS overrides the default Collector palette
- **No jQuery**: Vanilla DOM APIs only
- **No external runtime deps**: Everything is self-contained. Only Google Fonts loaded from CDN.
- **Error handling**: Every API call has a try/catch. Errors surface via `toast()` or the `err-box`.
- **HQ decoupled**: `trace_hq.html` fetches file listings dynamically from `/api/files` endpoint instead of embedding base64 blobs.

### Adding a New Feature:
1. Add screen HTML in `trace.html` (follow `<div class="screen" id="s-{name}">` pattern)
2. Add to `ALL_SCREENS` array
3. Add nav entry in each tier's `nav:` array in `TIERS` config
4. Add icon in `ICONS` object
5. Add tier gating via `cfg.hasX` flags
6. Handle visibility in `setTier()` function

### Testing:
- Start server: `node trace_server.js`
- Health check: `curl http://localhost:3000/health`
- Subscription API: `curl -X POST http://localhost:3000/api/subscribe -H "Content-Type: application/json" -d '{"tier":"professional","owner":"Test","adminToken":"trace-admin-demo-2024"}'`
- Debug: `curl http://localhost:3000/api/debug`
- File listing: `curl http://localhost:3000/api/files`
- Run unit tests: `node tests/test_server_core.js`

## Common Issues & Fixes

### "EADDRINUSE" when starting server
```bash
lsof -ti:3000 | xargs kill -9 && node trace_server.js
```

### Subscription verification fails
- Check server is running: `curl http://localhost:3000/health`
- Check `.subscriptions.json` exists and is valid JSON
- Check ADMIN_SECRET matches between server and client (demo: `trace-admin-demo-2024`)

### API calls fail
- Check `ANTHROPIC_API_KEY` is set as environment variable
- Check rate limit (30 req/min per IP)
- Check request body doesn't exceed 10MB

### Backup recovery
Subscriptions are auto-backed up to `.subscriptions.json.bak` on every write.
To restore: `cp .subscriptions.json.bak .subscriptions.json`

## Environment Variables
```
ANTHROPIC_API_KEY=sk-ant-...     # Required for AI analysis
STRIPE_SECRET_KEY=sk_live_...    # Optional — enables real payments
STRIPE_PUBLISHABLE_KEY=pk_live_... # Required with Stripe
STRIPE_WEBHOOK_SECRET=whsec_...  # Required with Stripe
ADMIN_SECRET=your-secret-here    # Override default demo admin token
SUBSCRIPTION_SECRET=             # Auto-generated if not set
ALLOWED_ORIGIN=*                 # CORS origin
PORT=3000                        # Server port
```

## Deployment
- Node.js server, deployable on Railway / Render / Fly.io
- Static files served from project root directory
- Subscription data persisted to `.subscriptions.json` (mount persistent volume in production)
- For production: Set `ADMIN_SECRET` to a strong random value to disable demo key generation
