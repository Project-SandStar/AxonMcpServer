/**
 * Token utilities for OAuth 2.1 implementation
 * Handles token generation, PKCE validation, and expiry management
 */

import * as crypto from 'crypto';

// Token expiration constants (in seconds)
export const TOKEN_EXPIRY = {
  AUTHORIZATION_CODE: 10 * 60,      // 10 minutes
  ACCESS_TOKEN: 60 * 60,            // 1 hour
  REFRESH_TOKEN: 30 * 24 * 60 * 60, // 30 days
};

/**
 * Generate a cryptographically secure random token
 */
export function generateToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('base64url');
}

/**
 * Generate a cryptographically secure authorization code
 */
export function generateAuthorizationCode(): string {
  return generateToken(32);
}

/**
 * Generate an access token
 */
export function generateAccessToken(): string {
  return generateToken(48);
}

/**
 * Generate a refresh token
 */
export function generateRefreshToken(): string {
  return generateToken(64);
}

/**
 * Generate a client ID for dynamic client registration
 */
export function generateClientId(): string {
  return crypto.randomUUID();
}

/**
 * Generate a client secret for confidential clients
 */
export function generateClientSecret(): string {
  return generateToken(32);
}

/**
 * Calculate expiry date from now
 */
export function calculateExpiry(seconds: number): Date {
  return new Date(Date.now() + seconds * 1000);
}

/**
 * Check if a date has expired
 */
export function isExpired(expiresAt: Date): boolean {
  return new Date() > expiresAt;
}

/**
 * PKCE (Proof Key for Code Exchange) utilities
 * OAuth 2.1 requires PKCE for all clients
 */

/**
 * Create a SHA-256 hash of the code verifier
 * Used to verify PKCE code_challenge with method S256
 */
export function createCodeChallenge(codeVerifier: string): string {
  return crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');
}

/**
 * Verify that the code_verifier matches the code_challenge
 * Supports S256 (default) and plain methods
 */
export function verifyCodeChallenge(
  codeVerifier: string,
  codeChallenge: string,
  method: 'S256' | 'plain' = 'S256'
): boolean {
  if (method === 'plain') {
    // Plain method: code_challenge == code_verifier
    return codeVerifier === codeChallenge;
  }

  // S256 method: code_challenge == BASE64URL(SHA256(code_verifier))
  const computedChallenge = createCodeChallenge(codeVerifier);
  return computedChallenge === codeChallenge;
}

/**
 * Validate code_verifier format
 * Must be between 43 and 128 characters, using only A-Z, a-z, 0-9, -, ., _, ~
 */
export function isValidCodeVerifier(codeVerifier: string): boolean {
  if (!codeVerifier || codeVerifier.length < 43 || codeVerifier.length > 128) {
    return false;
  }
  return /^[A-Za-z0-9\-._~]+$/.test(codeVerifier);
}

/**
 * Validate code_challenge format
 */
export function isValidCodeChallenge(codeChallenge: string): boolean {
  if (!codeChallenge || codeChallenge.length < 43 || codeChallenge.length > 128) {
    return false;
  }
  return /^[A-Za-z0-9\-_]+$/.test(codeChallenge);
}

/**
 * Parse and validate redirect URI
 */
export function isValidRedirectUri(uri: string, allowedPatterns: string[]): boolean {
  try {
    const parsed = new URL(uri);

    // Only allow http for localhost, https otherwise
    if (parsed.protocol === 'http:') {
      if (!['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)) {
        return false;
      }
    } else if (parsed.protocol !== 'https:') {
      return false;
    }

    // Check against allowed patterns
    for (const pattern of allowedPatterns) {
      if (matchRedirectPattern(uri, pattern)) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Match a redirect URI against a pattern
 * Supports * as wildcard for port
 */
function matchRedirectPattern(uri: string, pattern: string): boolean {
  try {
    const uriParsed = new URL(uri);

    // Handle wildcard port pattern like "http://localhost:*"
    if (pattern.includes(':*')) {
      const patternBase = pattern.replace(':*', '');
      const patternParsed = new URL(patternBase + ':80');
      return (
        uriParsed.protocol === patternParsed.protocol &&
        uriParsed.hostname === patternParsed.hostname
      );
    }

    // Exact match (ignoring trailing slashes)
    const normalizedUri = uri.replace(/\/$/, '');
    const normalizedPattern = pattern.replace(/\/$/, '');
    return normalizedUri.startsWith(normalizedPattern);
  } catch {
    return false;
  }
}

/**
 * Parse scope string into array
 */
export function parseScope(scope: string | undefined): string[] {
  if (!scope) return [];
  return scope.split(/\s+/).filter(s => s.length > 0);
}

/**
 * Join scope array into string
 */
export function scopeToString(scopes: string[]): string {
  return scopes.join(' ');
}

/**
 * Check if requested scopes are subset of allowed scopes
 */
export function validateScopes(requested: string[], allowed: string[]): boolean {
  if (allowed.length === 0) return true; // No restrictions
  return requested.every(scope => allowed.includes(scope));
}

/**
 * Extract bearer token from Authorization header
 */
export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7);
}

/**
 * Hash a token for secure storage (for high-security scenarios)
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
