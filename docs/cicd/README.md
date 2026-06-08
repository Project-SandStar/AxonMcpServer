# CI/CD & Release Automation

How this repository builds, versions, and ships releases — and the gotcha we had
to work around to make it run under the `Project-SandStar` GitHub organization.

> **Status:** working. First automated release shipped as
> [`v1.0.0`](https://github.com/Project-SandStar/AxonMcpServer/releases/tag/v1.0.0)
> with `axon-mcp-server-v1.0.0.zip` attached.

---

## TL;DR

- Versioning + changelog + GitHub Releases are automated with
  **[release-please](https://github.com/googleapis/release-please-action)**, driven by
  **[Conventional Commits](https://www.conventionalcommits.org/)**.
- On every push to `main`, release-please keeps a **"release PR"** open. **Merging
  that PR** tags the version, publishes the GitHub Release, and triggers a build
  that **zips a runnable bundle and attaches it** to the release.
- Because the org/enterprise **blocks the default `GITHUB_TOKEN` from creating
  pull requests**, release-please authenticates with a **fine-grained PAT** stored
  as the repo secret **`RELEASE_PLEASE_TOKEN`**.

---

## Moving parts

| File | Purpose |
| --- | --- |
| `.github/workflows/ci.yml` | Build + test on every PR and push to `main`. |
| `.github/workflows/release.yml` | release-please (version/changelog/release) → build → zip → attach asset. |
| `release-please-config.json` | release-please config (`release-type: node`, package name, changelog path). |
| `.release-please-manifest.json` | Tracks the current released version (`{ ".": "1.0.0" }`). |
| `package.json` | Source of truth for the version release-please bumps. |

### `ci.yml`

Runs on `pull_request` and pushes to `main`:

```
checkout → setup-node 20 (npm cache) → npm ci → npx prisma generate → npm run build → npm test (informational)
```

`prisma generate` runs before `build` because the build (`tsc && cp -r src/generated dist/`)
needs the generated Prisma client. Tests are `continue-on-error` until hardened, so
they don't block.

### `release.yml`

Two jobs:

1. **`release-please`** — runs `googleapis/release-please-action@v4`. It opens/updates
   the release PR and, when that PR is merged, creates the tag + GitHub Release.
   Outputs `release_created` and `tag_name`.
2. **`package`** — gated on `release_created == 'true'`. Builds the project, assembles
   a runnable bundle, zips it, and uploads it to the release via
   `softprops/action-gh-release@v2`.

Required permissions are declared in YAML (`contents: write`, `pull-requests: write`).

---

## How a release happens

```
commit (Conventional Commits) ─▶ push/merge to main
        │
        ▼
release-please opens/updates a "release PR"  (bumps package.json + CHANGELOG.md)
        │
        ▼   (you) merge the release PR  ── squash & merge ──┐
        │                                                   │
        ▼                                                   ▼
release-please creates tag vX.Y.Z + GitHub Release    package job: npm ci →
                                                       prisma generate → build →
                                                       zip → attach asset
```

### Version bumps (Conventional Commits)

release-please reads commit messages on `main` to decide the next version:

| Commit prefix | Result |
| --- | --- |
| `fix: …` | patch — `x.y.Z` |
| `feat: …` | minor — `x.Y.0` |
| `feat!: …` or body `BREAKING CHANGE:` | major — `X.0.0` |
| `chore: / docs: / ci: / refactor: …` | no release on their own |

> **Merge method = Squash and merge.** With squash, GitHub uses the **PR title** as
> the single commit message on `main`, so keep **PR titles in Conventional Commit
> format**. (Lock it in: repo *Settings → General → Pull Requests* → allow only
> squash merging, message = "Pull request title".)

---

## The gotcha: org/enterprise blocks `GITHUB_TOKEN` PR creation

`Project-SandStar` is governed by a higher-level (enterprise) policy that forces the
Actions **`GITHUB_TOKEN`** to read-only and **disables "Allow GitHub Actions to create
and approve pull requests"** — and the setting is **locked**, so it can't be changed at
the org or repo level.

- A workflow's YAML `permissions:` block *can* still elevate normal scopes
  (e.g. `contents: write`) above the read-only default — so the **build/zip/attach
  job works fine** on `GITHUB_TOKEN`.
- **But PR creation cannot be granted by YAML.** release-please *opens a PR*, so it
  fails with `GITHUB_TOKEN` under this policy.

### Fix: a Personal Access Token for release-please

1. **Fine-grained PAT** (https://github.com/settings/personal-access-tokens):
   - Resource owner: `Project-SandStar`
   - Repository access: only `AxonMcpServer`
   - Permissions: **Contents: Read and write**, **Pull requests: Read and write**
2. Store it as repo secret **`RELEASE_PLEASE_TOKEN`**
   (*Settings → Secrets and variables → Actions*).
3. `release.yml` passes it to the action:

   ```yaml
   - uses: googleapis/release-please-action@v4
     id: rp
     with:
       token: ${{ secrets.RELEASE_PLEASE_TOKEN || secrets.GITHUB_TOKEN }}
       config-file: release-please-config.json
       manifest-file: .release-please-manifest.json
   ```

The `|| secrets.GITHUB_TOKEN` fallback means the workflow still works if the org policy
is ever relaxed (then the PAT can be removed). A GitHub App installation token is an
equivalent, more enterprise-friendly alternative if you prefer not to use a user PAT.

> **Alternative (if you own the enterprise):** Enterprise/Org *Settings → Actions →
> General → Workflow permissions* → **Read and write** + ✅ **Allow GitHub Actions to
> create and approve pull requests**. If that radio is greyed out, an enterprise policy
> is enforcing it — use the PAT above.

---

## Cutting a release

### Normal flow
1. Land work on `main` via squash-merged PRs with Conventional Commit titles.
2. release-please keeps a **"chore(main): release X.Y.Z"** PR open.
3. **Merge** that PR → tag + Release + zip asset appear automatically.

### Bootstrapping the very first release
The first commits were all `chore:`, which don't trigger a bump. To force the initial
`1.0.0`, push an empty commit with a `Release-As` footer:

```bash
git commit --allow-empty -m "chore: release 1.0.0" -m "Release-As: 1.0.0"
git push origin main
```

release-please then opens the release PR for `1.0.0`; merging it ships v1.0.0.

---

## The release bundle (zip asset)

The `package` job assembles a self-contained, runnable bundle named
`axon-mcp-server-vX.Y.Z.zip` containing:

- `dist/` (compiled server), `prisma/` (schema + migrations), `scripts/`
- `package.json`, `package-lock.json`, `README.md`, `LICENSE`, `CHANGELOG.md`, `.env.example`
- `config/*.example.json` + `config/README.md` (templates only — **no real configs/secrets**)

### Install from a release zip

```bash
unzip axon-mcp-server-vX.Y.Z.zip && cd axon-mcp-server-vX.Y.Z
npm ci --omit=dev
npx prisma migrate deploy
cp config/skyspark.example.json config/local-skyspark.json   # then edit credentials
node dist/index.js
```

---

## Verifying a release (no `gh` needed)

The repo is public, so the GitHub REST API works anonymously:

```bash
REPO=Project-SandStar/AxonMcpServer
# tag + release + asset
curl -sS "https://api.github.com/repos/$REPO/releases/latest" \
  | grep -E '"tag_name"|"name"|"browser_download_url"|"size"'
# tags
curl -sS "https://api.github.com/repos/$REPO/tags" | grep '"name"'
# workflow run conclusions
curl -sS "https://api.github.com/repos/$REPO/actions/runs?per_page=5" \
  | grep -E '"name"|"display_title"|"conclusion"'
# a PR's mergeability
curl -sS "https://api.github.com/repos/$REPO/pulls/<N>" \
  | grep -E '"state"|"merged"|"mergeable"|"mergeable_state"'
```

You can also watch the **Actions** tab (Release run → `package` job) and the
**Releases** tab.

---

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| No release PR appears after pushing to `main` | release-please can't create PRs with `GITHUB_TOKEN`, or only `chore:` commits exist | Ensure `RELEASE_PLEASE_TOKEN` secret is set; push a `feat:`/`fix:` or a `Release-As:` commit |
| Release workflow errors creating the PR | Org/enterprise blocks `GITHUB_TOKEN` PR creation | Use the PAT (above) or a GitHub App token |
| "Read and write permissions" radio is greyed out | Enterprise policy enforcing it above the org | Can't change at org/repo level — use the PAT |
| Merge button won't complete | Two-step "Merge → Confirm merge", or a required check/review | Confirm `mergeable_state` is `clean`; complete the confirm step |
| Release created but no `.zip` asset | `package` job failed (build/prisma) | Check the Release run's `package` job logs |
| Wrong version proposed | Commit/PR titles not Conventional | Fix the title; release-please updates the open PR |

---

## Appendix: making the repo publishable (one-time prep)

Before the first push, the repo was sanitized for a public, source-available release
(licensed under **PSSL v1.1** — see [`LICENSE`](../../LICENSE)):

- **`.gitignore` hardened** — `proj/`, `config/*.json` (+ backups), databases
  (`*.db`/`*.sqlite`/`prisma/dev.db`), `.env*` (except `.env.example`), caches, generated
  sync state (`.skyspark-sync.json`, `.sync-metadata.json`), and debug/log/backup artifacts.
  Example templates (`config/*.example.json`, `config/README.md`, `.env.example`) are kept.
- **Secret/PII scrub** — removed real credentials, internal IPs, usernames, personal
  paths, and client identifiers from all shipped files. Real connection configs remain
  **git-ignored and local only**.
- **Fresh history** — the public repo was started from a single clean `Initial commit`
  (orphan branch) so no secret ever exists in its git history.
- **Vendored `src/haystack-core`** — its nested `.git` was removed so it ships as plain
  source files (not a broken submodule gitlink).

> Any credential that was ever committed (even to the old private remote) should be
> considered compromised and **rotated**.
