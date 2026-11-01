#!/usr/bin/env bash
# status.sh - containers, health, image ages, NetBird and HTTPS state.
# Reads /netbird-ctl/status.json and caddy-status.json. Never prints keys or tokens.
set -euo pipefail
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
case "${1:-}" in -h | --help) sed -n '2,3p' "$0"; exit 0 ;; esac

say "$NAME on $SSH_HOST:$STACK_DIR"
ps_run "" <<'PS'
"--- containers"
foreach ($c in @($net, $app, $nb, $cad) + ($extra -split ' ')) {
  if (-not $c) { continue }
  $s = dk inspect -f '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}-{{end}}|{{.Config.Image}}|{{.State.StartedAt}}|{{.RestartCount}}' $c
  if ($LASTEXITCODE -ne 0) { "{0,-18} not created" -f $c; continue }
  $p = ($s -join '').Split('|')
  "{0,-18} {1,-8} health={2,-9} image={3,-26} started={4} restarts={5}" -f $c, $p[0], $p[1], $p[2], $p[3].Substring(0, 19), $p[4]
}
"--- health"
try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 "http://127.0.0.1:$port$hpath"; "GET http://127.0.0.1:$port$hpath -> $($r.StatusCode)" }
catch { "GET http://127.0.0.1:$port$hpath -> FAILED ($($_.Exception.Message))" }
"--- images"
foreach ($r in (@($img) + ($images -split ' ') | Where-Object { $_ } | Select-Object -Unique)) {
  dk images $r --format '{{.Repository}}:{{.Tag}}  {{.ID}}  {{.CreatedSince}}  {{.Size}}'
}
"--- NetBird"
$ctlc = $app; $nbj = dk exec $app cat /netbird-ctl/status.json
if ($LASTEXITCODE -ne 0 -and $nb) { $ctlc = $nb; $nbj = dk exec $nb cat /netbird-ctl/status.json }
if ($LASTEXITCODE -ne 0) { "no /netbird-ctl/status.json yet (no setup key pasted, or netbird not running)" }
else {
  try {
    $j = ($nbj -join "`n") | ConvertFrom-Json
    $mg = if ($j.management) { $j.management.connected } else { '?' }
    "fqdn=$($j.fqdn)  ip=$($j.netbirdIp)  management=$mg  peers=$($j.peers.connected)/$($j.peers.total)"
  } catch { "status.json is not valid JSON" }
}
$cfg = dk exec $ctlc cat /netbird-ctl/config.json
if ($LASTEXITCODE -eq 0) {
  try {
    $c = ($cfg -join "`n") | ConvertFrom-Json
    $key = if ($c.setupKey) { 'set' } else { 'empty' }
    "config: enabled=$($c.enabled) hostname=$($c.hostname) setupKey=$key wireguardPort=$($c.wireguardPort) updatedAt=$($c.updatedAt)"
    if ($c.https) { $tok = if ($c.https.cloudflareToken) { 'set' } else { 'empty' }; "https: enabled=$($c.https.enabled) domain=$($c.https.domain) cloudflareToken=$tok" }
  } catch { "config.json is not valid JSON" }
}
"--- HTTPS (Caddy)"
$cs = dk exec $ctlc cat /netbird-ctl/caddy-status.json
if ($LASTEXITCODE -ne 0) { "no caddy-status.json (HTTPS off, or no caddy container)" }
else {
  try {
    $k = ($cs -join "`n") | ConvertFrom-Json
    $names = if ($k.certificate) { $k.certificate.names -join ',' } else { 'none' }
    $na = if ($k.certificate) { $k.certificate.notAfter } else { '-' }
    "running=$($k.running)  cert=$names  expires=$na  updated=$($k.updatedAt)"
    if ($k.error) { "last error: $($k.error)" }
  } catch { "caddy-status.json is not valid JSON" }
}
PS
[ -n "${SETTINGS_URL:-}" ] && say "NetBird settings: $SETTINGS_URL"
exit 0
