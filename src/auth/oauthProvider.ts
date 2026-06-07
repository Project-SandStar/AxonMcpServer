/**
 * OAuth 2.1 Server Provider for Axon MCP Server
 * Implements the MCP SDK OAuthServerProvider interface with Prisma persistence
 */

import { Response } from 'express';
import { PrismaClient } from '../generated/prisma/client.js';
import { OAuthServerProvider, AuthorizationParams } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import { OAuthClientInformationFull, OAuthTokens, OAuthTokenRevocationRequest } from '@modelcontextprotocol/sdk/shared/auth.js';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { PrismaClientsStore } from './prismaClientsStore.js';
import { renderAuthorizePage, renderErrorPage } from './authorizePage.js';
import {
  generateAuthorizationCode,
  generateAccessToken,
  generateRefreshToken,
  calculateExpiry,
  isExpired,
  TOKEN_EXPIRY,
  parseScope,
  scopeToString,
} from './tokenUtils.js';
import { UserStore } from '../admin/userStore.js';

export interface OAuthProviderConfig {
  accessTokenTtl?: number;  // seconds, default 3600 (1 hour)
  refreshTokenTtl?: number; // seconds, default 2592000 (30 days)
  scopesSupported?: string[]; // default scopes for new clients
}

export class AxonOAuthProvider implements OAuthServerProvider {
  private readonly _clientsStore: PrismaClientsStore;
  private readonly accessTokenTtl: number;
  private readonly refreshTokenTtl: number;

  constructor(
    private prisma: PrismaClient,
    private userStore: UserStore,
    config: OAuthProviderConfig = {}
  ) {
    const defaultScopes = config.scopesSupported || ['mcp:read', 'mcp:write'];
    this._clientsStore = new PrismaClientsStore(prisma, defaultScopes);
    this.accessTokenTtl = config.accessTokenTtl || TOKEN_EXPIRY.ACCESS_TOKEN;
    this.refreshTokenTtl = config.refreshTokenTtl || TOKEN_EXPIRY.REFRESH_TOKEN;
  }

  /**
   * Returns the OAuth clients store
   */
  get clientsStore(): OAuthRegisteredClientsStore {
    return this._clientsStore;
  }

