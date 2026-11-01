# Axon MCP – Docker guide

These files are local only. Git ignores them through `.git/info/exclude`. Do not commit them.

## 1. Where the stack lives

| Item | Value |
|------|-------|
| Host | `basws42` (Windows, Docker Desktop) |
| Folder | `C:\sidecar-deploy\axon` |
| Compose project | `axon` |
| App container | `axon-mcp` (image `axon-mcp:latest`) |
| Sidecars | `axon-mcp-netbird`, `axon-mcp-caddy`, `axon-receiver` (file sync) |
| Health URL (on the host) | `http://127.0.0.1:3847/health` |
| HTTPS name | `https://axon.vpn.bas.co` |
| NetBird settings page | `http://basws42:3847/settings#netbird` (Settings > NetBird; check the path) |
| Env file | `C:\sidecar-deploy\axon\.env` |

The scripts reach the host with `ssh basws42`. They send PowerShell to the host. Docker is at
`C:\Users\alper.HQ2\AppData\Local\Programs\DockerDesktop\resources\bin\docker.exe`.
All settings for the scripts are in `config.sh`.

## 2. The scripts

Run them on this Mac, from any folder.

| Script | What it does |
|--------|--------------|
| `./update.sh` | Packs the source, copies it to the host, builds a new image, recreates the app with its netbird and caddy containers, waits for health. |
| `./update.sh --dry-run` | Checks the host and shows the plan. It changes nothing. |
| `./update.sh --no-build` | Recreates the containers from the current image. Use it after you edit the env file. |
| `./update.sh --rollback` | Goes back to the old image (`:previous`). |
| `./status.sh` | Shows containers, health, image ages, NetBird and HTTPS state. |
| `./logs.sh <svc> [lines]` | Shows the log. `<svc>` is `app`, `netbird`, `caddy` or a full container name. |
| `./prune.sh` | Shows old images and build files. Add `--yes` to remove them. |

## 3. Upgrade the image

1. Run `./update.sh --dry-run`. Read the warnings.
2. Run `./update.sh`. A build takes 5 to 15 minutes.
3. Read the last lines. You must see `Healthy.`

What `update.sh` does:

1. It packs all files that git tracks, and new files that git does not ignore.
   It leaves out `.env` files, keys and databases.
2. It copies the pack to `C:\sidecar-deploy\axon\build-src` and unpacks it.
3. It tags the running image as `axon-mcp:previous`.
4. It builds `axon-mcp:latest` with `DOCKER_BUILDKIT=0`. The build log is `C:\sidecar-deploy\axon\update-build.log`.
   If the build fails, the script stops. The running containers do not change.
5. It copies changed entrypoint files (`netbird-entrypoint.sh`, `caddy-entrypoint.sh`) into the folder.
   It keeps the old file as `.bak`.
6. It recreates the app, netbird and caddy containers together.
7. It waits until the app is healthy and the health URL gives 200.

The script never runs `docker compose down` and never removes volumes.

## 4. Roll back

```bash
./update.sh --rollback
```

This tags `:previous` as `:latest` and recreates the containers. The bad image stays as `:rolledback`.
You can remove it later with `./prune.sh --yes`.
Only one old image is kept. A second update replaces `:previous`.

## 5. Images

- `axon-mcp:latest` – the running image.
- `axon-mcp:previous` – the image before the last update.
- `sidecar-caddy:latest`, `sidecar-receiver:latest` – shared images. Build them from the
  `fileSystemSideCar` repo (`scripts/docker/update.sh`).
- `netbirdio/netbird:latest` – from Docker Hub. To get a new one:
  `ssh basws42` and then `docker pull netbirdio/netbird:latest`. Then run `./update.sh --no-build`.

Clean up:

```bash
./prune.sh          # show what can go
./prune.sh --yes    # remove dangling images, old tags, build cache and build-src
```

`prune.sh` keeps `:latest` and `:previous`. It never removes volumes.

## 6. Volumes

| Volume | Holds |
|--------|-------|
| `axon_netbird-ctl` | NetBird and HTTPS settings (`config.json`), status files. Holds the setup key and token. |
| `axon_netbird-state` | NetBird keys and identity. |
| `axon_caddy-data` | Caddy certificates and ACME account. |

Do not remove these volumes. Do not run `docker compose down -v`.
If you lose `netbird-state`, the server gets a new NetBird identity, and you must paste a new setup key.
If you lose `caddy-data`, Caddy must get a new certificate.

### Back up a volume

Run on basws42 (PowerShell). Change the volume name as needed:

