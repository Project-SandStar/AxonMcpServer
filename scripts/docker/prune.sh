#!/usr/bin/env bash
# prune.sh - remove dangling images, old tags and build leftovers.
# Keeps :latest and :previous of every image in config.sh. Never touches volumes.
#   ./prune.sh         show what would go (dry run, the default)
#   ./prune.sh --yes   remove it
set -euo pipefail
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

DO=0
case "${1:-}" in
  --yes) DO=1 ;;
  "" | --dry-run) ;;
  -h | --help) sed -n '2,6p' "$0"; exit 0 ;;
  *) die "unknown option: $1" ;;
esac
[ "$DO" = 1 ] && say "Prune on $SSH_HOST (for real)" || say "Prune on $SSH_HOST (dry run; add --yes to remove)"

ps_run "\$do=$DO" <<'PS'
"--- dangling images"
$dang = dk images -f dangling=true --format '{{.ID}}  {{.CreatedSince}}  {{.Size}}'
if ($dang) { $dang } else { "none" }
"--- old tags (not :latest or :previous)"
$old = @()
foreach ($r in (@($img) + ($images -split ' ') | Where-Object { $_ } | Select-Object -Unique)) {
  foreach ($l in (dk images $r --format '{{.Repository}}:{{.Tag}}')) {
    if ($l -notmatch ':(latest|previous|<none>)$') { $old += $l }
  }
}
if ($old) { $old } else { "none" }
"--- build folder"
$bf = @($bdir, "$bdir.tgz") | Where-Object { Test-Path $_ }
if ($bf) { $bf } else { "none" }
"--- build cache"
dk system df --format '{{.Type}}: {{.Size}} ({{.Reclaimable}} reclaimable)'
if ($do -ne 1) { exit 0 }
"--- removing"
foreach ($t in $old) { dk rmi $t }
dk image prune -f
dk builder prune -f
foreach ($f in $bf) { Remove-Item $f -Recurse -Force; "removed $f" }
dk system df
PS
