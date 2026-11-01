# shellcheck shell=bash disable=SC2034
# config.sh - Axon stack on basws42. Read by lib.sh. Local only (not in git).
NAME=axon
SSH_HOST=basws42
STACK_DIR='C:\sidecar-deploy\axon'
COMPOSE_PROJECT=axon
COMPOSE_FILE=docker-compose.yml
NET_CT=axon-net   # network owner (<stack>-net): app, netbird and caddy use network_mode container:axon-net
APP_CT=axon-mcp
NETBIRD_CT=axon-netbird
CADDY_CT=axon-caddy
EXTRA_CTS="axon-receiver"
IMAGE=axon-mcp
DOCKERFILE=Dockerfile
BUILD_CONTEXT=.
HEALTH_PORT=3847
HEALTH_PATH=/health
HEALTH_TIMEOUT=420
ENV_FILE=.env
REQUIRED_ENV=""
ENTRYPOINT_FILES="docker/netbird-entrypoint.sh docker/caddy-entrypoint.sh"
STATUS_IMAGES="sidecar-receiver sidecar-caddy netbirdio/netbird"
SETTINGS_URL="http://basws42:3847/settings#netbird"
