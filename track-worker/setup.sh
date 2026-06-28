#!/usr/bin/env bash
# TRACK Worker — one-time setup script
# Run: bash setup.sh
set -e

echo "=== TRACK eBay Proxy — Cloudflare Worker Setup ==="
echo ""

# 1. Check login
echo "[1/5] Checking Cloudflare login..."
npx wrangler whoami || (echo "Not logged in. Run: npx wrangler login" && exit 1)
echo ""

# 2. Create KV namespace
echo "[2/5] Creating KV namespace 'TRACK_TOKEN_CACHE'..."
KV_OUTPUT=$(npx wrangler kv namespace create TRACK_TOKEN_CACHE 2>&1)
echo "$KV_OUTPUT"
KV_ID=$(echo "$KV_OUTPUT" | grep -o '"id": "[^"]*"' | head -1 | sed 's/"id": "//;s/"//')

KV_PREVIEW_OUTPUT=$(npx wrangler kv namespace create TRACK_TOKEN_CACHE --preview 2>&1)
echo "$KV_PREVIEW_OUTPUT"
KV_PREVIEW_ID=$(echo "$KV_PREVIEW_OUTPUT" | grep -o '"id": "[^"]*"' | head -1 | sed 's/"id": "//;s/"//')

echo ""
echo ">>> KV ID:         $KV_ID"
echo ">>> KV Preview ID: $KV_PREVIEW_ID"
echo ""
echo "Now update wrangler.toml with these IDs:"
echo "  id = \"$KV_ID\""
echo "  preview_id = \"$KV_PREVIEW_ID\""
echo ""

# 3. Set secrets
echo "[3/5] Setting secrets (you will be prompted for each value)..."
echo ""
echo "--- EBAY_CLIENT_ID ---"
echo "Get this from: https://developer.ebay.com/my/keys"
npx wrangler secret put EBAY_CLIENT_ID

echo ""
echo "--- EBAY_CLIENT_SECRET ---"
npx wrangler secret put EBAY_CLIENT_SECRET

echo ""
echo "--- ALLOWED_ORIGIN ---"
echo "For local dev use: *"
echo "For production use your domain, e.g.: https://track.yourdomain.com"
npx wrangler secret put ALLOWED_ORIGIN

# 4. Confirm wrangler.toml is updated
echo ""
echo "[4/5] Make sure wrangler.toml has the correct KV IDs (see above), then press ENTER."
read -r

# 5. Deploy
echo "[5/5] Deploying Worker..."
npx wrangler deploy

echo ""
echo "=== Done! Your Worker is live. ==="
echo "Test it: curl 'https://track-ebay-proxy.<your-subdomain>.workers.dev/health'"
