# OAuth 2.1 Authentication

The Axon MCP Server implements OAuth 2.1 with PKCE for secure authentication of MCP clients like Claude Code. This document explains the architecture, flow, and administration of OAuth.

## Architecture Overview

```
┌─────────────────┐         ┌──────────────────────────────────────────────┐
│   Claude Code   │         │           Axon MCP Server                    │
│   (MCP Client)  │         │                                              │
└────────┬────────┘         │  ┌─────────────────────────────────────────┐ │
         │                  │  │  OAuth Endpoints (mcpAuthRouter)        │ │
         │  1. Discover     │  │  /.well-known/oauth-authorization-server│ │
         ├─────────────────►│  │  /.well-known/oauth-protected-resource  │ │
         │                  │  │  /authorize  - Login page               │ │
         │  2. Register     │  │  /token      - Token exchange           │ │
         ├─────────────────►│  │  /register   - Dynamic client reg       │ │
         │                  │  │  /revoke     - Token revocation         │ │
         │  3. Authorize    │  └─────────────────────────────────────────┘ │
         ├─────────────────►│                                              │
         │                  │  ┌─────────────────────────────────────────┐ │
         │  4. MCP Request  │  │  /mcp - Protected with Bearer Auth      │ │
         ├─────────────────►│  │  (requireBearerAuth middleware)         │ │
         │                  │  └─────────────────────────────────────────┘ │
         │                  │                                              │
         │                  │  ┌─────────────────────────────────────────┐ │
         │                  │  │  Admin Dashboard (Basic Auth)           │ │
         │                  │  │  /admin/oauth/sessions - View sessions  │ │
         │                  │  │  /admin/oauth/clients  - View clients   │ │
         │                  │  └─────────────────────────────────────────┘ │
         │                  │                                              │
         │                  │  ┌─────────────────────────────────────────┐ │
         │                  │  │  Prisma Database (SQLite)               │ │
         │                  │  │  - OAuthClient                          │ │
         │                  │  │  - AuthorizationCode                    │ │
         │                  │  │  - AccessToken                          │ │
         │                  │  │  - RefreshToken                         │ │
         │                  │  │  - OAuthSession                         │ │
         │                  │  └─────────────────────────────────────────┘ │
         │                  └──────────────────────────────────────────────┘
```

## OAuth Flow

### 1. Discovery

The MCP client discovers OAuth is required by fetching the protected resource metadata:

```bash
curl http://localhost:3847/.well-known/oauth-protected-resource
```

This returns the authorization server URL, which the client then queries:

```bash
curl http://localhost:3847/.well-known/oauth-authorization-server
```

### 2. Dynamic Client Registration

The client registers itself with the server:

```bash
curl -X POST http://localhost:3847/register \
  -H "Content-Type: application/json" \
  -d '{
    "redirect_uris": ["http://localhost:8080/callback"],
    "client_name": "Claude Code"
  }'
```

Response includes `client_id` and optionally `client_secret`.

### 3. Authorization

The client redirects the user to the authorization page:

```
http://localhost:3847/authorize?
  client_id=<client_id>&
  redirect_uri=http://localhost:8080/callback&
  response_type=code&
  code_challenge=<PKCE_challenge>&
  code_challenge_method=S256&
  scope=mcp:read%20mcp:write&
  state=<random_state>
```

The user sees a login page, enters credentials (same as admin dashboard), and approves. On success, the browser redirects to the callback URL with an authorization code.

### 4. Token Exchange

The client exchanges the authorization code for tokens:

```bash
curl -X POST http://localhost:3847/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code" \
  -d "code=<authorization_code>" \
  -d "redirect_uri=http://localhost:8080/callback" \
  -d "client_id=<client_id>" \
  -d "code_verifier=<PKCE_verifier>"
```

Response:
```json
{
  "access_token": "axon_at_...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "axon_rt_...",
  "scope": "mcp:read mcp:write"
}
```

### 5. MCP Requests

