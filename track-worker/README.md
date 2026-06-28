# TRACK Worker v2.3

**AI-powered art provenance intelligence for the TRACE ecosystem.**

[![Tests](https://img.shields.io/badge/tests-300%20passing-brightgreen)](https://github.com/geerart/paul-hilse-voice/actions)
[![Version](https://img.shields.io/badge/version-2.3-blue)](https://github.com/geerart/paul-hilse-voice)
[![Cloudflare Workers](https://img.shields.io/badge/deploy-Cloudflare%20Workers-orange)](https://workers.cloudflare.com/)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![ESLint](https://img.shields.io/badge/lint-ESLint%20%2B%20Prettier-purple)](.eslintrc.json)
[![Sentry](https://img.shields.io/badge/monitoring-Sentry-red)](src/sentry.js)

---

## Overview

TRACK is a Cloudflare Worker that powers the art provenance intelligence pipeline for the TRACE system. It monitors Flemish Old Master artworks (Rubens, Van Dyck, Jordaens) across European online marketplaces, classifies listings, scores alerts, matches against a database of missing works, and sends real-time notifications.

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌──────────────┐
│  Search     │────>│  Enrich     │────>│  Score      │────>│  Notify      │
│  (eBay,     │     │  (classify, │     │  (alert     │     │  (Telegram,  │
│   2dehands, │     │   oeuvre,   │     │   level,    │     │   Resend)    │
│   LBC, MP)  │     │   danger)   │     │   periods)  │     │              │
└─────────────┘     └─────────────┘     └─────────────┘     └──────────────┘
```

### Modules (13 source files)

| Module           | Purpose                                         | Lines |
| ---------------- | ----------------------------------------------- | ----- |
| `index.js`       | Main router + timing instrumentation            | 220+  |
| `constants.js`   | Target artists, trigger phrases, keywords       | 140+  |
| `utils.js`       | Shared utilities (hash, CORS, fetch)            | 80+   |
| `ai.js`          | Multi-provider AI with cost-tiered routing      | 160+  |
| `alerts.js`      | Media classification, alert scoring, enrichment | 140+  |
| `provenance.js`  | Danger period analysis, RKD artist lookup       | 120+  |
| `search.js`      | Multi-source marketplace search                 | 280+  |
| `oeuvre.js`      | Missing works database and matching engine      | 200+  |
| `style.js`       | Style database for Flemish Old Masters          | 100+  |
| `saved-finds.js` | Saved finds CRUD + provenance scan              | 160+  |
| `notify.js`      | Telegram + Resend email notifications           | 100+  |
| `watchlist.js`   | Watchlist CRUD, background scanning             | 100+  |
| `report.js`      | HTML report generator                           | 200+  |
| `sentry.js`      | Sentry error tracking wrapper                   | 60+   |

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env
# Fill in your API keys (SENTRY_DSN, ANTHROPIC_API_KEY, etc.)

# Run tests (300 tests, all passing)
npm run test:worker

# Lint & format
npm run lint
npm run format:check

# Local development
npm run dev

# Deploy to Cloudflare Workers
npm run deploy
```

## Test Coverage (300 tests)

```
16 test files · 300 tests · all passing
```

| Test file                      | Tests | Scope                                 |
| ------------------------------ | ----- | ------------------------------------- |
| `utils.test.js`                | 17    | hash, clamp, CORS, markdown           |
| `constants.test.js`            | 8     | Target artists, triggers              |
| `alerts.test.js`               | 13    | classifyMedia, scoreAlert, enrichItem |
| `provenance.test.js`           | 8     | Danger periods, RKD lookup            |
| `ai.test.js`                   | 12    | buildVisionContent, tier routing      |
| `ai.fallback.test.js`          | 5     | Edge cases                            |
| `ai.callai.test.js`            | 43    | Mocked — all provider paths           |
| `risk-scoring.test.js`         | 41    | Pure scoreProvenanceRisk              |
| `saved-finds.test.js`          | 4     | savedFindId                           |
| `oeuvre.test.js`               | 13    | checkOeuvreMatch scoring              |
| `style.test.js`                | 12    | getStyleData                          |
| `report.test.js`               | 10    | handleReport HTML gen                 |
| `search.test.js`               | 8     | aggregateSearch, handleItem           |
| `watchlist.test.js`            | 13    | Background scan, CRUD                 |
| `router-handlers.test.js`      | 51    | All 20+ endpoint routes               |
| `integration-pipeline.test.js` | 31    | Real module integration               |

## API Endpoints

See [docs/api-reference.md](docs/api-reference.md) for full documentation.

| Endpoint           | Method              | Description                                             |
| ------------------ | ------------------- | ------------------------------------------------------- |
| `/health`          | GET                 | Service status, version, season                         |
| `/search`          | GET                 | Multi-source marketplace search                         |
| `/item/:id`        | GET                 | eBay item details                                       |
| `/verify`          | GET                 | Multi-module analysis (classify + score + RKD + danger) |
| `/reference`       | GET                 | RKD artist reference lookup                             |
| `/danger-check`    | GET                 | Provenance danger period analysis                       |
| `/watchlist`       | GET/POST            | Watchlist configuration                                 |
| `/alerts`          | GET                 | Alert history                                           |
| `/visual-screen`   | POST                | AI visual art classification                            |
| `/analyse`         | POST                | Forensic style analysis                                 |
| `/provenance-scan` | POST                | Provenance risk scanning                                |
| `/oeuvre`          | GET                 | Missing works database                                  |
| `/style-database`  | GET                 | Artist period characteristics                           |
| `/saves`           | GET/POST/PUT/DELETE | Saved finds CRUD                                        |
| `/report`          | POST                | HTML report generation                                  |

## AI Tier Routing

| Tier     | Provider          | Cost           | Task                   |
| -------- | ----------------- | -------------- | ---------------------- |
| Economy  | DeepSeek V4 Flash | $0.14/M tokens | Visual screening       |
| Standard | GPT-4.1 Nano      | $0.10/M tokens | Provenance analysis    |
| Premium  | Claude Sonnet 4-6 | $3.00/M tokens | Deep forensic analysis |

Fallback chain: Anthropic → OpenRouter → Gemini (all providers optional)

## Environment Variables

See [.env.example](.env.example) for all required secrets and KV bindings.

## CI/CD

```yaml
lint → test → deploy
```

The GitHub Actions workflow runs ESLint, Prettier, and all 300 tests before deploying to Cloudflare Workers on main branch pushes.

## Load Testing

```bash
# Requires k6: https://k6.io/docs/get-started/installation/
k6 run k6-load-test.js
```

## Monitoring

Sentry error tracking is integrated via `src/sentry.js`. Set `SENTRY_DSN` to enable automatic exception capture with request breadcrumbs.

---

TRACK · Picturia Intelligence Suite · © 2026
