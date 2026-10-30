#!/bin/sh
# HTTPS sidecar (<svc>-caddy). Runs in the sidecar-caddy image (caddy:2 +
# caddy-dns/cloudflare + jq + openssl), network_mode: service:<app>, so it
# answers on the NetBird IP on 443 (and 80 for the redirect).
#
# It reads $CTL/config.json (written by Settings > NetBird in the dashboard):
#   { "hostname": "fantom", ..., "https": { "enabled", "domain", "cloudflareToken", "email" }, "updatedAt" }
# and:
#   - waits until https.enabled=true and a Cloudflare token is saved;
#   - writes a Caddyfile for <hostname>.<domain> that proxies to $CADDY_UPSTREAM,
#     with `tls { dns cloudflare {env.CF_API_TOKEN} }` (DNS-01, no open port needed);
#   - restarts Caddy when the settings change (it checks every 10 s);
#   - writes $CTL/caddy-status.json: { running, certificate: { names, notAfter }, error, updatedAt };
#   - exits when the app container's network goes away, so Docker restarts it
#     in the new network.
# CADDY_TLS_INTERNAL=1 uses Caddy's own CA (`tls internal`) and needs no token:
# only for testing the config path.
# The token is never printed. It reaches Caddy only as the CF_API_TOKEN env var.
# Certificates live in /data (volume caddy-data).
set -u

CTL="${NETBIRD_CTL_DIR:-/netbird-ctl}"
CFG="$CTL/config.json"
STATUS="$CTL/caddy-status.json"
UPSTREAM="${CADDY_UPSTREAM:?set CADDY_UPSTREAM, e.g. 127.0.0.1:3848}"
INTERNAL="${CADDY_TLS_INTERNAL:-0}"
CADDYFILE=/etc/caddy/Caddyfile.generated
LOG=/tmp/caddy.log
INTERVAL="${CADDY_STATUS_INTERVAL:-10}"

log() { printf '%s caddy-ctl: %s\n' "$(date -Iseconds)" "$*" >&2; }

netns_id() { cat /sys/class/net/eth0/ifindex 2>/dev/null; }
NETNS_ID="$(netns_id)"
net_alive() { [ -e /sys/class/net/eth0 ] && [ "$(netns_id)" = "$NETNS_ID" ]; }

caddy_pid=""
running() { [ -n "$caddy_pid" ] && kill -0 "$caddy_pid" 2>/dev/null; }
stop_caddy() {
  if running; then
    log "stopping caddy"
    kill -TERM "$caddy_pid" 2>/dev/null
    wait "$caddy_pid" 2>/dev/null
  fi
  caddy_pid=""
}
on_exit() { stop_caddy; exit "${1:-0}"; }
trap 'on_exit 0' TERM INT

# Hide anything that looks like a token before it reaches a log or status file.
hide() { sed -E 's/[A-Za-z0-9_-]{30,}/<hidden>/g'; }

write_caddyfile() { # $1 fqdn, $2 email
  {
    echo "{"
    echo "	admin off"
    [ -n "$2" ] && echo "	email $2"
    echo "}"
    echo "$1 {"
    if [ "$INTERNAL" = 1 ]; then
      echo "	tls internal"
    else
      echo "	tls {"
      echo "		dns cloudflare {env.CF_API_TOKEN}"
      # Public DNS for the zone lookup: NetBird DNS answers vpn.bas.co itself,
      # and Cloudflare only has the bas.co zone.
      echo "		resolvers 1.1.1.1 1.0.0.1"
      echo "	}"
    fi
    echo "	reverse_proxy $UPSTREAM {"
    echo "		flush_interval -1"
    echo "	}"
    echo "}"
  } > "$CADDYFILE"
}

json_str() { if [ -n "$1" ]; then printf '%s' "$1" | jq -Rs .; else printf 'null'; fi; }