The client uses the access token for MCP requests:

```bash
curl -X POST http://localhost:3847/mcp \
  -H "Authorization: Bearer axon_at_..." \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

### 6. Token Refresh

When the access token expires, use the refresh token:

```bash
curl -X POST http://localhost:3847/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=refresh_token" \
  -d "refresh_token=axon_rt_..." \
  -d "client_id=<client_id>"
```

## Scopes

| Scope | Description |
|-------|-------------|
| `mcp:read` | Read Axon examples, docs, query SkySpark data |
| `mcp:write` | Execute Axon code, modify SkySpark data |
| `mcp:admin` | Full administrative access |

## User access keys

A user access key is a long-lived bearer token that belongs to one dashboard
user. It is for clients that cannot do the OAuth browser login, such as the
IntelliJ plugin. One key works on `/api/ide` and on `/mcp`.

| Item | Value |
|------|-------|
| Key text | `axk_<8 hex>_<43 random characters>` |
| Prefix | `axk_<8 hex>`: shown on the dashboard and in logs |
| Storage | table `user_api_keys`: sha256 hash of the key, never the key |
| Shown | one time, in the reply of "create a key" |
| Expiry | optional (1 to 3650 days), or never |
| Who makes a key | an admin only |
| Who revokes a key | an admin, or the user for their own key |

### One check for both doors

`src/auth/bearerVerifier.ts` is the bearer check of `/api/ide` and `/mcp`:

1. A token that starts with `axk_` is looked up by its hash. A key that is
   unknown, revoked or expired is refused.
2. Any other token goes to the OAuth provider (when OAuth is on).
3. In both cases the user is loaded by id from the user store. A user that
   is deleted or disabled is refused. A token with no user is refused.
4. The role comes from the user, not from the key or the token.

Every refusal gives the client the same text, `Invalid access token`. The
server log has the true reason and the key prefix.

### Roles

| Role | `/api/ide` | `/mcp` tools | Dashboard API (`/admin`) |
|------|-----------|--------------|--------------------------|
| `admin` | all | all | all |
| `user` | all | all | as before |
| `readonly` | list, export, sync; no commit (403) | read tools only | read only (own password and own key revoke stay open) |

On `/mcp` a read-only user cannot call the write tools: `executeAxonCode`,
`commitAxonFunction`, `queryHaystack`, `getProjectSchema`,
`saveProjectWorkflow`, `clearProjectCache`, `setPrimaryProject`,
`reauthenticateSkySparkProject`, `discoverInstanceProjects`,
`buildProjectGraph` and `buildProjectEmbeddings`. `queryHaystack` and
`getProjectSchema` are on the list because their filter text is sent to
SkySpark as Axon. The lists are in `src/auth/toolAccess.ts`. A tool that is
on no list is refused for a read-only user.

**The role rule on `/mcp` needs a token.** While `MCP_REQUIRE_AUTH` is off, a
call with no token is anonymous and no role rule applies to it. Set
`MCP_REQUIRE_AUTH=true` when every MCP client sends a key or logs in.

### Things to know

- A key never works on `/admin`. The dashboard API uses Basic auth.
- A lost key cannot be shown again. Revoke it and make a new one.
- Behind mcp-proxy the server sees the key of the proxy, not of each
  developer. The access record then names the proxy's user.
- The keys are in `.cache/usage.db`. "Reset database" on the Usage page
  deletes that file and with it all keys (admin only).
- A backup restore on the same host keeps the keys: the restore does not
  touch `user_api_keys`. The backup file does not hold the keys, so a new
  host starts with none.
- Keys that were revoked or that expired more than 90 days ago are deleted by
  the cleanup job. Access record rows are kept for 365 days.

### Admin API

All routes use Basic auth and send `Cache-Control: no-store`.

| Route | Who | Use |
|-------|-----|-----|
| `POST /admin/users/:username/keys` | admin | Make a key. Body `{"name": "...", "expiresInDays": 365}` (`null` = no expiry). `201` with the row and `key`. |
| `GET /admin/users/:username/keys` | admin, or the user | List the keys of one user. |
| `DELETE /admin/users/:username/keys/:id` | admin, or the user | Revoke a key. |
| `PUT /admin/users/:username/disabled` | admin | Body `{"disabled": true}`. |
| `GET /admin/access/keys` | admin | All keys. |
| `GET /admin/access/audit?limit=100` | admin | The access record, newest first. |

```bash
# Made-up names. Make a key for alice that expires in 90 days:
curl -s -u admin1 -X POST -H "Content-Type: application/json" \
  -d '{"name":"laptop IntelliJ","expiresInDays":90}' \
  http://localhost:3847/admin/users/alice/keys
