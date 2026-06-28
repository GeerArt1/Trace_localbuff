# Changelog

## v2.2 (June 2026)

### 🏗 Architecture
- **Modular monolith → 12 domain modules**: Split the 2,000+ line `src/index.js` into focused modules:
  `utils.js`, `constants.js`, `ai.js`, `alerts.js`, `provenance.js`, `search.js`,
  `oeuvre.js`, `style.js`, `saved-finds.js`, `notify.js`, `watchlist.js`, `report.js`
- Added `JSDoc` type annotations across all modules
- Added `"type": "module"` to package.json

### 🤖 AI Cost Optimization
- **3 cost tiers**: Economy (DeepSeek V4 Flash, $0.14/M), Standard (GPT-4.1 Nano, $0.10/M), Premium (Claude Sonnet 4-6, $3.00/M)
- **Multi-provider fallback**: Anthropic → OpenRouter → Gemini with automatic failover
- **Task-based routing**: Screening uses economy tier, provenance uses standard, forensic analysis uses premium
- DeepSeek V4 Flash added to frontend model picker

### 🧪 Testing
- Added Vitest test framework
- 4 test suites: `utils`, `constants`, `alerts`, `provenance`, `ai`
- 50+ unit tests covering core classification, scoring, and enrichment logic

### 🔒 Security

### 📋 DevOps
- Added GitHub Actions CI/CD pipeline (lint → deploy)
- Wrangler v4 configuration

## v2.1 (May 2026)

### Features
- Fase 2: Visual screening, style analysis, provenance scanning
- Multi-source search (eBay, LeBonCoin, 2dehands, Marktplaats, Catawiki, Dorotheum)
- Missing works database with APEX alerting
- Saved finds with auto-provenance scanning
- HTML report generation
- Telegram + Resend email notifications
- Seasonal cron scheduling
- Oeuvre matching engine
