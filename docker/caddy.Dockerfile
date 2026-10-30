# Caddy with the Cloudflare DNS plugin, for the HTTPS sidecar (<svc>-caddy).
# Same file in mcpfantom and axon-mcp-server. Build once per host:
#   docker build -f docker/caddy.Dockerfile -t sidecar-caddy:latest docker
# Run with docker/caddy-entrypoint.sh as the entrypoint (see the compose files).
FROM caddy:2-builder AS build
RUN xcaddy build --with github.com/caddy-dns/cloudflare

FROM caddy:2
# jq reads config.json, openssl reads the certificate expiry.
RUN apk add --no-cache jq openssl
COPY --from=build /usr/bin/caddy /usr/bin/caddy
