#!/usr/bin/env bash
# logs.sh <svc> [lines] - last log lines of one container (default 100).
#   <svc> = app | netbird | caddy | a full container name (for example fantom-receiver)
set -euo pipefail
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

[ $# -ge 1 ] || { sed -n '2,3p' "$0"; exit 1; }
case "$1" in
  -h | --help) sed -n '2,3p' "$0"; exit 0 ;;
  app) CT="$APP_CT" ;;
  netbird) CT="${NETBIRD_CT:-}" ;;
  caddy) CT="${CADDY_CT:-}" ;;
  *) CT="$1" ;;
esac
[ -n "$CT" ] || die "no container for '$1' in config.sh"
LINES="${2:-100}"
case "$LINES" in '' | *[!0-9]*) die "lines must be a number" ;; esac

ps_run "\$t=$(psq "$CT"); \$n=$(psq "$LINES")" <<'PS'
dk logs --timestamps --tail $n $t
if ($LASTEXITCODE -ne 0) { "ERROR: no container $t"; exit 1 }
PS