```

## Token Expiration

| Token Type | Default TTL | Configurable |
|------------|-------------|--------------|
| Authorization Code | 10 minutes | No |
| Access Token | 1 hour | Yes |
| Refresh Token | 30 days | Yes |

Configure in `config/axonMcpServer-config.json`:

```json
{
  "oauth": {
    "enabled": true,
    "accessTokenTtl": 3600,
    "refreshTokenTtl": 2592000,
    "scopesSupported": ["mcp:read", "mcp:write", "mcp:admin"]
  }
}
```

## Key Files

| File | Purpose |
|------|---------|
| `src/auth/oauthProvider.ts` | Core OAuth provider implementing `OAuthServerProvider` |
| `src/auth/prismaClientsStore.ts` | Stores registered OAuth clients in Prisma |
| `src/auth/authorizePage.ts` | Renders the login/consent HTML page |
| `src/auth/tokenUtils.ts` | Token generation, PKCE validation |
| `src/auth/tokenCleanup.ts` | Background job to delete expired tokens, old keys and old access records |
| `src/auth/userKeys.ts` | User access keys: make, find by hash, revoke |
| `src/auth/bearerVerifier.ts` | The bearer check of `/api/ide` and `/mcp` (key or OAuth token, then the user) |
| `src/auth/toolAccess.ts` | Read and write lists of the MCP tools for the role rule |
| `src/auth/accessAudit.ts` | The access record |
| `src/admin/userKeys.ts` | Admin API for keys, the disabled switch and the access record |
| `src/admin/routes.ts` | Admin API endpoints for OAuth management |
| `dashboard/src/app/sessions/page.tsx` | Sessions management UI |
| `prisma/schema.prisma` | Database schema for OAuth tables |

## Admin Dashboard

The OAuth sessions page at `/dashboard/sessions` provides:

- **Sessions Tab**: View all active OAuth sessions
  - Client name and ID
  - User who authorized
  - Scopes granted
  - Created time and last activity
  - User agent and IP address
  - Revoke individual sessions

- **Access keys Tab**: All user access keys (user, name, prefix, state,
  last used, used from, expires, revoke) and the recent IDE and commit
  activity

- **Clients Tab**: View registered OAuth clients
  - Client ID and name
  - Registered redirect URIs
  - Allowed scopes
  - Delete clients (revokes all sessions)

## Admin API Endpoints

All endpoints require Basic Auth with admin credentials.

### List OAuth Sessions

```bash
curl -u admin:admin http://localhost:3847/admin/oauth/sessions
```

Response:
```json
[
  {
    "id": "uuid",
    "sessionId": "session_...",
    "clientId": "client_...",
    "clientName": "Claude Code",
    "userId": "user_uuid",
    "scope": "mcp:read mcp:write",
    "createdAt": "2026-01-16T10:00:00Z",
    "lastActivity": "2026-01-16T11:30:00Z",
    "userAgent": "Claude-Code/1.0",
    "ipAddress": "127.0.0.1"
  }
]
```

### Revoke a Session

```bash
curl -X DELETE -u admin:admin \
  http://localhost:3847/admin/oauth/sessions/{sessionId}
