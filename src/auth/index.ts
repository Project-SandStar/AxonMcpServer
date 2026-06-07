/**
 * OAuth 2.1 authentication module for Axon MCP Server
 */

export { AxonOAuthProvider, OAuthProviderConfig } from './oauthProvider.js';
export { PrismaClientsStore } from './prismaClientsStore.js';
export { TokenCleanupJob, TokenCleanupConfig } from './tokenCleanup.js';
export { renderAuthorizePage, renderErrorPage, AuthorizePageParams } from './authorizePage.js';
export {
  TOKEN_EXPIRY,
  generateToken,
  generateAuthorizationCode,
  generateAccessToken,
  generateRefreshToken,
  generateClientId,
  generateClientSecret,
  calculateExpiry,
  isExpired,
  createCodeChallenge,
  verifyCodeChallenge,
  isValidCodeVerifier,
  isValidCodeChallenge,
  isValidRedirectUri,
  parseScope,
  scopeToString,
  validateScopes,
  extractBearerToken,
  hashToken,
} from './tokenUtils.js';