```powershell
$d = "C:\Users\alper.HQ2\AppData\Local\Programs\DockerDesktop\resources\bin\docker.exe"
$v = "axon_netbird-state"
& $d run --rm -v "${v}:/v:ro" -v "C:\sidecar-deploy\backup:/b" alpine tar czf "/b/$v-$(Get-Date -f yyyyMMdd).tgz" -C /v .
```

### Restore a volume

Stop the stack first, so nothing writes to the volume:

```powershell
cd C:\sidecar-deploy\axon
& $d compose -p axon stop
& $d run --rm -v "${v}:/v" -v "C:\sidecar-deploy\backup:/b" alpine sh -c "cd /v && tar xzf /b/<file>.tgz"
& $d compose -p axon up -d
```

## 7. Env file

The file is `C:\sidecar-deploy\axon\.env`. It holds secrets. It is only on the host, never in git.
After you change it, run `./update.sh --no-build`.

## 8. Add the NetBird setup key

1. In NetBird (`https://vpn.bas.co`), make a setup key. A reusable key is easier.
2. Open the settings page: `http://basws42:3847/settings#netbird` (Settings > NetBird; check the path)
3. Paste the key. Set the hostname to `axon`. Turn NetBird on. Save.
4. The page writes `/netbird-ctl/config.json`. The `axon-mcp-netbird` container reads it,
   runs `netbird up`, and writes `/netbird-ctl/status.json` every 10 seconds.
5. Run `./status.sh`. You must see `fqdn=axon.vpn.bas.co` and `management=True`.

The key is never shown in full and never logged. To change the key, paste a new one and save.

## 9. WireGuard port

On the settings page, under **Advanced**, set the WireGuard port.
The default is `0`. Then NetBird picks a free port. Set a fixed UDP port only if a firewall needs it.
Each stack on basws42 must use a different port. Save, and NetBird reconnects.

## 10. Switch the site to HTTPS

You need a Cloudflare API token. Make it once in Cloudflare:
**My Profile > API Tokens > Create Token > "Edit zone DNS"**, limited to the zone `bas.co`.
All services can use the same token.

1. Make sure NetBird is connected (`./status.sh`).
2. On the settings page, open **HTTPS**. Turn it on. Domain: `vpn.bas.co`. Paste the token. Save.
3. The `axon-mcp-caddy` container gets a certificate for `axon.vpn.bas.co` through a DNS check
   at Cloudflare. This takes about 1 to 2 minutes.
4. Run `./status.sh`. Under "HTTPS" you must see the certificate name and the expiry date.
5. Open `https://axon.vpn.bas.co` from a computer on NetBird.

Caddy listens on port 443 inside the shared network. It sends requests to `127.0.0.1:3847`.

### Certificate renewal

Caddy renews the certificate itself, about 30 days before it expires.
You do not need to do anything. The token must stay valid.
`./status.sh` shows the expiry date (`expires=`).

### HTTPS troubleshooting

| Problem | What to do |
|---------|-----------|
| `no caddy-status.json` | HTTPS is off, or `axon-mcp-caddy` does not run. Run `./logs.sh caddy 100`. |
| `last error` shows a DNS or 403 error | The token is wrong or has no DNS edit right on `bas.co`. Make a new token. |
| Name does not resolve | NetBird is not connected, or the hostname is wrong. Check `./status.sh`. |
| Browser shows the wrong certificate | Wait 2 minutes, then reload. Check `./logs.sh caddy`. |
| Caddy exits again and again | Run `./update.sh --no-build` to recreate the three containers together. |
| Too many certificate requests | Let's Encrypt has rate limits. Do not delete `caddy-data`. Wait one hour. |

## 11. Known problems

- **Restart the app with its netbird and caddy containers together.**
  `axon-mcp-netbird` and `axon-mcp-caddy` use the network of `axon-mcp`.
  If you restart only the app, the sidecars lose their network and DNS.
  Always use `./update.sh --no-build`, or:
  `docker compose -p axon up -d --no-deps --force-recreate axon-mcp axon-netbird axon-caddy`.
- **Old Docker Compose on basws42 (v2.2.3).** It has no `--wait`. The script polls health itself.
- **Classic builder.** The builds use `DOCKER_BUILDKIT=0`. You see a "legacy builder" warning. That is normal.
- **`axon-receiver`** is not recreated by `update.sh`. Update it from the `fileSystemSideCar` repo.
- The axon image is large (about 4 GB). Run `./prune.sh` after some updates.
