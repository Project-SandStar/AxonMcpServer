#!/usr/bin/env bash
# Full plugin test: build + validate, unit tests against a fake server, then
# live checks against the real server when it is up.
#
#   claudePlugin/scripts/test.sh            everything
#   claudePlugin/scripts/test.sh --unit     no live part
#
#   AXON_URL  real server (default http://localhost:3847)
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(cd "$HERE/.." && pwd)"
AXON_URL="${AXON_URL:-http://localhost:3847}"
UNIT_ONLY=0; [ "${1:-}" = "--unit" ] && UNIT_ONLY=1

printf '== build + validate\n'
node "$HERE/build.mjs" --check

printf '\n== unit tests (fake server)\n'
node --test "$PLUGIN_DIR"/test/*.test.mjs

[ "$UNIT_ONLY" = 1 ] && exit 0

printf '\n== live checks against %s\n' "$AXON_URL"
if ! curl -s -m 3 "$AXON_URL/health" >/dev/null; then
  printf '   server not reachable, live part skipped\n'
  exit 0
fi
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/proj" && : > "$TMP/proj/example.axon"
export CLAUDE_PLUGIN_ROOT="$PLUGIN_DIR/dist" CLAUDE_PLUGIN_DATA="$TMP/data" CLAUDE_PLUGIN_OPTION_SERVER_URL="$AXON_URL"

printf -- '-- SessionStart in a directory with Axon code\n'
printf '{"session_id":"plugin-test","cwd":"%s","hook_event_name":"SessionStart","source":"startup"}' "$TMP/proj" \
  | node "$PLUGIN_DIR/dist/hooks/session-start.mjs" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{ console.log(s.trim()?"   "+JSON.parse(s).hookSpecificOutput.additionalContext:"   (no output)") })'

printf -- '-- UserPromptSubmit hint\n'
printf '{"session_id":"plugin-test","prompt":"commit this axon function to the demo project"}' \
  | node "$PLUGIN_DIR/dist/hooks/prompt-hint.mjs" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{ console.log(s.trim()?"   "+JSON.parse(s).hookSpecificOutput.additionalContext:"   (no hint)") })'

printf -- '-- doctor\n'
node "$PLUGIN_DIR/dist/bin/doctor.mjs" --cwd "$TMP/proj" | sed 's/^/   /' || true
printf '\nlive checks done\n'
