# Stable SkySpark Authentication Model

Status: proposed · 2026-10-01 · Tasks: [STABLE-AUTH-TASKS.md](STABLE-AUTH-TASKS.md)

Each Axon MCP user gets an always-on connection to each SkySpark project they use. The server logs in again by itself when a token or a SkySpark server goes bad. Nobody calls `switchSkySparkProject` to fix a 403.

## Problem

- One global project switcher serves every user and every MCP session.
- A SkySpark restart makes old tokens fail with 403. Users must re-auth by hand.
- No screen shows who is logged in to the MCP server or which projects each user has open.

## Current state

All SkySpark state is global to the server process.

| Piece | Where | Today |
| --- | --- | --- |
| Login | `src/skyspark/haystackAuth.ts:399` `authenticate()` | SCRAM-SHA-256. Token from `Authentication-Info`. |
| Token cache | `haystackAuth.ts:229`, `:256` | Memory `authToken` plus file `.cache/session-<instance>-<username>.json`. Keyed by instance + user, not project. |
| Retry | `haystackAuth.ts:541` | On 401 or 403: drop memory token, log in, retry once (commit `0326f26`). |
| Drop token | `haystackAuth.ts:558` `clearToken()` | Clears memory only. File token survives and gets reused. |
| Client | `src/index.ts:80` `skysparkClient` | One `HaystackSkySparkClient` for the whole process. `switchTo()` builds a new `HaystackAuthClient`. |
| Switch | `src/index.ts:3238` `switchProject` | Changes the global client and config manager. Does not set `primaryContext`. |
| Primary project | `src/index.ts:3625`, `src/config/config.ts:283` | Global, saved to `config/axonMcpServer-config.json`. |
| MCP sessions | `src/index.ts:103-104`, `:5323` | `httpTransports` / `httpSessions` maps keyed by session id. |
| Caller identity | `src/index.ts:57`, `:1479` | `requireBearerAuth` imported, never used. CallTool handler ignores `extra`. A tool cannot tell who called it. |
| OAuth sessions | `prisma/schema.prisma:136` `OAuthSession` | Has `userId`. `verifyAccessToken` (`src/auth/oauthProvider.ts:325`) does not return it. |
| Credentials | `src/config/skysparkConfig.ts:280` | Shared service account per project or instance, then `su/su`. Not per user. |
| Dashboard | `dashboard/src/app/connections/page.tsx` | Cards and lists. Project row buttons at `:647`. No sessions view. |

## Proposed model

### Terms

- **User session**: one logged-in MCP user (OAuth user id). Created by Axon login. Holds the user's current **scope**.
- **Scope**: the (instance, project) pair the user works in. Sticky: it changes only when the user switches.
- **Connection**: a live SkySpark token for (user, instance, project). Lives in the **connection registry**.

### Connection registry

New `src/skyspark/connectionRegistry.ts`. One process-wide registry. A connection's state is `connected`, `authenticating`, `stale`, `down` or `failed`.

```ts
type ConnectionKey = `${userId}:${instance}:${project}`;

interface Connection {
  userId: string;
  instance: string;
  project: string;
  client: HaystackSkySparkClient;
  state: 'connected' | 'authenticating' | 'stale' | 'down' | 'failed';
  lastAuthAt?: Date;
  lastOkAt?: Date;
  lastError?: string;
}

get(userId, instance, project): Promise<Connection>    // auth if needed
reauthenticate(userId, instance, project): Promise<Connection>
list(): Connection[]
drop(userId, instance?, project?)
```

Rules:

- `get()` returns a `connected` connection. If none exists, or it is `stale`, it logs in first. Concurrent callers wait on one login promise; there is no login storm.
- One login per (instance, credential) is enough. Connections that share a credential share the token, so ten users on one service account cause one SCRAM login, not ten.
- `reauthenticate()` deletes the memory token and the session cache file, then does a full SCRAM login.

### Request flow

