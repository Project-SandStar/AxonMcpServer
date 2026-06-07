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
| `src/auth/tokenCleanup.ts` | Background job to delete expired tokens |
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
