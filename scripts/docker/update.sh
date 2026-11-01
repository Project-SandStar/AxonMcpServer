#!/usr/bin/env bash
# update.sh - build a new app image on the Docker host and restart the stack.
# Runs on this Mac. Values come from config.sh (host, stack folder, names).
#
#   ./update.sh              pack source, copy, build, tag old image :previous,
#                            recreate app + netbird + caddy, wait for /health
#   ./update.sh --dry-run    check the host and show the plan; change nothing
#   ./update.sh --no-build   recreate the containers from the current :latest
#   ./update.sh --rollback   tag :previous as :latest, recreate, wait for /health
#
# Never runs `down` or removes volumes (NetBird keys, caches, mirror data).
set -euo pipefail
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

DRY=0; BUILD=1; ROLLBACK=0
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1 ;;
    --no-build) BUILD=0 ;;
    --rollback) ROLLBACK=1; BUILD=0 ;;
    -h | --help) sed -n '2,13p' "$0"; exit 0 ;;
    *) die "unknown option: $1 (try --help)" ;;
  esac
  shift
done

[ -n "${STACK_DIR:-}" ] || die "STACK_DIR is empty in config.sh"
MODE="update"; [ "$BUILD" = 0 ] && MODE="restart only (--no-build)"; [ "$ROLLBACK" = 1 ] && MODE="rollback to :previous"
say "$NAME on $SSH_HOST:$STACK_DIR ($MODE)"
say "Image $IMAGE:latest, containers: $APP_CT ${NETBIRD_CT:-} ${CADDY_CT:-}"

# ---- 1. preflight (read only) -----------------------------------------------
say "Check the host"
ps_run "" <<'PS' || die "preflight failed"
if (-not (Test-Path $cf)) { "ERROR: compose file $cf is missing"; exit 3 }
$m = Get-SvcMap
if ($m.Count -eq 0) { "ERROR: docker compose config failed for $cf"; exit 3 }
"compose services: " + (($m.GetEnumerator() | Sort-Object Name | ForEach-Object { "$($_.Value) ($($_.Key))" }) -join ", ")
foreach ($c in @($app, $nb, $cad)) { if ($c -and -not $m.ContainsKey($c)) { "WARN: container $c is not in $cf (it will be skipped)" } }
if ($envfile) {
  $ef = Join-Path $dir $envfile
  if (-not (Test-Path $ef)) { "WARN: env file $ef is missing" }
  else {
    foreach ($r in ($required -split ' ')) {
      if (-not $r) { continue }
      if ($r -like '*=*') { $ok = Select-String -Path $ef -Pattern ('^' + [regex]::Escape($r) + '\s*$') -Quiet }
      else { $ok = Select-String -Path $ef -Pattern ('^' + [regex]::Escape($r) + '=.') -Quiet }
      if ($ok) { "env ok: $r" } else { "WARN: $envfile does not have $r" }
    }
  }
}
foreach ($t in 'latest', 'previous') {
  $i = dk image inspect --format '{{.Id}} {{.Created}}' "${img}:$t"
  if ($LASTEXITCODE -eq 0) { "image ${img}:${t}: " + ($i -join ' ').Substring(7, 12) + '  created ' + ($i -join ' ').Split(' ')[1] } else { "image ${img}:${t}: none" }
}
foreach ($c in @($app, $nb, $cad)) { if ($c) { $s = dk inspect -f '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' $c; if ($LASTEXITCODE -eq 0) { "container ${c}: $s" } else { "container ${c}: not created" } } }
PS

if [ "$ROLLBACK" = 1 ]; then
  ps_run "" <<'PS' || die "rollback is not possible"
dk image inspect "${img}:previous" *> $null
if ($LASTEXITCODE -ne 0) { "ERROR: no ${img}:previous image, nothing to roll back to"; exit 4 }
PS
fi

# ---- 2. pack (also in --dry-run, to show the file count) ---------------------
TGZ=""
if [ "$BUILD" = 1 ]; then
  TGZ="$(mktemp -t "${NAME}-src").tgz"
  trap 'rm -f "$TGZ"' EXIT
  pack_source "$TGZ"
  say "Source $(source_id)"
fi

if [ "$DRY" = 1 ]; then
  say "Dry run. The real run would:"
  if [ "$BUILD" = 1 ]; then
    echo "  - copy the source to $STACK_DIR\\$BUILD_DIR_NAME and unpack it"
    echo "  - tag $IMAGE:latest as $IMAGE:previous"
    echo "  - docker build -t $IMAGE:latest -f $DOCKERFILE (context $BUILD_CONTEXT, DOCKER_BUILDKIT=0)"
    [ -n "${ENTRYPOINT_FILES:-}" ] && echo "  - copy changed $ENTRYPOINT_FILES into $STACK_DIR (old file kept as .bak)"
  fi
  [ "$ROLLBACK" = 1 ] && echo "  - tag $IMAGE:latest as $IMAGE:rolledback and $IMAGE:previous as $IMAGE:latest"
  echo "  - docker compose -p $COMPOSE_PROJECT up -d --no-deps --force-recreate for $APP_CT ${NETBIRD_CT:-} ${CADDY_CT:-}"
  echo "  - wait up to ${HEALTH_TIMEOUT}s for $APP_CT healthy and http://127.0.0.1:$HEALTH_PORT$HEALTH_PATH"
  exit 0
fi