write_status() { # $1 fqdn (may be empty), $2 waiting message (may be empty)
  run=false; running && run=true
  cert=null; err=""
  if [ -n "$1" ]; then
    crt="$(ls /data/caddy/certificates/*/"$1"/"$1".crt 2>/dev/null | head -n 1)"
    if [ -n "$crt" ]; then
      na="$(openssl x509 -in "$crt" -noout -enddate 2>/dev/null | sed 's/^notAfter=//')"
      iso="$(date -u -D '%b %d %H:%M:%S %Y GMT' -d "$na" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || true)"
      [ -z "$iso" ] && iso="$(date -u -D '%b  %d %H:%M:%S %Y GMT' -d "$na" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || true)"
      cert="{\"names\":[$(json_str "$1")],\"notAfter\":$(json_str "$iso")}"
    fi
  fi
  if [ -n "$2" ]; then
    err="$2"
  elif [ -f "$LOG" ]; then
    # Last error from Caddy's JSON log since the last (re)start.
    err="$(grep '"level":"error"' "$LOG" 2>/dev/null | tail -n 1 | jq -r '[.msg, .error] | map(select(. != null)) | join(": ")' 2>/dev/null | hide | cut -c1-500)"
    [ "$run" = true ] || [ -n "$err" ] || err="caddy is not running"
  fi
  printf '{"running":%s,"certificate":%s,"error":%s,"updatedAt":"%s"}\n' \
    "$run" "$cert" "$(json_str "$err")" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$STATUS.tmp" \
    && chmod 644 "$STATUS.tmp" && mv -f "$STATUS.tmp" "$STATUS"
}

mkdir -p "$CTL" /data /config
log "waiting for https settings in $CFG (upstream $UPSTREAM)"
applied=""   # fingerprint of the settings Caddy runs with

while :; do
  if ! net_alive; then
    log "app network is gone (app restarted); exiting so Docker restarts this container"
    on_exit 1
  fi

  fqdn=""; wait_msg=""
  if [ -f "$CFG" ] && jq -e . "$CFG" >/dev/null 2>&1; then
    host="$(jq -r '.hostname // "" ' "$CFG")"
    on="$(jq -r '.https.enabled // false' "$CFG")"
    domain="$(jq -r '.https.domain // "vpn.bas.co"' "$CFG")"
    email="$(jq -r '.https.email // ""' "$CFG")"
    hastoken="$(jq -r 'if (.https.cloudflareToken // "") != "" then "yes" else "" end' "$CFG")"
    [ -n "$host" ] && fqdn="$host.$domain"
    if [ "$on" != true ]; then
      wait_msg="HTTPS is off"
    elif [ -z "$hastoken" ] && [ "$INTERNAL" != 1 ]; then
      wait_msg="waiting for a Cloudflare API token"
    elif [ -z "$host" ]; then
      wait_msg="waiting for a hostname"
    fi
  else
    wait_msg="waiting for $CFG"
  fi

  if [ -n "$wait_msg" ]; then
    if running || [ -n "$applied" ]; then log "$wait_msg; stopping"; stop_caddy; applied=""; rm -f "$LOG"; fi
  else
    # Fingerprint: name, email, mode and the token's hash (the token itself stays in jq's output only).
    fp="$(printf '%s|%s|%s|%s' "$fqdn" "$email" "$INTERNAL" "$(jq -r '.https.cloudflareToken // ""' "$CFG" | sha256sum | cut -c1-16)")"
    if [ "$fp" != "$applied" ] || ! running; then
      stop_caddy
      write_caddyfile "$fqdn" "$email"
      # The token must reach validate too: the cloudflare module checks it while it loads.
      if CF_API_TOKEN="$(jq -r '.https.cloudflareToken // ""' "$CFG")" \
          caddy validate --config "$CADDYFILE" --adapter caddyfile >/tmp/caddy-validate.log 2>&1; then
        log "starting caddy for https://$fqdn (proxy to $UPSTREAM$( [ "$INTERNAL" = 1 ] && echo ', tls internal'))"
        : > "$LOG"
        CF_API_TOKEN="$(jq -r '.https.cloudflareToken // ""' "$CFG")" \
          caddy run --config "$CADDYFILE" --adapter caddyfile >>"$LOG" 2>&1 &
        caddy_pid=$!
        applied="$fp"
      else
        wait_msg="Caddyfile is not valid: $(grep -i error /tmp/caddy-validate.log | tail -n 1 | hide | cut -c1-300)"
        log "$wait_msg"
        applied="$fp"
      fi
    fi
  fi

  write_status "$fqdn" "$wait_msg"
  sleep "$INTERVAL" & wait $!
done