1. MCP request arrives on `/mcp` with a bearer token.
2. `requireBearerAuth` checks it. `verifyAccessToken` puts `userId` into `AuthInfo.extra`.
3. The CallTool handler reads `extra.authInfo` and `extra.sessionId`, and finds the user session.
4. Tool has no `instance`/`project` arg: use the session scope. Tool has one: use it for this call only. Only `switchSkySparkProject` changes the scope.
5. `registry.get(user, instance, project)` returns a live connection, logging in if needed.
6. Run the tool. On 401/403 the client retries once with a fresh login (exists today).

### Auth client pool (built)

`src/skyspark/haystackAuth.ts` keeps one `HaystackAuthClient` per SkySpark server + username (`getSharedAuthClient()`). A token covers every project on the server.

- A project switch reuses the pooled client and its in-memory token. No new login, no session-file read, no token test.
- Concurrent requests that need a token share one in-flight login (`pendingToken`).
- A password change in config replaces the pooled client.
- The pooled client keeps the `authPath` of the first project it was made for.

### Health check (built)

`startAuthHealthCheck(60_000)` runs from server start. Every 60 s, for each pooled client that has a token:

- `/about` returns 200: `connected`, set `okAt`.
- 401/403 (token died, e.g. SkySpark restart): full login again, set `reauthAt`. Login fails: `failed`.
- Network error or other HTTP status: `down`. Keep the token. The next check runs again; when the server is back it answers 403 and the client logs in.
- Clients that never logged in stay `idle` and log in on first use.

`GET /admin/connections/auth` lists the pooled clients and their health.

### Axon login and credentials

Users log in to the MCP server (`config/users.json`). That login is enough: SkySpark keeps the shared service accounts. The connection is keyed by user for scope and visibility, and the credential stays per project.

### stdio mode

stdio has no OAuth user. Use a fixed user id `local`. The model stays the same.

## Dashboard

On `/dashboard/connections`, add a **Sessions** table above the connection list. Fill it from new `GET /admin/sessions`. Refresh every 5 s.

| User | MCP sessions | Scope | Connected projects | State | Last OK | Actions |
| --- | --- | --- | --- | --- | --- | --- |
| alper | 2 | `local/demo` | `local/demo`, `poppy/sensors` | connected | 12 s ago | Reauthenticate · Disconnect |

- Each connected project is a chip coloured by state. Clicking the chip shows `lastError`.
- **Reauthenticate** calls `POST /admin/connections/:instance/:project/reauth` (optional `userId`).
- Each project row in the existing Projects list also gets a **Reauthenticate** button (`page.tsx:647` button group).

## MCP surface

- New tool **`reauthenticateSkySparkProject`** `{ instanceName, projectName? }`. It deletes the cached token and logs in again. It does not change the scope. The description names the search words "reauthenticate", "re-login", "refresh token", "403".
- `switchSkySparkProject`: changes the caller's session scope only, not other users' scope.
- `getPrimaryProject` / `setPrimaryProject`: stay as the default scope for new sessions.
- `executeAxonCode`, `queryHaystack`, `commitAxonFunction` and every other SkySpark tool: get their client from the registry instead of `this.skysparkClient`.

## Rollout

1. **Phase 0 (now)**: `reauthenticateSkySparkProject` tool + Reauthenticate button on the global client. Fixes the manual 403 pain today.
2. **Phase 1**: registry, health check, sticky scope per MCP session, Sessions table. Service accounts stay.
3. **Phase 2**: wire `requireBearerAuth` on `/mcp`. Key sessions by OAuth user, not only MCP session id.
4. ~~**Phase 3**: optional per-user SkySpark credentials.~~ Dropped: MCP login is enough.

## Risks

- Wiring `requireBearerAuth` on `/mcp` breaks clients that call without a token today. Put it behind config flag `mcpRequireAuth`, default off until clients are moved.
- Per-scope state means two users can no longer see each other's switch. Tools or docs that expect a global switch must change.
- Many projects times many users means many tokens. Sharing tokens per credential keeps the login count low.
- The session cache file is keyed by instance + username, not project. Keep that key: the token is valid for all projects on the instance.

## Decisions (2026-10-01)

- **MCP user login is enough.** SkySpark keeps the shared service accounts. Phase 3 is dropped.
- **Scope survives a server restart.** On restart, the server checks that the saved SkySpark token (session cache file) is still valid before it uses it, and logs in again if not.
- **Health check every 60 s.**