# ---- 3. copy + unpack + build -----------------------------------------------
if [ "$BUILD" = 1 ]; then
  say "Copy source to $SSH_HOST"
  scp -q "${SSH_OPTS[@]}" "$TGZ" "$SSH_HOST:$(winpath_scp "$STACK_DIR")/$BUILD_DIR_NAME.tgz"
  say "Unpack, tag :previous, build (this can take 5-15 minutes)"
  ps_run "" <<'PS' || die "build step failed; nothing was restarted"
if (Test-Path $bdir) { Remove-Item $bdir -Recurse -Force }
New-Item -ItemType Directory -Path $bdir | Out-Null
tar.exe -xzf "$bdir.tgz" -C $bdir
if ($LASTEXITCODE -ne 0) { "ERROR: unpack failed"; exit 5 }
dk image inspect "${img}:latest" *> $null
if ($LASTEXITCODE -eq 0) { dk tag "${img}:latest" "${img}:previous" | Out-Null; "tagged ${img}:latest as ${img}:previous" }
$log = Join-Path $dir 'update-build.log'
Push-Location (Join-Path $bdir $ctx)
dk build --pull -t "${img}:latest" -f $dockerfile . | Out-File -Encoding utf8 $log
$rc = $LASTEXITCODE
Pop-Location
Get-Content $log -Tail 8
if ($rc -ne 0) { "ERROR: build failed (exit $rc). Full log: $log. The running containers are unchanged."; exit 6 }
"build ok, log: $log"
foreach ($f in ($entry -split ' ')) {
  if (-not $f) { continue }
  $src = Join-Path $bdir $f; $dst = Join-Path $dir (Split-Path $f -Leaf)
  if (-not (Test-Path $src)) { "WARN: $f is not in the source"; continue }
  if ((Test-Path $dst) -and ((Get-FileHash $src).Hash -eq (Get-FileHash $dst).Hash)) { "$f unchanged"; continue }
  if (Test-Path $dst) { Copy-Item $dst "$dst.bak" -Force }
  # LF line ends: the file runs in a Linux container.
  $t = [IO.File]::ReadAllText($src) -replace "`r`n", "`n"
  [IO.File]::WriteAllText($dst, $t, (New-Object Text.UTF8Encoding $false))
  "updated $(Split-Path $f -Leaf) (old copy: .bak)"
}
PS
fi

if [ "$ROLLBACK" = 1 ]; then
  say "Roll back: :previous becomes :latest"
  ps_run "" <<'PS' || die "rollback tag failed"
dk tag "${img}:latest" "${img}:rolledback" | Out-Null
dk tag "${img}:previous" "${img}:latest" | Out-Null
if ($LASTEXITCODE -ne 0) { "ERROR: tag failed"; exit 4 }
"${img}:latest now points to the old image (the bad one is ${img}:rolledback)"
PS
fi

# ---- 4. recreate app + netbird + caddy together ------------------------------
# They join the network of NET_CT (<stack>-net, network_mode: container:<stack>-net).
# NET_CT is only started when it is not running; it is never recreated here.
say "Recreate $APP_CT ${NETBIRD_CT:-} ${CADDY_CT:-} together (they share the network of ${NET_CT:-the app})"
ps_run "" <<'PS' || die "recreate failed. Run ./status.sh, or ./update.sh --rollback"
$m = Get-SvcMap
$svcs = @()
foreach ($c in @($app, $nb, $cad)) { if ($c -and $m.ContainsKey($c)) { $svcs += $m[$c] } }
if ($svcs.Count -eq 0) { "ERROR: no services found"; exit 7 }
Push-Location $dir
if ($net -and $m.ContainsKey($net)) {
  $ns = (& $d inspect -f '{{.State.Status}}' $net 2>$null) -join ''
  if ($ns -ne 'running') { "start network owner $net (was: $(if ($ns) { $ns } else { 'missing' }))"; dc up -d --no-deps $m[$net] | Select-Object -Last 3
    if ($LASTEXITCODE -ne 0) { "ERROR: could not start $net"; Pop-Location; exit 7 } }
}
dc up -d --no-deps --force-recreate @svcs | Select-Object -Last 12
$rc = $LASTEXITCODE
Pop-Location
if ($rc -ne 0) { "ERROR: compose up failed (exit $rc)"; exit 7 }
PS

# ---- 5. wait for /health -----------------------------------------------------
say "Wait for health (up to ${HEALTH_TIMEOUT}s)"
if ps_run "" <<'PS'; then
$t0 = Get-Date; $state = ''; $code = 0
while (((Get-Date) - $t0).TotalSeconds -lt $timeout) {
  $state = (dk inspect -f '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' $app) -join ' '
  try { $code = (Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 "http://127.0.0.1:$port$hpath").StatusCode } catch { $code = 0 }
  if ($code -eq 200 -and ($state -like '* healthy' -or $state -like '* none')) { break }
  if ($state -like 'exited*' -or $state -like 'restarting*') { break }
  Start-Sleep -Seconds 10
}
$secs = [int]((Get-Date) - $t0).TotalSeconds
"after ${secs}s: $app = $state, GET :$port$hpath = $code"
foreach ($c in @($nb, $cad)) { if ($c) { $s = dk inspect -f '{{.State.Status}}' $c; "${c}: $s" } }
if ($code -ne 200) { "--- last 20 log lines of ${app}:"; dk logs --tail 20 $app; exit 8 }
PS
  say "Healthy."
else
  warn "Not healthy. Check ./logs.sh app 200, then ./update.sh --rollback if needed."
  "$HERE/status.sh" || true
  exit 8
fi
"$HERE/status.sh"
