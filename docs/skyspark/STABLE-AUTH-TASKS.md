# Stable SkySpark Authentication — Tasks

Design: [STABLE-AUTH-MODEL.md](STABLE-AUTH-MODEL.md). Check a box when the task is merged.

## Phase 0 — Manual reauthenticate (now)

- [x] **T0.1** Add `HaystackAuthClient.forceReauthenticate()`: clear `authToken`, delete the `.cache/session-*.json` file, run `authenticate()`. `src/skyspark/haystackAuth.ts`
- [x] **T0.2** Add `HaystackSkySparkClient.reauthenticate()` and `clearAuthToken()`. `src/skyspark/haystackClient.ts`
- [x] **T0.3** Add MCP tool `reauthenticateSkySparkProject { instanceName, projectName? }`. Does not change the active project. Description has the words reauthenticate, re-login, refresh token, 403. `src/index.ts`
- [x] **T0.4** Add admin route `POST /admin/connections/:instance/:project/reauth`. `src/admin/routes.ts`
- [x] **T0.5** Add `api.reauthenticateProject()` and a **Reauthenticate** button on each project row. `dashboard/src/lib/api.ts`, `dashboard/src/app/connections/page.tsx:647`
- [ ] **T0.6** Test: forced 403 then reauth gives a new token; active project unchanged.

## Phase 1 — Connection registry and health check

- [x] **T1.1** ~~Separate registry~~ Replaced by per-session clients in `src/index.ts`: `sessionScope` (AsyncLocalStorage) + `sessionClients` map keyed by MCP session id; logins come from the T1.2 pool.
- [x] **T1.2** Share one auth client and token per (server, username): `getSharedAuthClient()`; one in-flight login for concurrent callers. `src/skyspark/haystackAuth.ts`
- [x] **T1.3** Health check every 60 s: `startAuthHealthCheck()`. States `idle` / `connected` / `down` / `failed`. 401/403 logs in again. `GET /admin/connections/auth` lists it.
- [x] **T1.4** Per-session scope. `switchSkySparkProject` / `setPrimaryProject` change the caller's session only (`setPrimaryProject` also sets the default for new sessions). `executeAxonCode { project }` override uses a throwaway client.
- [x] **T1.5** CallTool handler runs in `sessionScope.run({ sessionId: extra.sessionId })`; `this.skysparkClient` getter returns the session's client.
- [x] **T1.6** stdio mode (no session id) uses the default client.
- [x] **T1.7** `GET /admin/sessions`: session id, instance/project, created, last activity (userId empty until Phase 2).
- [x] **T1.8** `POST /admin/sessions/:sessionId/disconnect` (admin only).
- [x] **T1.9** Sessions card on the connections page, 5 s poll, Reauthenticate + Disconnect, plus SkySpark logins table.
- [ ] **T1.10** Tests. Done: `scripts/test-session-scope.mjs` (2 sessions on local/demo + local/poppy, interleaved calls, override, admin list — 18/18 pass). Open: health check recovery after a SkySpark restart.
- [ ] **T1.11** Drop idle sessions that never send close (e.g. no activity for 24 h).

## Phase 2 — OAuth user identity on /mcp

- [ ] **T2.1** `verifyAccessToken` returns `extra.userId`. `src/auth/oauthProvider.ts:325`
- [ ] **T2.2** Mount `requireBearerAuth` on `/mcp` behind config flag `mcpRequireAuth` (default off). `src/index.ts:5323`
- [ ] **T2.3** Key user sessions by OAuth `userId`. Fall back to MCP session id when there is no token.
- [ ] **T2.4** Update `OAuthSession.lastActivity` on each MCP request.
- [ ] **T2.5** Scope survives restart (decided): add `scopeInstance` / `scopeProject` to `OAuthSession` with a Prisma migration. On restore, check the saved token is valid before use.

Phase 3 (per-user SkySpark credentials) is dropped: MCP user login is enough.

## Docs

- [ ] **D1** Update `CLAUDE.md` MCP tool list with `reauthenticateSkySparkProject`.
- [ ] **D2** Update `docs/skyspark/INSTANCE-LEVEL-SESSIONS.md` to point to this model.
