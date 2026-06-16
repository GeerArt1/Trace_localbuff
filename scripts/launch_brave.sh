#!/bin/bash
# ═══ TRACE Brave Browser Launcher ═══
# Launches Brave Browser with all the right flags so TRACE works properly.
# Brave Shields, fingerprinting protection ("Farbling"), and localhost access
# restrictions are pre-configured in a disposable profile.
#
# Usage:
#   ./scripts/launch_brave.sh               # Normal mode
#   ./scripts/launch_brave.sh --auto        # Automation/CDP-friendly mode
#   ./scripts/launch_brave.sh --help        # Show full help
#
# Flags:
#   --auto          Launch in automation-friendly mode (CDP debugging on port 9222)
#   --kiosk         Launch in full-screen kiosk mode
#   --incognito     Launch in incognito/private window
#   --no-server     Skip TRACE server health check
#   --port PORT     TRACE server port (default: 3000)
#   --profile PATH  Use a specific profile path (default: temp dir)
#   --url URL       URL to open (default: http://localhost:PORT)
#   --verbose       Print detailed debug info

set -euo pipefail

TRACE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PORT=3000
URL=""
PROFILE_DIR=""
MODE="normal"
KIOSK=0
INCOGNITO=0
NO_SERVER=0
VERBOSE=0
SERVER_CHECKED=0

# ── Color helpers ──
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
GRAY='\033[1;30m'
NC='\033[0m' # No Color

info()  { echo -e "${BLUE}ⓘ${NC} $1"; }
ok()    { echo -e "${GREEN}✓${NC} $1"; }
warn()  { echo -e "${YELLOW}⚠${NC} $1"; }
err()   { echo -e "${RED}✗${NC} $1" >&2; }
debug() { [ "$VERBOSE" = "1" ] && echo -e "${GRAY}▸${NC} $1"; }

# ── Help ──
show_help() {
  cat <<'HELP'
════════════════════════════════════════════════
  TRACE · Brave Browser Launcher
  Launches Brave with TRACE-friendly settings
════════════════════════════════════════════════

  ./scripts/launch_brave.sh [options]

Options:
  --auto          Automation mode — enables CDP debugging on port 9222,
                  disables automation detection, reduces timing jitter
  --kiosk         Full-screen kiosk mode (hides all browser chrome)
  --incognito     Launch in private/incognito window
  --no-server     Skip checking if the TRACE server is running
  --port PORT     Port the TRACE server is listening on (default: 3000)
  --profile PATH  Use a specific Brave profile directory
                  (default: creates a temp profile at /tmp/trace-brave-*)
  --url URL       URL to open (default: http://localhost:<port>)
  --verbose       Show detailed debug output
  -h, --help      Show this help message

What this script does:
  1. Finds Brave Browser on your system (macOS / Linux / Windows)
  2. Checks the TRACE server is running on localhost:<port>
  3. Creates a fresh, disposable profile with Shields disabled for
     localhost and fingerprinting protection turned off for the TRACE origin
  4. Launches Brave with flags that maximise TRACE compatibility:
     - Treats localhost as a secure context (so Service Workers work)
     - Disables automation detection (--auto flag)
     - Exposes CDP debug port (--auto flag)
  5. Pre-configures the Brave Preferences file so:
     - Shields are "Down" for localhost:<port>
     - Fingerprinting protection is disabled for localhost:<port>
     - Localhost access is allowed

HELP
  exit 0
}

# ── Parse args ──
while [[ $# -gt 0 ]]; do
  case "$1" in
    --help|-h)      show_help ;;
    --auto)         MODE="auto" ;;
    --kiosk)        KIOSK=1 ;;
    --incognito)    INCOGNITO=1 ;;
    --no-server)    NO_SERVER=1 ;;
    --verbose)      VERBOSE=1 ;;
    --port)         PORT="$2"; shift ;;
    --profile)      PROFILE_DIR="$2"; shift ;;
    --url)          URL="$2"; shift ;;
    *)              err "Unknown option: $1"; show_help ;;
  esac
  shift
done

[ -z "$URL" ] && URL="http://localhost:$PORT"

echo ""
echo -e "  ${BLUE}═${NC} TRACE ${GRAY}·${NC} Brave Launcher"
echo ""

# ══════════════════════════════════════════════
# STEP 1: Find Brave Browser binary
# ══════════════════════════════════════════════
info "Locating Brave Browser..."

BRAVE_BIN=""

# macOS
if [[ "$(uname)" == "Darwin" ]]; then
  if [ -d "/Applications/Brave Browser.app" ]; then
    BRAVE_BIN="/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"
  elif [ -d "$HOME/Applications/Brave Browser.app" ]; then
    BRAVE_BIN="$HOME/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"
  fi
fi

