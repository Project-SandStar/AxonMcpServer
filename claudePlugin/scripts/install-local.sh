#!/usr/bin/env bash
# Install the Axon MCP Claude Code plugin from this checkout.
#
#   claudePlugin/scripts/install-local.sh [--remove-legacy] [--scope user|project|local] [...]
#
# Builds dist/ and runs `axon-mcp setup` with this directory as the local
# marketplace. All other flags go to the CLI (see dist/bin/axon-mcp.mjs).
# A directory marketplace is read in place: after a rebuild, a new session or
# /reload-plugins is enough.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(cd "$HERE/.." && pwd)"
command -v claude >/dev/null 2>&1 || { echo "claude CLI not found on PATH" >&2; exit 1; }
command -v node   >/dev/null 2>&1 || { echo "node not found on PATH" >&2; exit 1; }
printf '== build dist/\n'
node "$HERE/build.mjs" --check
exec node "$PLUGIN_DIR/dist/bin/axon-mcp.mjs" setup --marketplace "$PLUGIN_DIR" "$@"
