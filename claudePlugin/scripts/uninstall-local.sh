#!/usr/bin/env bash
# Remove the Axon MCP plugin and its local marketplace.
#   claudePlugin/scripts/uninstall-local.sh
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(cd "$HERE/.." && pwd)"
[ -f "$PLUGIN_DIR/dist/bin/axon-mcp.mjs" ] || node "$HERE/build.mjs"
exec node "$PLUGIN_DIR/dist/bin/axon-mcp.mjs" disconnect "$@"
