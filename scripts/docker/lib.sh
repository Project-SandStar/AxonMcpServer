#!/usr/bin/env bash
# lib.sh - shared helpers for the Docker scripts in this folder.
# Target: a Windows host with Docker Desktop (basws42), reached with
#   ssh -o BatchMode=yes <host>, PowerShell via -EncodedCommand (UTF-16LE base64).
# Project values come from config.sh in the same folder.
# This folder is local only (.git/info/exclude). Do not commit it.
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
# shellcheck source=config.sh
. "$HERE/config.sh"

SSH_HOST="${SSH_HOST:-basws42}"
DOCKER_EXE="${DOCKER_EXE:-C:\\Users\\alper.HQ2\\AppData\\Local\\Programs\\DockerDesktop\\resources\\bin\\docker.exe}"
SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=10 -o ServerAliveInterval=30 -o ServerAliveCountMax=40)
BUILD_DIR_NAME="${BUILD_DIR_NAME:-build-src}"

say()  { printf '==> %s\n' "$*"; }
warn() { printf 'WARN: %s\n' "$*" >&2; }
die()  { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

# PowerShell single-quoted literal.
psq() { local s="$1"; s="${s//\'/\'\'}"; printf "'%s'" "$s"; }

# Lines that PowerShell sends on stderr as CLIXML (progress noise) are dropped.
_ps_filter() { grep -v -e '#< CLIXML' -e '^<Objs ' || true; }

# ps_run [EXTRA] <<'PS' ... PS - run the PowerShell body (stdin) on the host,
# after the optional EXTRA lines. The prelude defines:
#   $d docker.exe, $dir stack folder, $proj compose project, $cf compose file,
#   $app/$nb/$cad/$net container names ($net = network owner <stack>-net), $img image repo, $port/$hpath health URL,
#   functions dk (docker) and dc (docker compose), both merge stderr into
#   plain text lines and keep $LASTEXITCODE.
ps_run() {
  local pre enc body
  body="$(cat)"
  pre="\$ErrorActionPreference='Continue'; \$ProgressPreference='SilentlyContinue'
\$env:DOCKER_BUILDKIT='0'
\$d=$(psq "$DOCKER_EXE"); \$dir=$(psq "${STACK_DIR:-}"); \$proj=$(psq "${COMPOSE_PROJECT:-}")
\$cf=Join-Path \$dir $(psq "${COMPOSE_FILE:-docker-compose.yml}")
\$app=$(psq "${APP_CT:-}"); \$nb=$(psq "${NETBIRD_CT:-}"); \$cad=$(psq "${CADDY_CT:-}"); \$net=$(psq "${NET_CT:-}")
\$extra=$(psq "${EXTRA_CTS:-}"); \$img=$(psq "${IMAGE:-}"); \$port=$(psq "${HEALTH_PORT:-}"); \$hpath=$(psq "${HEALTH_PATH:-/health}")
\$envfile=$(psq "${ENV_FILE:-}"); \$required=$(psq "${REQUIRED_ENV:-}"); \$dockerfile=$(psq "${DOCKERFILE:-Dockerfile}"); \$ctx=$(psq "${BUILD_CONTEXT:-.}")
\$bdir=Join-Path \$dir $(psq "$BUILD_DIR_NAME"); \$timeout=[int]$(psq "${HEALTH_TIMEOUT:-420}")
\$entry=$(psq "${ENTRYPOINT_FILES:-}"); \$images=$(psq "${STATUS_IMAGES:-}")
function dk { & \$d @args 2>&1 | ForEach-Object { \"\$_\" } }
function dc { & \$d compose -p \$proj -f \$cf @args 2>&1 | ForEach-Object { \"\$_\" } }
function Get-SvcMap {
  \$raw = (dc config --format json) -join \"\`n\"; \$i = \$raw.IndexOf('{'); \$m = @{}
  if (\$i -lt 0) { return \$m }
  \$c = \$raw.Substring(\$i) | ConvertFrom-Json
  foreach (\$p in \$c.services.PSObject.Properties) {
    \$cn = \$p.Value.container_name; if (-not \$cn) { \$cn = \"\$proj-\$(\$p.Name)-1\" }
    \$m[\$cn] = \$p.Name }
  return \$m }
"
  enc="$(printf '%s\n%s\n%s\n' "$pre" "${1:-}" "$body" | iconv -f UTF-8 -t UTF-16LE | base64 | tr -d '\n')"
  ssh "${SSH_OPTS[@]}" "$SSH_HOST" "powershell -NoProfile -NonInteractive -EncodedCommand $enc" 2> >(_ps_filter >&2)
}

# scp path for a Windows path: C:\a\b -> C:/a/b
winpath_scp() { printf '%s' "${1//\\//}"; }

# A file that may hold secrets is never packed.
is_secret() {
  case "$1" in
    *.example | *.sample | *.template | *.dist | *.example.* ) return 1 ;;
  esac
  case "/$1" in
    */.env | */.env.* | *.env | *.pem | *.key | *.p12 | *.pfx | */id_rsa* | */id_ed25519* | \
    */.npmrc | */secrets/* | */credentials*.json | *.sqlite | *.sqlite3 | *.db) return 0 ;;
  esac
  local g globs
  # set -f: the globs must match paths, not expand to files in the cwd.
  set -f; read -r -a globs <<<"${PACK_EXCLUDE_GLOBS:-}"; set +f
  for g in ${globs[@]+"${globs[@]}"}; do
    # shellcheck disable=SC2254
    case "$1" in $g) return 0 ;; esac
  done
  return 1
}

# list_files DIR [PATHSPEC...] - NUL list of tracked + untracked non-ignored
# files under DIR (relative to DIR), without secret-like files.
# Sets SKIPPED (count of secret-like files left out).
SKIPPED=0
list_files() {
  local dir="$1" f; shift
  while IFS= read -r -d '' f; do
    [ -f "$dir/$f" ] || continue
    if is_secret "$f"; then SKIPPED=$((SKIPPED + 1)); continue; fi
    printf '%s\0' "$f"
  done < <(git -C "$dir" ls-files -coz --exclude-standard -- "$@")
}

# pack_source OUT.tgz - the build context as a tgz. A project can define
# custom_pack STAGE_DIR in config.sh to fill the folder its own way.
pack_source() {
  local out="$1" st n list
  st="$(mktemp -d)"
  if declare -F custom_pack >/dev/null; then
    custom_pack "$st"
  else
    list="$(mktemp)"; list_files "$REPO" . >"$list"
    rsync -a --from0 --files-from="$list" "$REPO/" "$st/"
    rm -f "$list"
  fi
  n="$(find "$st" -type f | wc -l | tr -d ' ')"
  [ "$n" -gt 0 ] || die "no files to pack in $REPO"
  COPYFILE_DISABLE=1 tar --no-xattrs --no-mac-metadata -czf "$out" -C "$st" .
  rm -rf "$st"
  say "Packed $n files ($(du -h "$out" | cut -f1 | tr -d ' ')), left out $SKIPPED secret-like files"
}

# Short git id of the source, with -dirty when the tree has changes.
source_id() {
  local id; id="$(git -C "$REPO" rev-parse --short=12 HEAD 2>/dev/null || echo unknown)"
  [ -z "$(git -C "$REPO" status --porcelain 2>/dev/null)" ] || id="$id-dirty"
  printf '%s' "$id"
}
