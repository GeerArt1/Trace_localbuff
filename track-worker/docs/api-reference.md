# TRACK Worker API Reference v2.2

Base URL: `https://track-ebay-proxy.geerart.workers.dev`

## Authentication

API keys are passed as Cloudflare Worker secrets. No public auth required.

## Endpoints

### Health

**GET /health**

Returns service status, version, and available modules.

```json
{
  "status": "ok",
  "version": "2.2",
  "season": "high|normal",
  "modules": ["ai","alerts","provenance","search","oeuvre","style","saved-finds","notify","watchlist","report"],
  "ai_tiers": ["economy (DeepSeek V4 Flash)","standard (GPT-4.1 Nano)","premium (Claude Sonnet 4-6)"]
}
```

### Search

**GET /search?q=QUERY&sources=SOURCE_LIST&media=MEDIA_FILTER&limit=N**

- `q` (required) — Search query (artist name, title, keywords)
- `sources` — Comma-separated: `ebay,2dehands,marktplaats,leboncoin,catawiki,dorotheum` or `all`
- `media` — Filter: `painting,sketch,drawing,print,plate,tapestry,book`
- `limit` — Max results (1-50, default 20)

Returns enriched items with alert levels, danger periods, and oeuvre matches.

### Watchlist

**GET /watchlist** — Get current watchlist configuration
**POST /watchlist** — Update watchlist (artists, sources, notification settings)

### Alerts

**GET /alerts** — Get alert history (last 50)

### AI Analysis

**POST /visual-screen** `{ image_url }` — Economy tier (DeepSeek). 7-day cached.
  Returns: `{ is_artwork, media_type, confidence, reason }`

**POST /analyse** `{ image_url, artist, media_type, saved_find_id }` — Premium tier (Claude Sonnet).
  Returns: `{ period_estimate, confidence, analysis_text, style_matches, attribution_suggestion, market_value }`

**POST /provenance-scan** `{ description, seller_location, price, media_type }` — Standard tier (GPT-4.1 Nano).
  Returns: `{ signals, danger_period_overlaps, timeline, risk_level, risk_score, seller_questions, gaps }`

### Saved Finds

**POST /saves** `{ url, artist, title, price, image, source, alert_level, media_type, description }` — Save/update
**GET /saves?artist=&status=** — List saved finds
**PUT /saves/:id** `{ notes, status }` — Update
**DELETE /saves/:id** — Archive (soft delete)

### Oeuvre

**GET /oeuvre?artist=rubens|van dyck|jordaens** — Oeuvre statistics and missing works
**GET /style-database?artist=Rubens|Van Dyck|Jordaens** — Period style characteristics

### Reports

**POST /report** `{ id }` — Generate HTML report (returns HTML attachment)
**POST /send-digest** `{ finds }` — Trigger email digest

### Utility

**GET /verify?title=&artist=** — Quick title/artist verification
**GET /reference?artist=** — RKD artist lookup
**GET /danger-check?provenance=&seller_country=** — Danger period check

## AI Model Tiers

| Tier | Screening Model | Cost (in/out per 1M) | Used For |
|------|----------------|----------------------|----------|
| Economy | DeepSeek V4 Flash | $0.14/$0.28 | Visual screening |
| Standard | GPT-4.1 Nano | $0.10/$0.40 | Provenance analysis |
| Premium | Claude Sonnet 4-6 | $3.00/$15.00 | Deep forensic analysis |

Fallback chain: Anthropic → OpenRouter → Gemini

## Error Codes

| Code | Description |
|------|-------------|
| 400 | Missing required parameter |
| 404 | Resource not found |
| 500 | Internal server error |
| 503 | Service unavailable (e.g., no AI provider) |
