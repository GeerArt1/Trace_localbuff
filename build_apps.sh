#!/bin/bash
# Build TRACE.app + TRACE HQ.app for macOS Launchpad
# Usage: bash build_apps.sh
set -e

# ═══ CONFIG ═══
PROJECT_DIR="/Users/gdv/paul-hilse-voice"
APP_DIR="/Applications"
ICON_BUILD="/tmp/trace_icon_build"
TEXT_PCT=16           # Text height as % of icon size
GOLD_R=212; GOLD_G=174; GOLD_B=82

echo "═══════════════════════════════════════"
echo "  TRACE .app Bundle Builder"
echo "═══════════════════════════════════════"

# ── 1. Generate icons ──
echo ""; echo "🎨 Generating icons..."
rm -rf "$ICON_BUILD"
mkdir -p "$ICON_BUILD/TRACE.iconset" "$ICON_BUILD/TRACE_HQ.iconset"

python3 - "$TEXT_PCT" "$GOLD_R" "$GOLD_G" "$GOLD_B" "$ICON_BUILD" << 'PYEOF'
import os, struct, zlib, math, sys

PCT, R, G, B, BASE = int(sys.argv[1]), int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4]), sys.argv[5]

FONT = {
    'T': [0b1111,0b0010,0b0010,0b0010,0b0010,0b0010,0b0010],
    'R': [0b1110,0b1001,0b1001,0b1110,0b1010,0b1001,0b1001],
    'A': [0b0110,0b1001,0b1001,0b1111,0b1001,0b1001,0b1001],
    'C': [0b0111,0b1000,0b1000,0b1000,0b1000,0b1000,0b0111],
    'E': [0b1111,0b1000,0b1000,0b1111,0b1000,0b1000,0b1111],
    'H': [0b1001,0b1001,0b1001,0b1111,0b1001,0b1001,0b1001],
    'Q': [0b0110,0b1001,0b1001,0b1001,0b1001,0b1011,0b0110],
}

def draw_char(pix, ch, ox, oy, s, W, H):
    if ch not in FONT: return
    g = FONT[ch]
    for ri in range(7):
        bits = g[ri]
        for ci in range(4):
            if bits & (1 << (3 - ci)):
                for sy in range(s):
                    for sx in range(s):
                        px, py = ox + ci*s + sx, oy + ri*s + sy
                        if 0 <= px < W and 0 <= py < H: pix[py*W+px] = (R, G, B, 255)

def draw_text(pix, text, cx, y, s, W, H):
    cw = 5 * s; tw = len(text) * cw - s; sx = cx - tw // 2
    for i, ch in enumerate(text): draw_char(pix, ch, sx + i*cw, y, s, W, H)

def draw_bar(pix, y, t, W, H):
    for dy in range(t):
        row = y + dy
        if row < 0 or row >= H: continue
        for x in range(W):
            nx = (x+0.5)/W
            if nx < 0.20: b = (nx/0.20)**2 * (3 - 2*nx/0.20)
            elif nx > 0.80: t2 = (1-nx)/0.20; b = t2*t2*(3-2*t2)
            else: b = 1.0
            if b > 0.005: pix[row*W+x] = (min(255,int(R*b)), min(255,int(G*b)), min(255,int(B*b)), 255)

