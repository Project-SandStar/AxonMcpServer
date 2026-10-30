#!/usr/bin/env bash
# NetBird sidecar for the Axon MCP server.
#
# Runs in the netbirdio/netbird image (mounted read-only, used as entrypoint).
# Settings > NetBird (API GET/PUT /admin/netbird) writes $CTL/config.json:
#   { "setupKey": "...", "hostname": "axon", "managementUrl": "https://vpn.bas.co:443",
#     "enabled": true, "updatedAt": "<iso>" }
# This script:
#   - starts the NetBird daemon (`netbird service run`)
#   - waits until config.json has enabled=true and a setupKey, then `netbird up`
#   - runs `netbird down` + `netbird up` again when updatedAt changes
#   - runs `netbird down` when enabled=false
#   - every 10 s writes `netbird status --json` to $CTL/status.json
#   - passes wireguardPort as --wireguard-port (0 = NetBird picks a free port)
#   - exits when the app container network goes away (app restarted), so Docker
#     restarts this container in the new network (with DNS)
# The key is never printed. It goes to a mode-600 temp file for --setup-key-file.
set -uo pipefail

CTL="${NETBIRD_CTL_DIR:-/netbird-ctl}"
CFG="$CTL/config.json"
STATUS="$CTL/status.json"
KEYFILE="/tmp/netbird-setup-key"
NB="${NETBIRD_BIN:-netbird}"
export NB_LOG_FILE="${NB_LOG_FILE:-console}"

log() { echo "$(date -Isec) [netbird-ctl] $*" >&2; }

# Read one field from config.json. The admin API writes one key per line, and the
# values it accepts have no quotes, so sed is enough (the image has no jq).
# Only 2-space (top-level) keys match; nested "https" keys have 4 spaces.
field() {
  sed -n "s/^  \"$1\"[[:space:]]*:[[:space:]]*\"\{0,1\}\([^\",]*\)\"\{0,1\}[[:space:]]*,\{0,1\}[[:space:]]*$/\1/p" "$CFG" 2>/dev/null | head -n 1
}

daemon_pid=""
on_exit() {
  log "stopping"
  rm -f "$KEYFILE"
  [ -n "$daemon_pid" ] && kill -TERM "$daemon_pid" 2>/dev/null && wait "$daemon_pid" 2>/dev/null
  exit 0
}
trap on_exit TERM INT

mkdir -p "$CTL"

# The shared network namespace at start. A restarted app gets a new one.
netns_id() { readlink /proc/1/ns/net 2>/dev/null; cat /sys/class/net/eth0/ifindex 2>/dev/null; }
NETNS_ID="$(netns_id)"
net_alive() { [ -e /sys/class/net/eth0 ] && [ "$(netns_id)" = "$NETNS_ID" ]; }
# The Axon container runs as user "node" (uid 1000) and writes config.json here.
chown "${NETBIRD_CTL_UID:-1000}:${NETBIRD_CTL_GID:-1000}" "$CTL" 2>/dev/null
chmod 755 "$CTL" 2>/dev/null
"$NB" service run &
daemon_pid=$!
for _ in $(seq 1 30); do "$NB" status --check live >/dev/null 2>&1 && break; sleep 1; done
log "daemon started (pid $daemon_pid), waiting for $CFG"

applied=""      # updatedAt of the config that was applied
is_up=0
retry_at=0

write_status() {
  if [ "$is_up" = 1 ] && "$NB" status --json > "$STATUS.tmp" 2>/dev/null; then
    chmod 644 "$STATUS.tmp"; mv -f "$STATUS.tmp" "$STATUS"
  else
    rm -f "$STATUS.tmp" "$STATUS"
  fi
}

while :; do
  if ! kill -0 "$daemon_pid" 2>/dev/null; then
    log "daemon died, exiting so Docker restarts the container"
    exit 1
  fi
  if ! net_alive; then
    log "app network is gone (app restarted); exiting so Docker restarts this container"
    "$NB" down >/dev/null 2>&1
    kill -TERM "$daemon_pid" 2>/dev/null
    exit 1
  fi

  if [ -f "$CFG" ]; then
    updated="$(field updatedAt)"
    now=$(date +%s)
    if [ "$updated" != "$applied" ] || { [ "$retry_at" -gt 0 ] && [ "$now" -ge "$retry_at" ]; }; then
      enabled="$(field enabled)"
      key="$(field setupKey)"
      host="$(field hostname)"; host="${host:-axon}"
      url="$(field managementUrl)"; url="${url:-https://vpn.bas.co:443}"
      port="$(field wireguardPort)"; case "$port" in ''|*[!0-9]*) port=0 ;; esac
      retry_at=0
      if [ "$enabled" = "true" ] && [ -n "$key" ]; then
        log "config changed: up (hostname=$host, management=$url, wireguard-port=$port)"
        [ "$is_up" = 1 ] && "$NB" down >/dev/null 2>&1
        is_up=0
        ( umask 077; printf '%s' "$key" > "$KEYFILE" )
        if "$NB" up --setup-key-file "$KEYFILE" --management-url "$url" --hostname "$host" --wireguard-port "$port" 2>&1 \
             | sed -E 's/[A-Za-z0-9-]{20,}/<hidden>/g' >&2; then
          is_up=1
          log "connected"
        else
          log "netbird up failed, retry in 30 s"
          retry_at=$((now + 30))
        fi
        rm -f "$KEYFILE"
      else
        log "config changed: disabled or no key, down"
        "$NB" down >/dev/null 2>&1
        is_up=0
      fi
      applied="$updated"
      unset key
    fi
  fi

  write_status
  sleep 10 & wait $!
done
