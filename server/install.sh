#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BINARY_NAME="synapse-server"
INSTALL_DIR="$HOME/.local/bin"
PLIST_NAME="leix.synapse.server.plist"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"

echo "==> Building $BINARY_NAME..."
cd "$SCRIPT_DIR"
go build -o "$BINARY_NAME" .

echo "==> Installing binary to $INSTALL_DIR..."
mkdir -p "$INSTALL_DIR"
cp "$BINARY_NAME" "$INSTALL_DIR/$BINARY_NAME"

echo "==> Installing launchd plist..."
mkdir -p "$LAUNCH_AGENTS_DIR"
cp "$PLIST_NAME" "$LAUNCH_AGENTS_DIR/$PLIST_NAME"

echo "==> Reloading launchd service..."
launchctl unload "$LAUNCH_AGENTS_DIR/$PLIST_NAME" 2>/dev/null || true
launchctl load "$LAUNCH_AGENTS_DIR/$PLIST_NAME"

echo "==> Done. Service status:"
launchctl list | grep leix.synapse.server || echo "(not listed yet — may take a moment)"

rm -f $BINARY_NAME