  /**
   * Handle the authorization request - render login page or process login
   */
  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response
  ): Promise<void> {
    const { state, scopes, codeChallenge, redirectUri } = params;

    // For GET requests, render the login page
    // For POST requests (handled separately), process the login
    const html = renderAuthorizePage({
      client,
      scopes: scopes || [],
      state,
      codeChallenge,
      redirectUri,
    });

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  }

  /**
   * Process the authorization form submission (called from custom route)
   */
  async processAuthorization(
    clientId: string,
    username: string,
    password: string,
    redirectUri: string,
    codeChallenge: string,
    scope: string,
    state?: string,
    userAgent?: string,
    ipAddress?: string
  ): Promise<{ success: true; code: string; state?: string } | { success: false; error: string }> {
    // Authenticate user
    const user = this.userStore.authenticate(username, password);
    if (!user) {
      return { success: false, error: 'Invalid username or password' };
    }

    // Generate authorization code
    const code = generateAuthorizationCode();
    const expiresAt = calculateExpiry(TOKEN_EXPIRY.AUTHORIZATION_CODE);

    // Store authorization code
    await this.prisma.authorizationCode.create({
      data: {
        code,
        clientId,
        userId: user.id,
        redirectUri,
        scope,
        codeChallenge,
        codeChallengeMethod: 'S256',
        expiresAt,
      },
    });

    // Create OAuth session for tracking
    await this.prisma.oAuthSession.create({
      data: {
        sessionId: code, // Use code as initial session ID, will be replaced with access token
        clientId,
        clientName: (await this._clientsStore.getClient(clientId))?.client_name || null,
        userId: user.id,
        scope,
        userAgent,
        ipAddress,
      },
    });

    return { success: true, code, state };
  }

  /**
   * Returns the code challenge stored for an authorization code
   */
  async challengeForAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string
  ): Promise<string> {
    const codeRecord = await this.prisma.authorizationCode.findUnique({
      where: { code: authorizationCode },
    });

    if (!codeRecord) {
      throw new Error('Invalid authorization code');
    }

    if (codeRecord.clientId !== client.client_id) {
      throw new Error('Authorization code was not issued to this client');
    }

    if (codeRecord.used) {
      throw new Error('Authorization code has already been used');
    }

    if (isExpired(codeRecord.expiresAt)) {
      throw new Error('Authorization code has expired');
    }

    return codeRecord.codeChallenge;
  }

  /**
   * Exchange an authorization code for tokens
   */
  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    codeVerifier?: string,
    redirectUri?: string,
    resource?: URL
  ): Promise<OAuthTokens> {
    // Find and validate the authorization code
    const codeRecord = await this.prisma.authorizationCode.findUnique({
      where: { code: authorizationCode },
    });

    if (!codeRecord) {
      throw new Error('Invalid authorization code');
    }

    if (codeRecord.clientId !== client.client_id) {
      throw new Error('Authorization code was not issued to this client');
    }

    if (codeRecord.used) {
      throw new Error('Authorization code has already been used');
    }

    if (isExpired(codeRecord.expiresAt)) {
      // Clean up expired code
      await this.prisma.authorizationCode.delete({ where: { code: authorizationCode } });
      throw new Error('Authorization code has expired');
    }

    if (redirectUri && redirectUri !== codeRecord.redirectUri) {
      throw new Error('Redirect URI mismatch');
    }

    // Mark authorization code as used
    await this.prisma.authorizationCode.update({
      where: { code: authorizationCode },
      data: { used: true },
    });

    // Generate tokens
    const accessToken = generateAccessToken();
    const refreshToken = generateRefreshToken();
    const accessExpiresAt = calculateExpiry(this.accessTokenTtl);
    const refreshExpiresAt = calculateExpiry(this.refreshTokenTtl);

    // Store tokens
    await this.prisma.accessToken.create({
      data: {
        token: accessToken,
        clientId: client.client_id,
        userId: codeRecord.userId,
        scope: codeRecord.scope,
        expiresAt: accessExpiresAt,
      },
    });

    await this.prisma.refreshToken.create({
      data: {
        token: refreshToken,
        clientId: client.client_id,
        userId: codeRecord.userId,
        scope: codeRecord.scope,
        expiresAt: refreshExpiresAt,
      },
    });

    // Update session with access token as session ID
    await this.prisma.oAuthSession.updateMany({
      where: { sessionId: authorizationCode },
      data: {
        sessionId: accessToken,
        lastActivity: new Date(),
      },
    });

    return {
      access_token: accessToken,
      token_type: 'bearer',
      expires_in: this.accessTokenTtl,
      refresh_token: refreshToken,
      scope: codeRecord.scope || undefined,
    };
  }

  /**
   * Exchange a refresh token for a new access token
   */
  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    scopes?: string[],
    resource?: URL
  ): Promise<OAuthTokens> {
    // Find and validate the refresh token
    const tokenRecord = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
    });

    if (!tokenRecord) {
      throw new Error('Invalid refresh token');
    }

    if (tokenRecord.clientId !== client.client_id) {
      throw new Error('Refresh token was not issued to this client');
    }

    if (tokenRecord.revokedAt) {
      throw new Error('Refresh token has been revoked');
    }

    if (isExpired(tokenRecord.expiresAt)) {
      throw new Error('Refresh token has expired');
    }

    // Validate requested scopes (must be subset of original)
    const originalScopes = parseScope(tokenRecord.scope || '');
    const requestedScopes = scopes || originalScopes;

    if (!requestedScopes.every(s => originalScopes.includes(s))) {
      throw new Error('Requested scopes exceed original grant');
    }

    // Generate new access token
    const newAccessToken = generateAccessToken();
    const accessExpiresAt = calculateExpiry(this.accessTokenTtl);

    // Store new access token
    await this.prisma.accessToken.create({
      data: {
        token: newAccessToken,
        clientId: client.client_id,
        userId: tokenRecord.userId,
        scope: scopeToString(requestedScopes),
        expiresAt: accessExpiresAt,
      },
    });

    // Update session
    await this.prisma.oAuthSession.updateMany({
      where: { clientId: client.client_id, userId: tokenRecord.userId || undefined },
      data: {
        sessionId: newAccessToken,
        lastActivity: new Date(),
      },
    });

    return {
      access_token: newAccessToken,
      token_type: 'bearer',
      expires_in: this.accessTokenTtl,
      scope: scopeToString(requestedScopes),
      // Don't return a new refresh token - use the existing one
    };
  }

  /**
   * Verify an access token and return auth info
   */
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const tokenRecord = await this.prisma.accessToken.findUnique({
      where: { token },
    });

    if (!tokenRecord) {
      throw new Error('Invalid access token');
    }

    if (tokenRecord.revokedAt) {
      throw new Error('Access token has been revoked');
    }

    if (isExpired(tokenRecord.expiresAt)) {
      throw new Error('Access token has expired');
    }

    // Update session last activity
    await this.prisma.oAuthSession.updateMany({
      where: { sessionId: token },
      data: { lastActivity: new Date() },
    });

    return {
      token,
      clientId: tokenRecord.clientId,
      scopes: parseScope(tokenRecord.scope || ''),
      expiresAt: Math.floor(tokenRecord.expiresAt.getTime() / 1000),
    };
  }

  /**
   * Revoke an access or refresh token
   */
  async revokeToken(
    client: OAuthClientInformationFull,
    request: OAuthTokenRevocationRequest
  ): Promise<void> {
    const { token, token_type_hint } = request;

    // Try to revoke as access token first (or if hinted)
    if (!token_type_hint || token_type_hint === 'access_token') {
      const accessToken = await this.prisma.accessToken.findUnique({
        where: { token },
      });

      if (accessToken && accessToken.clientId === client.client_id) {
        await this.prisma.accessToken.update({
          where: { token },
          data: { revokedAt: new Date() },
        });

        // Also delete the session
        await this.prisma.oAuthSession.deleteMany({
          where: { sessionId: token },
        });
        return;
      }
    }

    // Try to revoke as refresh token
    if (!token_type_hint || token_type_hint === 'refresh_token') {
      const refreshToken = await this.prisma.refreshToken.findUnique({
        where: { token },
      });

      if (refreshToken && refreshToken.clientId === client.client_id) {
        await this.prisma.refreshToken.update({
          where: { token },
          data: { revokedAt: new Date() },
        });

        // Also revoke all associated access tokens
        await this.prisma.accessToken.updateMany({
          where: {
            clientId: client.client_id,
            userId: refreshToken.userId,
            revokedAt: null,
          },
          data: { revokedAt: new Date() },
        });

        // Delete associated sessions
        await this.prisma.oAuthSession.deleteMany({
          where: {
            clientId: client.client_id,
            userId: refreshToken.userId || undefined,
          },
        });
        return;
      }
    }

    // Per RFC 7009, we should not return an error if the token is invalid
    // Just silently succeed
  }

  /**
   * Get all active OAuth sessions (for admin dashboard)
   */
  async getSessions(): Promise<Array<{
    id: string;
    sessionId: string;
    clientId: string;
    clientName: string | null;
    userId: string | null;
    scope: string | null;
    createdAt: Date;
    lastActivity: Date;
    userAgent: string | null;
    ipAddress: string | null;
  }>> {
    return this.prisma.oAuthSession.findMany({
      orderBy: { lastActivity: 'desc' },
    });
  }

  /**
   * Revoke a session by ID (for admin dashboard)
   */
  async revokeSession(sessionId: string): Promise<boolean> {
    try {
      // Find the session
      const session = await this.prisma.oAuthSession.findUnique({
        where: { sessionId },
      });

      if (!session) {
        return false;
      }

      // Revoke the access token
      await this.prisma.accessToken.updateMany({
        where: { token: sessionId },
        data: { revokedAt: new Date() },
      });

      // Delete the session
      await this.prisma.oAuthSession.delete({
        where: { sessionId },
      });

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Revoke all sessions for a client (for admin dashboard)
   */
  async revokeAllSessionsForClient(clientId: string): Promise<number> {
    // Revoke all access tokens for the client
    const result = await this.prisma.accessToken.updateMany({
      where: { clientId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    // Revoke all refresh tokens for the client
    await this.prisma.refreshToken.updateMany({
      where: { clientId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    // Delete all sessions for the client
    await this.prisma.oAuthSession.deleteMany({
      where: { clientId },
    });

    return result.count;
  }
}