```

### List OAuth Clients

```bash
curl -u admin:admin http://localhost:3847/admin/oauth/clients
```

### Delete a Client

Deleting a client also revokes all its sessions:

```bash
curl -X DELETE -u admin:admin \
  http://localhost:3847/admin/oauth/clients/{clientId}
```

## Database Schema

OAuth data is stored in SQLite via Prisma:

```prisma
model OAuthClient {
  id           String   @id @default(uuid())
  clientId     String   @unique @map("client_id")
  clientSecret String?  @map("client_secret")
  clientName   String?  @map("client_name")
  redirectUris String   @map("redirect_uris")  // JSON array
  scope        String?
  createdAt    DateTime @default(now())
}

model AuthorizationCode {
  id            String   @id @default(uuid())
  code          String   @unique
  clientId      String   @map("client_id")
  userId        String?  @map("user_id")
  redirectUri   String   @map("redirect_uri")
  scope         String?
  codeChallenge String   @map("code_challenge")
  expiresAt     DateTime @map("expires_at")
  used          Boolean  @default(false)
}

model AccessToken {
  id        String    @id @default(uuid())
  token     String    @unique
  clientId  String    @map("client_id")
  userId    String?   @map("user_id")
  scope     String?
  expiresAt DateTime  @map("expires_at")
  revokedAt DateTime? @map("revoked_at")
}

model RefreshToken {
  id        String    @id @default(uuid())
  token     String    @unique
  clientId  String    @map("client_id")
  userId    String?   @map("user_id")
  scope     String?
  expiresAt DateTime  @map("expires_at")
  revokedAt DateTime? @map("revoked_at")
}

model OAuthSession {
  id           String   @id @default(uuid())
  sessionId    String   @unique @map("session_id")
  clientId     String   @map("client_id")
  clientName   String?  @map("client_name")
  userId       String?  @map("user_id")
  scope        String?
  createdAt    DateTime @default(now())
  lastActivity DateTime @default(now())
  userAgent    String?  @map("user_agent")
  ipAddress    String?  @map("ip_address")
}
```

## Token Cleanup

The `TokenCleanupJob` runs every hour to:

1. Delete expired authorization codes
2. Delete expired access tokens
3. Delete expired refresh tokens
4. Remove sessions for revoked tokens

Start/stop manually if needed:

```typescript
// In your code
tokenCleanupJob.start();  // Start hourly cleanup
tokenCleanupJob.stop();   // Stop cleanup job
await tokenCleanupJob.runOnce();  // Run cleanup immediately
```

## Claude Code Configuration

To connect Claude Code with OAuth:

```json
{
  "mcpServers": {
    "axon": {
      "url": "http://localhost:3847/mcp",
      "oauth": {
        "scopes": ["mcp:read", "mcp:write"]
      }
    }
  }
}
```

Claude Code will automatically:
1. Discover OAuth metadata
2. Register as a client
3. Open browser for authorization
4. Exchange code for tokens
5. Use Bearer auth for MCP requests

## Security Considerations

- **PKCE Required**: All authorization requests must use PKCE (code_challenge)
- **Token Prefixes**: Tokens are prefixed for easy identification:
  - `axon_ac_` - Authorization codes
  - `axon_at_` - Access tokens
  - `axon_rt_` - Refresh tokens
- **Secure Storage**: Tokens are hashed before storage in the database
- **Session Tracking**: All active sessions are tracked for audit and revocation
- **Automatic Cleanup**: Expired tokens are automatically purged

## Troubleshooting

### "OAuth is not enabled"

Ensure the server is running in HTTP mode:
```bash
MCP_TRANSPORT=http node dist/index.js
```

### "Invalid client"

The client may not be registered. Check registered clients:
```bash
curl -u admin:admin http://localhost:3847/admin/oauth/clients
```

### "Token expired"

Use the refresh token to get a new access token, or re-authorize.

### Session not appearing in dashboard

Ensure the authorization completed successfully and a token was issued. Check server logs for errors.
