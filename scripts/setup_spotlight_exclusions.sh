#!/bin/bash
# ═══ TRACE Spotlight Exclusion Setup ═══
# Run once with sudo to exclude dev/build/cache dirs from Spotlight indexing.
# This prevents post-reboot re-indexing of these directories, saving CPU + disk.
#
# Usage: sudo bash setup_spotlight_exclusions.sh

set -euo pipefail

echo ""
echo "  +-------------------------------------------+"
echo "  |   TRACE Spotlight Exclusion Setup        |"
echo "  |   Excludes build/cache dirs from index   |"
echo "  +-------------------------------------------+"
echo ""

EXCLUDED=()
FAILED=()

exclude() {
  local dir="$1"
  if [ -d "$dir" ]; then
    if sudo mdutil -i off "$dir" 2>/dev/null; then
      echo "  ✅ Excluded: $dir"
      EXCLUDED+=("$dir")
    else
      echo "  ❌ Failed:   $dir"
      FAILED+=("$dir")
    fi
  else
    echo "  ⏭️  Skipped:  $dir (not found)"
  fi
}

# Directories that don't need Spotlight indexing
exclude "$HOME/.npm"
exclude "$HOME/.cache"
exclude "$HOME/paul-hilse-voice/venv"
exclude "$HOME/Library/Caches"

# Verify
echo ""
echo "  -- Verification --"
for dir in "${EXCLUDED[@]}"; do
  status=$(mdutil -s "$dir" 2>/dev/null | grep -o 'Indexing[^.]*\.' || echo "unknown")
  echo "  $dir: $status"
done

echo ""
if [ ${#FAILED[@]} -eq 0 ]; then
  echo "  ✅ All exclusions applied. Reboot for faster startup."
else
  echo "  ⚠️  ${#FAILED[@]} directories could not be excluded."
  for d in "${FAILED[@]}"; do echo "     - $d"; done
fi
echo ""