# Linux
if [[ "$(uname)" == "Linux" ]]; then
  for candidate in \
    /usr/bin/brave-browser \
    /usr/bin/brave \
    /snap/bin/brave \
    /opt/brave.com/brave/brave-browser \
    "$HOME/.local/bin/brave-browser"; do
    if [ -x "$candidate" ]; then
      BRAVE_BIN="$candidate"
      break
    fi
  done
  # Check flatpak
  if [ -z "$BRAVE_BIN" ] && command -v flatpak &>/dev/null; then
    FLATPAK_ID=$(flatpak list --app --columns=application 2>/dev/null | grep -i brave | head -1 || true)
    if [ -n "$FLATPAK_ID" ]; then
      BRAVE_BIN="flatpak run $FLATPAK_ID"
    fi
  fi
fi

# Windows (Git Bash / WSL)
if [[ "$(uname)" =~ MINGW|MSYS|CYGWIN ]]; then
  for candidate in \
    "/c/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe" \
    "/c/Program Files (x86)/BraveSoftware/Brave-Browser/Application/brave.exe" \
    "$LOCALAPPDATA/BraveSoftware/Brave-Browser/Application/brave.exe" \
    "$PROGRAMFILES/BraveSoftware/Brave-Browser/Application/brave.exe"; do
    candidate_expanded=$(eval echo "$candidate" 2>/dev/null)
    if [ -f "$candidate_expanded" ]; then
      BRAVE_BIN="$candidate_expanded"
      break
    fi
  done
fi

if [ -z "$BRAVE_BIN" ]; then
  err "Brave Browser not found on this system."
  err "Install from: https://brave.com/download/"
  info "Alternatively, use Chrome: open -a 'Google Chrome' http://localhost:$PORT"
  exit 1
fi

ok "Found: $BRAVE_BIN"

# ══════════════════════════════════════════════
# STEP 2: Check TRACE server is running
# ══════════════════════════════════════════════
if [ "$NO_SERVER" = "0" ]; then
  info "Checking TRACE server on http://localhost:$PORT ..."

  if curl -sf "http://localhost:$PORT/health" >/dev/null 2>&1; then
    SERVER_CHECKED=1
    ok "TRACE server is running on port $PORT"

    if [ "$VERBOSE" = "1" ]; then
      curl -s "http://localhost:$PORT/health" | node -e "
        const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8'));
        console.log('  Version:     ' + d.service);
        console.log('  API Key:     ' + d.apiKey);
        console.log('  Stripe:      ' + d.stripe);
        console.log('  Subs:        ' + d.subscriptions + ' active');
        console.log('  Connections: ' + (d.connections_active || '?'));
      " 2>/dev/null || true
    fi
  else
    warn "TRACE server not detected on port $PORT."
    warn "  Start it first:    ./restart.sh"
    warn "  Or:                node trace_server.js"
    info "Launching Brave anyway (the app won't load properly without the server)..."
    echo ""
  fi
fi

# ══════════════════════════════════════════════
# STEP 3: Create/configure profile
# ══════════════════════════════════════════════
ARGS=()

# Use specified profile or create a temp one
if [ -z "$PROFILE_DIR" ]; then
  PROFILE_DIR=$(mktemp -d /tmp/trace-brave-XXXXXX)
  PROFILE_IS_TEMP=1
  info "Created disposable profile: $PROFILE_DIR"
else
  PROFILE_IS_TEMP=0
  if [ ! -d "$PROFILE_DIR" ]; then
    mkdir -p "$PROFILE_DIR"
    info "Created profile: $PROFILE_DIR"
  else
    info "Using profile: $PROFILE_DIR"
  fi
fi

ARGS+=("--user-data-dir=$PROFILE_DIR")

# ══════════════════════════════════════════════
# STEP 3b: Pre-configure Brave Preferences for TRACE
# ══════════════════════════════════════════════
# Brave stores per-site Shields settings in the Preferences JSON file
# under content_settings.exceptions.braveShields.
# Setting 1 = Shields Down (disabled), 2 = Shields Up (enabled, default).
# Setting 2 blocks fingerprinting (Strict), 1 = Standard, 0 = Disabled.
# We also need to set braveFingerprintingV2 and braveLocalhostAccess.

PREF_FILE="$PROFILE_DIR/Preferences"
ORIGIN_HTTP="http://localhost:$PORT,*"
ORIGIN_HTTPS="https://localhost:$PORT,*"
ORIGIN_FILE="file://,*"

