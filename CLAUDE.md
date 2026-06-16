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
- `routes/provenance.js` — Provenance cross-reference: Getty ULAN SPARQL, GPI SPARQL, INTERPOL, ALR, AAMD, UNESCO
- `routes/auth.js` — Auth routes: register, login, verify
- `routes/agent.js` — AI self-healing agent: watchdog reports, auto-fixes, developer reports
```

## Architecture Rules

### API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Server health + config status (API key, Stripe, subscriptions, uptime, memory) |
| GET | `/api/debug` | Full self-diagnosis (memory, rate limits, subscriptions, recent errors, DB file sizes) |
| POST | `/analyse` | Anthropic Claude API proxy for AI analysis |
| POST | `/api/create-checkout-session` | Stripe Checkout session creation (falls back to demo mode) |
| POST | `/api/stripe-webhook` | Stripe webhook handler (signature-verified, auto-generates license keys on payment) |
| POST | `/api/subscribe` | License key creation (requires adminToken matching ADMIN_SECRET) |
| POST | `/api/verify-subscription` | Verify token or license key against HMAC-signed store |
| GET | `/api/subscription-status` | List all active subscriptions (for HQ dashboard) |
| POST | `/api/provenance/cross-reference` | Cross-reference all 5 databases (Getty ULAN + GPI SPARQL, INTERPOL, ALR, AAMD, UNESCO) |
| POST | `/api/provenance/getty-search` | Getty ULAN artist search via public SPARQL (vocab.getty.edu) |
| POST | `/api/provenance/knowledge-graph` | Build provenance graph nodes/edges from timeline data |
| POST | `/api/auth/register` | User registration |
| POST | `/api/auth/login` | User login |
| POST | `/api/auth/verify` | Token verification |
| POST | `/api/agent/report` | Watchdog report ingestion (requires OPS_API_KEY) |
| POST | `/api/agent/auto-fix` | Auto-fix execution (requires OPS_API_KEY) |
| GET | `/api/agent/report` | Developer report (requires OPS_API_KEY) |
| POST | `/api/timeline/save` | Save timeline to server |
| GET | `/api/timeline/list` | List saved timelines |
| POST | `/api/timeline/delete` | Delete timeline from server |
| GET/POST | `/events` | Telemetry event logging |
| POST | `/api/interpol-check` | Legacy cross-reference (INTERPOL/ALR/AAMD/UNESCO) |
| GET | `/api/bulk-export` | Bulk CSV/JSON export for batch scan results |
| GET | `/api/files` | List app files for HQ download (sorted, filtered for size/mtime) |
| GET | `/api/files/:name` | Serve individual app file for download |
| GET | `/api/ops/health-check` | Ops health check (requires OPS_API_KEY) |
| POST/GET | `/api/ops/log` | Ops event logging/listing |
| POST | `/api/ops/auto-fix` | Ops auto-fix execution |
| GET | `/api/ops/report` | Ops report generation |
| GET | `/api/events/stream` | SSE real-time event stream |

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
- Start server: `ADMIN_SECRET=e2e-test-strong-secret-2024 node trace_server.js`
- Health check: `curl http://localhost:3000/health`
- Provenance cross-reference: `curl -X POST http://localhost:3000/api/provenance/cross-reference -H "Content-Type: application/json" -d '{"artist":"Rembrandt","artworkTitle":"The Night Watch","tier":"professional"}'`
- Getty ULAN search: `curl -X POST http://localhost:3000/api/provenance/getty-search -H "Content-Type: application/json" -d '{"query":"Vermeer"}'`
- Knowledge graph: `curl -X POST http://localhost:3000/api/provenance/knowledge-graph -H "Content-Type: application/json" -d '{"title":"Sunflowers","artist":"Van Gogh","timeline":[{"year":"1888","event":"Painted","category":"creation"}]}'`
- Subscription API: `curl -X POST http://localhost:3000/api/subscribe -H "Content-Type: application/json" -d '{"tier":"professional","owner":"Test","adminToken":"your-secret-here"}'`
- Debug: `curl http://localhost:3000/api/debug`
- File listing: `curl http://localhost:3000/api/files`
- Run unit tests: `node tests/test_server_core.js`
- Run provenance tests: `node tests/test_provenance.js`
- Run integration tests: `node tests/test_integration.js`
- Run all unit tests: `node tests/test_all.js`
- Run Playwright e2e tests: `npx playwright test tests/e2e.e2e.test.js tests/provenance.e2e.test.js`

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
ANTHROPIC_API_KEY=sk-ant-...         # Required for AI analysis
ADMIN_SECRET=your-strong-secret-here # Min 16 chars. Weak tokens rejected at startup.
ANALYSE_API_KEY=                     # Auto-generated if not set. Protects /analyse endpoint.
SUBSCRIPTION_SECRET=                 # Auto-generated if not set. Signs subscription tokens.
AUTH_SECRET=                         # Auto-generated if not set. Signs auth tokens.
OPS_API_KEY=                         # If set, used for ops/auth endpoints instead of ANALYSE_API_KEY.
PORT=3000                            # Server port
ALLOWED_ORIGIN=http://localhost:3000  # CORS origin. Wildcard * rejected at startup.
TRACE_LOGGING=                       # 'silent' or '0' suppresses non-ERROR logs.
TRACE_DB_PATH=                       # SQLite DB path (default: ./trace_db.sqlite)
DATABASE_URL=                        # PostgreSQL connection string (optional)
SSL_KEY_PATH=                        # HTTPS key path (enables HTTPS when set with SSL_CERT_PATH)
SSL_CERT_PATH=                       # HTTPS cert path
STATIC_CACHE_TTL=60000               # Static file cache TTL in ms
STRIPE_SECRET_KEY=sk_...             # Optional — enables real Stripe payments
STRIPE_PUBLISHABLE_KEY=pk_...        # Required with STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET=whsec_...      # Required with STRIPE_SECRET_KEY
STRIPE_COLLECTOR_PRICE=price_...     # Stripe price ID for Collector tier
STRIPE_PROFESSIONAL_PRICE=price_...  # Stripe price ID for Professional tier
INTERPOL_API_KEY=                    # Institutional access key for INTERPOL
ALR_API_KEY=                         # Paid subscription for Art Loss Register
WORKERS=1                            # Cluster worker count (cluster mode)
```

### Security Rules
- `ADMIN_SECRET` must be ≥16 characters and not in the weak-token blacklist
- `ALLOWED_ORIGIN=*` triggers a fatal error at startup
- Provenance endpoints are read-only (no CSRF needed, but rate limited)
- State-changing POST endpoints (timeline save/delete, checkout) are CSRF-protected
- `/analyse` endpoint requires `x-api-key` matching `ANALYSE_API_KEY`

## Deployment
- Node.js server, deployable on Railway / Render / Fly.io
- Static files served from project root directory
- Subscription data persisted to `.subscriptions.json` (mount persistent volume in production)
- For production: Set `ADMIN_SECRET` to a strong random value to disable demo key generation
