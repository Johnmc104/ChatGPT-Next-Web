#!/bin/bash
# Ensure we're running on a compatible Node.js version for Next.js 16.
# Node 26 is the current project target; newer majors are held back
# until the framework and native dependencies are verified together.

REQUIRED_MAJOR=26

current_major=$(node -v | sed 's/v\([0-9]*\).*/\1/')

if [ "$current_major" -gt 26 ] 2>/dev/null; then
  echo "[ensure-node] Node.js v$(node -v | tr -d 'v') is newer than the verified Node 26 line."
  echo "[ensure-node] Switching to Node $REQUIRED_MAJOR via nvm..."

  # Try common nvm locations
  NVM_SH=""
  for candidate in \
    "$NVM_DIR/nvm.sh" \
    "$HOME/nvm/nvm.sh" \
    "$HOME/.nvm/nvm.sh" \
    "/usr/local/share/nvm/nvm.sh" \
    "/home/codespace/nvm/nvm.sh"; do
    if [ -f "$candidate" ]; then
      NVM_SH="$candidate"
      break
    fi
  done

  if [ -z "$NVM_SH" ]; then
    echo "[ensure-node] ERROR: nvm not found. Please install Node $REQUIRED_MAJOR manually."
    echo "  nvm install $REQUIRED_MAJOR && nvm use $REQUIRED_MAJOR"
    exit 1
  fi

  export NVM_DIR="$(dirname "$NVM_SH")"
  # shellcheck disable=SC1090
  . "$NVM_SH"

  # Install if not present
  if ! nvm ls "$REQUIRED_MAJOR" >/dev/null 2>&1; then
    echo "[ensure-node] Installing Node $REQUIRED_MAJOR..."
    nvm install "$REQUIRED_MAJOR"
  fi

  nvm use "$REQUIRED_MAJOR"
  echo "[ensure-node] Now using Node $(node -v)"
fi

# Execute the actual command passed as arguments
exec "$@"