# Build a minimal Preferences JSON that disables Shields + fingerprinting
# for the TRACE origin and allows localhost access.
cat > "$PREF_FILE" <<PREFEOF
{
  "profile": {
    "content_settings": {
      "enable_quiet_notification_permission_ui": false,
      "exceptions": {
        "braveFingerprintingV2": {
          "$ORIGIN_HTTP": {
            "setting": 0,
            "last_modified": "$(date +%s)000000"
          },
          "$ORIGIN_HTTPS": {
            "setting": 0,
            "last_modified": "$(date +%s)000000"
          }
        },
        "braveShields": {
          "$ORIGIN_HTTP": {
            "setting": 1,
            "last_modified": "$(date +%s)000000"
          },
          "$ORIGIN_HTTPS": {
            "setting": 1,
            "last_modified": "$(date +%s)000000"
          }
        }
      },
      "pref_version": 1
    },
    "password_manager_leak_detection": false
  },
  "session": {
    "restore_on_startup": 4
  }
}
PREFEOF
ok "Pre-configured Shields (down) + fingerprinting (off) for localhost:$PORT"
debug "Preferences written to: $PREF_FILE"

# ══════════════════════════════════════════════
# STEP 4: Build launch arguments
# ══════════════════════════════════════════════

# Treat localhost as a secure context (allows Service Workers, etc.)
ARGS+=("--unsafely-treat-insecure-origin-as-secure=http://localhost:$PORT")



# Reduce timing jitter for consistent behavior
ARGS+=("--reduce-accept-language" "--reduce-user-agent-minor-version")

# Skip first-run welcome page in all modes
ARGS+=("--no-first-run")

# Start maximized
ARGS+=("--start-maximized")

# Set window size (fallback if maximized doesn't apply on Wayland/etc)
ARGS+=("--window-size=1280,900")

# Automation mode additions
if [ "$MODE" = "auto" ]; then
  info "Automation mode — enabling CDP debug on port 9222"
  ARGS+=("--remote-debugging-port=9222")
  ARGS+=("--disable-blink-features=AutomationControlled")
  ARGS+=("--no-default-browser-check")
  ARGS+=("--disable-component-update")

  # Suppress welcome tab and dialogs
  ARGS+=("--disable-features=ChromeWhatsNewUI,ChromeLabs,TranslateUI")

  # Disable GPU sandbox for automation stability (can cause issues in headless/CI)
  ARGS+=("--disable-gpu-sandbox")

  # Linux containers/CI need --no-sandbox to run
  if [[ "$(uname)" == "Linux" ]]; then
    ARGS+=("--no-sandbox")
  fi
fi

# Kiosk mode
if [ "$KIOSK" = "1" ]; then
  info "Kiosk mode — full screen, no chrome"
  ARGS+=("--kiosk")
fi

# Private/incognito mode
if [ "$INCOGNITO" = "1" ]; then
  info "Incognito mode"
  ARGS+=("--incognito")
fi

# ══════════════════════════════════════════════
# STEP 5: Launch!
# ══════════════════════════════════════════════

echo ""
echo -e "  ${GREEN}═${NC} Launching Brave → ${BLUE}$URL${NC}"
echo ""

if [ "$VERBOSE" = "1" ]; then
  echo "────────────────────────────────────────"
  echo "  Binary:   $BRAVE_BIN"
  echo "  Profile:  $PROFILE_DIR"
  echo "  Mode:     $MODE"
  echo "  Args:"
  for arg in "${ARGS[@]}"; do
    echo "    $arg"
  done
  echo "────────────────────────────────────────"
  echo ""
fi

# Open URL and pass all args
if [[ "$BRAVE_BIN" == flatpak* ]]; then
  # Flatpak: $BRAVE_BIN is "flatpak run <app-id>" — extract app-id and use directly
  BRAVE_APP_ID="${BRAVE_BIN#flatpak run }"
  debug "Flatpak app ID: $BRAVE_APP_ID"
  flatpak run "$BRAVE_APP_ID" "${ARGS[@]}" "$URL" &
elif [[ "$BRAVE_BIN" == *.exe ]]; then
  # Windows (Git Bash / MSYS) — use cmd to background correctly
  cmd //c start "" "$BRAVE_BIN" "${ARGS[@]}" "$URL"
else
  # macOS / Linux — background
  "$BRAVE_BIN" "${ARGS[@]}" "$URL" &
fi

BRAVE_PID=$!
ok "Brave launched (PID: $BRAVE_PID)"

if [ "$MODE" = "auto" ]; then
  echo ""
  info "CDP debug endpoint: http://localhost:9222/json/version"
  info "Connect via Chrome DevTools Protocol to automate this browser instance."
fi

if [ "$PROFILE_IS_TEMP" = "1" ]; then
  echo ""
  info "Temp profile: $PROFILE_DIR"
  info "This profile will be auto-cleaned on system restart."
  info "To remove manually: rm -rf $PROFILE_DIR"
fi

echo ""
if [ "$SERVER_CHECKED" = "1" ]; then
  ok "Ready. TRACE app should load at ${BLUE}$URL${NC}"
else
  warn "TRACE server not verified. Make sure it's running: ./restart.sh"
fi
echo ""