def make_icon(W, H, label):
    def ck(typ, data):
        c = typ + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)
    pix = [(0,0,0,255)] * (W * H)
    if label and W >= 64:
        th = max(10, int(H * PCT / 100))
        s = max(1, th // 7)
        gap = max(3, s * 2)
        bar_h = max(1, s)
        txt_y = H // 2 - (7 * s) // 2
        draw_bar(pix, txt_y - gap - bar_h, bar_h, W, H)
        draw_text(pix, label, W//2, txt_y, s, W, H)
        draw_bar(pix, txt_y + 7*s + gap, bar_h, W, H)
    rows = []
    for y in range(H):
        row = b'\x00'
        for x in range(W): row += struct.pack('BBBB', *pix[y*W+x][:3], 255)
        rows.append(row)
    raw = b''.join(rows)
    sig = b'\x89PNG\r\n\x1a\n'
    return (sig + ck(b'IHDR', struct.pack('>IIBBBBB', W, H, 8, 6, 0, 0, 0))
            + ck(b'IDAT', zlib.compress(raw)) + ck(b'IEND', b''))

SIZES = [(16,16,'icon_16x16.png'),(32,32,'icon_16x16@2x.png'),(32,32,'icon_32x32.png'),
         (64,64,'icon_32x32@2x.png'),(128,128,'icon_128x128.png'),(256,256,'icon_128x128@2x.png'),
         (256,256,'icon_256x256.png'),(512,512,'icon_256x256@2x.png'),
         (512,512,'icon_512x512.png'),(1024,1024,'icon_512x512@2x.png')]

for w,h,name in SIZES:
    with open(os.path.join(BASE,'TRACE.iconset',name),'wb') as f: f.write(make_icon(w,h,'TRACE'))
    label = 'TRACE HQ' if w >= 128 else 'HQ'
    with open(os.path.join(BASE,'TRACE_HQ.iconset',name),'wb') as f: f.write(make_icon(w,h,label))
print("  Icons generated")
PYEOF

iconutil -c icns "$ICON_BUILD/TRACE.iconset" -o "$ICON_BUILD/TRACE.icns"
iconutil -c icns "$ICON_BUILD/TRACE_HQ.iconset" -o "$ICON_BUILD/TRACE_HQ.icns"
echo "✅ Icons built"

# ── 2. Remove old apps ──
echo ""; echo "🗑  Cleaning old apps..."
for app in "TRACE.app" "TRACE HQ.app" "TRACE Launcher.app"; do
  [ -d "$APP_DIR/$app" ] && rm -rf "$APP_DIR/$app" && echo "   Removed: $app"
done
rm -f "/Users/gdv/Desktop/trace_start.command" 2>/dev/null && echo "   Removed: Desktop launcher" || true
echo "✅ Done"

# ── 3. Build app bundles ──
build_app() {
  local NAME="$1" APATH="$2" ICON="$3" BID="$4" URL="$5"
  mkdir -p "$APATH/Contents/MacOS" "$APATH/Contents/Resources"
  cp "$ICON_BUILD/$ICON" "$APATH/Contents/Resources/AppIcon.icns"
  # Write launcher script (quoted SCRIPT = no expansion at build time)
  cat > "$APATH/Contents/MacOS/$NAME" << 'SCRIPT'
#!/bin/bash
P="/Users/gdv/paul-hilse-voice"; L="/tmp/trace-server.log"
export PATH="/usr/local/bin:/opt/homebrew/bin:/opt/homebrew/sbin:$PATH"
command -v node &>/dev/null || { osascript -e 'display dialog "Node.js not found. Install from https://nodejs.org" buttons {"OK"} default button 1 with icon stop'; exit 1; }
cd "$P/trace"
lsof -ti:3000 &>/dev/null && kill -9 $(lsof -ti:3000) 2>/dev/null && sleep 0.5
echo "Starting TRACE server..." > "$L"
nohup node trace_server.js >> "$L" 2>&1 &
for i in {1..20}; do sleep 0.5; curl -s http://localhost:3000/health >/dev/null 2>&1 && break; done
SCRIPT
  # Append the app-specific URL (can't be in heredoc without expansion)
  echo "open \"$URL\"" >> "$APATH/Contents/MacOS/$NAME"
  chmod +x "$APATH/Contents/MacOS/$NAME"
  # Info.plist
  cat > "$APATH/Contents/Info.plist" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
    <key>CFBundleExecutable</key><string>$NAME</string>
    <key>CFBundleIdentifier</key><string>$BID</string>
    <key>CFBundleName</key><string>$NAME</string>
    <key>CFBundleDisplayName</key><string>$NAME</string>
    <key>CFBundleVersion</key><string>2.0</string>
    <key>CFBundleShortVersionString</key><string>2.0</string>
    <key>CFBundlePackageType</key><string>APPL</string>
    <key>CFBundleIconFile</key><string>AppIcon</string>
    <key>LSRequiresCarbon</key><true/>
    <key>NSHighResolutionCapable</key><true/>
    <key>LSUIElement</key><true/>
</dict></plist>
PLIST
  echo "   ✅ $NAME.app"
}

echo ""; echo "🔨 Building apps..."
build_app "TRACE"    "$APP_DIR/TRACE.app"    "TRACE.icns"    "com.trace.art-intelligence" "http://localhost:3000/"
build_app "TRACE HQ" "$APP_DIR/TRACE HQ.app" "TRACE_HQ.icns" "com.trace.hq"               "http://localhost:3000/trace_hq.html"

# ── 4. Register with Launch Services ──
rm -rf "$ICON_BUILD"
touch "$APP_DIR/TRACE.app" "$APP_DIR/TRACE HQ.app"
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister \
  -f "$APP_DIR/TRACE.app" "$APP_DIR/TRACE HQ.app" 2>/dev/null || true

echo ""; echo "═══════════════════════════════════════"
echo "  ✅ Build complete! TRACE.app + TRACE HQ.app"
echo "  Rebuilt apps in /Applications/"
echo "═══════════════════════════════════════"
