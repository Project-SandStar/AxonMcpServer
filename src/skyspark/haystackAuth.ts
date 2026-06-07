import crypto from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * Implements the Haystack HTTP Authentication Protocol
 * as defined in https://project-haystack.org/doc/docHaystack/Auth
 */

export interface AuthConfig {
  baseUrl: string;
  username: string;
  password: string;
  authPath?: string; // defaults to '/about'
}

export interface AuthToken {
  token: string;
  expiresAt?: Date;
}

export interface CachedSession {
  authToken: string;
  timestamp: number;
  instance: string;
  username: string;
  // Session is instance-wide, works for all projects on this instance
  projects?: string[];  // Track which projects have used this session
  // Session validity period in ms (default 24 hours)
  maxAge?: number;
}

/**
 * Base64url encoding (without padding) as per RFC4648
 */
function base64UrlEncode(data: string | Buffer): string {
  const base64 = Buffer.from(data).toString('base64');
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Base64url decoding
 */
function base64UrlDecode(data: string): Buffer {
  // Add padding back
  let padded = data.replace(/-/g, '+').replace(/_/g, '/');
  while (padded.length % 4) {
    padded += '=';
  }
  return Buffer.from(padded, 'base64');
}

/**
 * Parse authentication headers from server response
 */
function parseAuthHeader(header: string): Map<string, string> {
  const params = new Map<string, string>();
  
  // Remove the scheme (e.g., "SCRAM ") if present
  const paramsStr = header.replace(/^[A-Z]+\s+/, '');
  
  // Parse key=value pairs
  const pairs = paramsStr.match(/(\w+)=([^,\s]+)/g) || [];
  for (const pair of pairs) {
    const [key, value] = pair.split('=');
    params.set(key.trim(), value.trim());
  }
  
  return params;
}

/**
 * SCRAM-SHA-256 implementation for Haystack authentication
 */
class ScramAuth {
  private username: string;
  private password: string;
  private clientNonce: string;
  private serverNonce?: string;
  private salt?: Buffer;
  private iterations?: number;
  private clientFirstMessage?: string;
  private serverFirstMessage?: string;
  
  constructor(username: string, password: string) {
    this.username = username;
    this.password = password;
    this.clientNonce = crypto.randomBytes(16).toString('hex');
  }
  
  /**
   * Generate the first client message (after HELLO)
   */
  getClientFirstMessage(): string {
    // Format: n,,n=<username>,r=<client-nonce>
    const bare = `n=${this.username},r=${this.clientNonce}`;
    this.clientFirstMessage = `n,,${bare}`;
    return base64UrlEncode(this.clientFirstMessage);
  }
  
  /**
   * Process server's first response and generate client final message
   */
  processServerFirst(serverFirst: string): string {
    this.serverFirstMessage = serverFirst;
    
    // Parse server message: r=<nonce>,s=<salt>,i=<iterations>
    const parts = serverFirst.split(',');
    const paramsMap = new Map<string, string>();
    for (const part of parts) {
      const [key, value] = part.split('=');
      paramsMap.set(key, value);
    }
    
    this.serverNonce = paramsMap.get('r');
    const saltBase64 = paramsMap.get('s');
    this.iterations = parseInt(paramsMap.get('i') || '4096', 10);
    
    if (!this.serverNonce || !saltBase64) {
      throw new Error('Invalid server first message');
    }
    
    // Verify server nonce starts with client nonce
    if (!this.serverNonce.startsWith(this.clientNonce)) {
      throw new Error('Server nonce does not match client nonce');
    }
    
    this.salt = Buffer.from(saltBase64, 'base64');
    
    // Calculate client proof
    const clientFinalWithoutProof = `c=biws,r=${this.serverNonce}`;
    
    // Calculate SaltedPassword
    const saltedPassword = crypto.pbkdf2Sync(
      this.password,
      this.salt,
      this.iterations,
      32,
      'sha256'
    );
    
    // Calculate ClientKey
    const clientKey = crypto
      .createHmac('sha256', saltedPassword)
      .update('Client Key')
      .digest();
    
    // Calculate StoredKey
    const storedKey = crypto
      .createHash('sha256')
      .update(clientKey)
      .digest();
    
    // Calculate AuthMessage
    const clientFirstBare = this.clientFirstMessage!.substring(3); // Remove "n,,"
    const authMessage = `${clientFirstBare},${serverFirst},${clientFinalWithoutProof}`;
    
    // Calculate ClientSignature
    const clientSignature = crypto
      .createHmac('sha256', storedKey)
      .update(authMessage)
      .digest();
    
    // Calculate ClientProof = ClientKey XOR ClientSignature
    const clientProof = Buffer.alloc(clientKey.length);
    for (let i = 0; i < clientKey.length; i++) {
      clientProof[i] = clientKey[i] ^ clientSignature[i];
    }
    
    // Return client final message
    const clientFinal = `${clientFinalWithoutProof},p=${clientProof.toString('base64')}`;
    return base64UrlEncode(clientFinal);
  }
  
  /**
   * Verify server's final message
   */
  verifyServerFinal(serverFinal: string): boolean {
    // Parse server message: v=<server-signature>
    const parts = serverFinal.split(',');
    const paramsMap = new Map<string, string>();
    for (const part of parts) {
      const [key, value] = part.split('=');
      paramsMap.set(key, value);
    }
    
    const serverSignatureBase64 = paramsMap.get('v');
    if (!serverSignatureBase64) {
      return false;
    }
    
    // Calculate expected server signature
    const saltedPassword = crypto.pbkdf2Sync(
      this.password,
      this.salt!,
      this.iterations!,
      32,
      'sha256'
    );
    
    const serverKey = crypto
      .createHmac('sha256', saltedPassword)
      .update('Server Key')
      .digest();
    
    const clientFirstBare = this.clientFirstMessage!.substring(3);
    const clientFinalWithoutProof = `c=biws,r=${this.serverNonce}`;
    const authMessage = `${clientFirstBare},${this.serverFirstMessage},${clientFinalWithoutProof}`;
    
    const expectedServerSignature = crypto
      .createHmac('sha256', serverKey)
      .update(authMessage)
      .digest();
    
    const receivedServerSignature = Buffer.from(serverSignatureBase64, 'base64');
    
    return expectedServerSignature.equals(receivedServerSignature);
  }
}

/**
 * Haystack Authentication Client with Session Caching
 */
export class HaystackAuthClient {
  private config: AuthConfig;
  private authToken?: AuthToken;
  private cacheDir: string;
  private sessionMaxAge: number; // in milliseconds
  private instanceName?: string;
  private projectName?: string;
  
  constructor(config: AuthConfig, options?: {
    cacheDir?: string;
    sessionMaxAge?: number;
    instanceName?: string;
    projectName?: string;
  }) {
    this.config = {
      ...config,
      authPath: config.authPath || '/about'
    };
    this.cacheDir = options?.cacheDir || path.join(process.cwd(), '.cache');
    this.sessionMaxAge = options?.sessionMaxAge || 24 * 60 * 60 * 1000; // 24 hours default
    this.instanceName = options?.instanceName;
    this.projectName = options?.projectName;
  }
  
  /**
   * Get cache file path for session storage
   * Uses instance + username as key (not project-specific)
   * This allows session reuse across all projects on the same instance
   */
  private getCacheFilePath(): string {
    // Use instance name + username for the cache key
    // This allows the same session to be reused across all projects
    if (this.instanceName) {
      return path.join(this.cacheDir, `session-${this.instanceName}-${this.config.username}.json`);
    }
    
    // Fallback: use baseUrl + username as cache key
    const baseUrlHash = crypto.createHash('md5').update(this.config.baseUrl).digest('hex').substring(0, 8);
    return path.join(this.cacheDir, `session-${baseUrlHash}-${this.config.username}.json`);
  }
  
  /**
   * Load cached session from file
   */
  private async loadCachedSession(): Promise<CachedSession | null> {
    try {
      const cacheFile = this.getCacheFilePath();
      const data = await fs.readFile(cacheFile, 'utf-8');
      const session: CachedSession = JSON.parse(data);
      
      // Check if session is still valid
      const age = Date.now() - session.timestamp;
      const maxAge = session.maxAge || this.sessionMaxAge;
      
      if (age > maxAge) {
        // Session expired, delete cache file
        await fs.unlink(cacheFile).catch(() => {});
        return null;
      }
      
      return session;
    } catch (error) {
      // Cache file doesn't exist or is invalid
      return null;
    }
  }
  
  /**
   * Save session to cache file
   */
  private async saveCachedSession(authToken: string): Promise<void> {
    try {
      // Ensure cache directory exists
      await fs.mkdir(this.cacheDir, { recursive: true });
      
      const cacheFile = this.getCacheFilePath();
      
      // Load existing session to preserve project list
      let existingProjects: string[] = [];
      try {
        const existing = await fs.readFile(cacheFile, 'utf-8');
        const existingSession = JSON.parse(existing) as CachedSession;
        existingProjects = existingSession.projects || [];
      } catch {
        // No existing session
      }
      
      // Add current project to list if provided
      if (this.projectName && !existingProjects.includes(this.projectName)) {
        existingProjects.push(this.projectName);
      }
      
      const session: CachedSession = {
        authToken,
        timestamp: Date.now(),
        instance: this.instanceName || 'unknown',
        username: this.config.username,
        projects: existingProjects,
        maxAge: this.sessionMaxAge
      };
      
      await fs.writeFile(cacheFile, JSON.stringify(session, null, 2), 'utf-8');
    } catch (error) {
      // Non-fatal: log but don't throw
      console.warn('Failed to save session cache:', error);
    }
  }
  
  /**
   * Test if a cached token is still valid by making a test request
   */
  private async testToken(token: string): Promise<boolean> {
    try {
      const authUrl = `${this.config.baseUrl}${this.config.authPath}`;
      const response = await fetch(authUrl, {
        method: 'GET',
        headers: {
          'Authorization': `BEARER authToken=${token}`
        }
      });
      
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }
  
  /**
   * Check if we have a valid auth token
   */
  hasValidToken(): boolean {
    if (!this.authToken) return false;
    if (!this.authToken.expiresAt) return true;
    return this.authToken.expiresAt > new Date();
  }
  
  /**
   * Get the current auth token (authenticates if needed)
   * Uses cached session if available and valid
   */
  async getAuthToken(): Promise<string> {
    // 1. Check in-memory token
    if (this.hasValidToken()) {
      return this.authToken!.token;
    }
    
    // 2. Try to load cached session
    const cachedSession = await this.loadCachedSession();
    if (cachedSession) {
      // 3. Test if cached token still works
      const isValid = await this.testToken(cachedSession.authToken);
      if (isValid) {
        // Cached token is valid, use it
        this.authToken = {
          token: cachedSession.authToken
        };
        return cachedSession.authToken;
      } else {
        // Cached token is invalid, delete cache file
        const cacheFile = this.getCacheFilePath();
        await fs.unlink(cacheFile).catch(() => {});
      }
    }
    
    // 4. No valid cached session, authenticate
    await this.authenticate();
    return this.authToken!.token;
  }
  
  /**
   * Perform the full Haystack authentication handshake
   */
  private async authenticate(): Promise<void> {
    const authUrl = `${this.config.baseUrl}${this.config.authPath}`;
    
    // Step 1: HELLO
    const usernameEncoded = base64UrlEncode(this.config.username);
    const helloResponse = await fetch(authUrl, {
      method: 'GET',
      headers: {
        'Authorization': `HELLO username=${usernameEncoded}`
      }
    });
    
    if (helloResponse.status !== 401) {
      throw new Error(`Expected 401 from HELLO, got ${helloResponse.status}`);
    }
    
    // Parse WWW-Authenticate header
    const wwwAuth = helloResponse.headers.get('WWW-Authenticate');
    if (!wwwAuth) {
      throw new Error('Missing WWW-Authenticate header');
    }
    
    const authParams = parseAuthHeader(wwwAuth);
    const handshakeToken = authParams.get('handshakeToken');
    
    // Check if SCRAM is supported (case-insensitive)
    if (!wwwAuth.toUpperCase().includes('SCRAM')) {
      throw new Error(`Server does not support SCRAM authentication. Server offered: ${wwwAuth}`);
    }
    
    // Step 2: SCRAM Authentication
    const scram = new ScramAuth(this.config.username, this.config.password);
    
    // Send client first message
    const clientFirst = scram.getClientFirstMessage();
    const headers: Record<string, string> = {
      'Authorization': `SCRAM data=${clientFirst}`
    };
    if (handshakeToken) {
      headers['Authorization'] += `, handshakeToken=${handshakeToken}`;
    }
    
    const firstResponse = await fetch(authUrl, {
      method: 'GET',
      headers
    });
    
    if (firstResponse.status !== 401) {
      throw new Error(`Expected 401 from SCRAM first, got ${firstResponse.status}`);
    }
    
    // Parse server first message
    const wwwAuth2 = firstResponse.headers.get('WWW-Authenticate');
    if (!wwwAuth2) {
      throw new Error('Missing WWW-Authenticate in SCRAM response');
    }
    
    const authParams2 = parseAuthHeader(wwwAuth2);
    const serverFirstData = authParams2.get('data');
    const handshakeToken2 = authParams2.get('handshakeToken');
    
    if (!serverFirstData) {
      throw new Error('Missing data in SCRAM server first message');
    }
    
    const serverFirst = base64UrlDecode(serverFirstData).toString('utf-8');
    const clientFinal = scram.processServerFirst(serverFirst);
    
    // Send client final message
    const finalHeaders: Record<string, string> = {
      'Authorization': `SCRAM data=${clientFinal}`
    };
    if (handshakeToken2) {
      finalHeaders['Authorization'] += `, handshakeToken=${handshakeToken2}`;
    }
    
    const finalResponse = await fetch(authUrl, {
      method: 'GET',
      headers: finalHeaders
    });
    
    if (finalResponse.status === 403) {
      throw new Error('Authentication failed: Invalid username or password');
    }
    
    if (finalResponse.status !== 200) {
      throw new Error(`Expected 200 from SCRAM final, got ${finalResponse.status}`);
    }
    
    // Parse Authentication-Info header for authToken
    const authInfo = finalResponse.headers.get('Authentication-Info');
    if (!authInfo) {
      throw new Error('Missing Authentication-Info header');
    }
    
    const authInfoParams = parseAuthHeader(authInfo);
    const authToken = authInfoParams.get('authToken');
    
    if (!authToken) {
      throw new Error('Missing authToken in Authentication-Info');
    }
    
    // Verify server signature if present
    const serverFinalData = authInfoParams.get('data');
    if (serverFinalData) {
      const serverFinal = base64UrlDecode(serverFinalData).toString('utf-8');
      if (!scram.verifyServerFinal(serverFinal)) {
        throw new Error('Server signature verification failed');
      }
    }
    
    // Store the auth token
    this.authToken = {
      token: authToken
      // Note: Haystack spec doesn't define token expiry, 
      // so we assume it's valid until the server rejects it
    };
    
    // Save session to cache
    await this.saveCachedSession(authToken);
  }
  
  /**
   * Make an authenticated request to the Haystack server
   */
  async fetch(path: string, options: RequestInit = {}): Promise<Response> {
    const token = await this.getAuthToken();
    
    const headers = {
      ...options.headers,
      'Authorization': `BEARER authToken=${token}`
    };
    
    const url = `${this.config.baseUrl}${path}`;
    const response = await fetch(url, {
      ...options,
      headers
    });
    
    // If we get 401, token might be expired, try re-authenticating once
    if (response.status === 401) {
      this.authToken = undefined;
      const newToken = await this.getAuthToken();
      headers['Authorization'] = `BEARER authToken=${newToken}`;
      
      return fetch(url, {
        ...options,
        headers
      });
    }
    
    return response;
  }
  
  /**
   * Clear the stored auth token (forces re-authentication on next request)
   */
  clearToken(): void {
    this.authToken = undefined;
  }
}
