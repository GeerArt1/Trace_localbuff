#!/bin/bash
# TRACE Server Auto-Recovery Script
# Run this to restart the server with health checks and backup verification
# Usage: ./restart.sh [port]

PORT=${1:-3000}
TRACE_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_FILE="$TRACE_DIR/trace_events.log"
HEALTH_ENDPOINT="http://localhost:$PORT/health"

echo "═══ TRACE Server Recovery ═══"
echo "Port: $PORT"
echo "Dir:  $TRACE_DIR"
echo ""

# ── Step 0: Pre-flight memory check ──
if command -v vm_stat &>/dev/null; then
  FREE_PAGES=$(vm_stat 2>/dev/null | awk '/free/ {gsub(/\./,"",$NF); print $NF}' || echo "0")
  FREE_MB=$(echo "$FREE_PAGES" | awk '{printf "%.0f", $1 * 4096 / 1048576}')
  if [ "${FREE_MB:-0}" -lt 200 ] 2>/dev/null; then
    echo "⚠️  Low memory warning: ${FREE_MB}MB free"
    echo "  → Running optimizer before start..."
    if [ -x "$TRACE_DIR/trace_optimize.sh" ]; then
      bash "$TRACE_DIR/trace_optimize.sh" --quiet || true
    fi
  else
    echo "✅ Memory OK (${FREE_MB}MB free)"
  fi
fi
echo ""

# ── Step 1: Kill any existing process on the port ──
echo "[1/4] Checking port $PORT..."
# Try multiple tools to find the process (lsof, fuser, ss)
PID=""
if command -v lsof &>/dev/null; then
  PID=$(lsof -ti:$PORT 2>/dev/null)
elif command -v fuser &>/dev/null; then
  PID=$(fuser $PORT/tcp 2>/dev/null | awk '{print $1}')
elif command -v ss &>/dev/null; then
  PID=$(ss -tlnp "sport = :$PORT" 2>/dev/null | grep -oP 'pid=\K[0-9]+' | head -1)
fi
if [ -n "$PID" ]; then
  echo "  → Process $PID running on port $PORT. Stopping..."
  kill -TERM "$PID" 2>/dev/null
  sleep 1
  # Force kill if still running
  if kill -0 "$PID" 2>/dev/null; then
    echo "  → Force killing..."
    kill -9 "$PID" 2>/dev/null
    sleep 1
  fi
  echo "  ✅ Stopped."
else
  echo "  → No process on port $PORT."
fi

# ── Step 2: Verify subscription database ──
echo "[2/4] Verifying subscription database..."
DB_FILE="$TRACE_DIR/.subscriptions.json"
BAK_FILE="$TRACE_DIR/.subscriptions.json.bak"

if [ -f "$DB_FILE" ]; then
  if node -e "JSON.parse(require('fs').readFileSync('$DB_FILE','utf-8'))" 2>/dev/null; then
    echo "  ✅ Primary DB valid."
  else
    echo "  ⚠️  Primary DB corrupted!"
    if [ -f "$BAK_FILE" ]; then
      if node -e "JSON.parse(require('fs').readFileSync('$BAK_FILE','utf-8'))" 2>/dev/null; then
        cp "$BAK_FILE" "$DB_FILE"
        echo "  ✅ Restored from backup."
      else
        echo "  ❌ Backup also corrupted. Starting fresh."
        rm -f "$DB_FILE" "$BAK_FILE"
      fi
    else
      echo "  ❌ No backup found. Starting fresh."
      rm -f "$DB_FILE"
    fi
  fi
else
  echo "  → No subscription DB (fresh start)."
fi

# ── Step 3: Load environment variables and start server ──
echo "[3/4] Loading environment and starting server..."
cd "$TRACE_DIR"

# Load .env file explicitly — sources all non-comment lines as env vars
if [ -f "$TRACE_DIR/.env" ]; then
  echo "  → Loading .env configuration..."
  set -a
  source "$TRACE_DIR/.env"
  set +a
  echo "  → Environment loaded (AI_PROVIDER=$(grep '^AI_PROVIDER' .env | cut -d= -f2))"
fi

# Cap Node heap at 128MB for this lightweight proxy server
export NODE_OPTIONS="--max-old-space-size=128"

# Use cluster mode by default (self-healing with auto-restart on crash)
CLUSTER_MODE=${CLUSTER_MODE:-1}
if [ "$CLUSTER_MODE" = "1" ]; then
  echo "  → Using cluster mode (self-healing)"
  nohup node trace_cluster.js >> "$LOG_FILE" 2>&1 &
else
  echo "  → Using standalone mode"
  nohup node trace_server.js >> "$LOG_FILE" 2>&1 &
fi
SERVER_PID=$!
echo "  → PID: $SERVER_PID"

# Wait for startup
sleep 3

# ── Step 4: Verify server is running ──
echo "[4/4] Verifying server..."
if curl -sf "$HEALTH_ENDPOINT" > /dev/null 2>&1; then
  echo "  ✅ TRACE server running on port $PORT (PID: $SERVER_PID)"
  echo ""
  curl -s "$HEALTH_ENDPOINT" | node -e "
    const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8'));
    console.log('  Status:     ' + d.status);
    console.log('  Version:    ' + d.service);
    console.log('  API Key:    ' + d.apiKey);
    console.log('  Stripe:     ' + d.stripe);
    console.log('  Subs:       ' + d.subscriptions + ' active');
    console.log('  Uptime:     ' + Math.floor(d.uptime) + 's');
    console.log('  Connections:' + (d.connections_active || '?'));
  "
  echo ""
  echo "═══ Recovery complete ═══"
  exit 0
else
  echo "  ❌ Server failed to start. Check logs:"
  tail -20 "$LOG_FILE" 2>/dev/null || echo "  (no log file)"
  exit 1
fi
