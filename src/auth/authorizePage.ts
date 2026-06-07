/**
 * Authorization page rendering for OAuth 2.1 flow
 * Provides login and consent UI for the OAuth authorization endpoint
 */

import { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';

export interface AuthorizePageParams {
  client: OAuthClientInformationFull;
  scopes: string[];
  state?: string;
  codeChallenge: string;
  redirectUri: string;
  error?: string;
}

/**
 * Render the login/consent HTML page
 */
export function renderAuthorizePage(params: AuthorizePageParams): string {
  const { client, scopes, state, codeChallenge, redirectUri, error } = params;
  const clientName = client.client_name || client.client_id;
  const scopeDescriptions = getScopeDescriptions(scopes);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Authorize - Axon MCP Server</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      max-width: 420px;
      width: 100%;
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 32px;
      text-align: center;
      color: white;
    }
    .logo {
      width: 64px;
      height: 64px;
      background: rgba(255,255,255,0.2);
      border-radius: 16px;
      margin: 0 auto 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 32px;
    }
    .header h1 {
      font-size: 24px;
      font-weight: 600;
      margin-bottom: 8px;
    }
    .header p {
      opacity: 0.9;
      font-size: 14px;
    }
    .content {
      padding: 32px;
    }
    .client-info {
      background: #f8f9fa;
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 24px;
      text-align: center;
    }
    .client-name {
      font-weight: 600;
      font-size: 18px;
      color: #1a1a2e;
      margin-bottom: 4px;
    }
    .client-id {
      font-size: 12px;
      color: #6c757d;
      word-break: break-all;
    }
    .scopes {
      margin-bottom: 24px;
    }
    .scopes h3 {
      font-size: 14px;
      color: #6c757d;
      margin-bottom: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .scope-item {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 12px 0;
      border-bottom: 1px solid #e9ecef;
    }
    .scope-item:last-child {
      border-bottom: none;
    }
    .scope-icon {
      width: 24px;
      height: 24px;
      background: #e8f4fd;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #667eea;
      flex-shrink: 0;
    }
    .scope-text {
      flex: 1;
    }
    .scope-name {
      font-weight: 500;
      color: #1a1a2e;
      font-size: 14px;
    }
    .scope-desc {
      color: #6c757d;
      font-size: 12px;
      margin-top: 2px;
    }
    .error {
      background: #fee;
      border: 1px solid #fcc;
      color: #c00;
      padding: 12px 16px;
      border-radius: 8px;
      margin-bottom: 24px;
      font-size: 14px;
    }
    .form-group {
      margin-bottom: 20px;
    }
    .form-group label {
      display: block;
      font-size: 14px;
      font-weight: 500;
      color: #1a1a2e;
      margin-bottom: 6px;
    }
    .form-group input {
      width: 100%;
      padding: 12px 16px;
      border: 2px solid #e9ecef;
      border-radius: 8px;
      font-size: 16px;
      transition: border-color 0.2s;
    }
    .form-group input:focus {
      outline: none;
      border-color: #667eea;
    }
    .buttons {
      display: flex;
      gap: 12px;
    }
    button {
      flex: 1;
      padding: 14px 24px;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn-primary {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
    }
    .btn-primary:hover {
      opacity: 0.9;
      transform: translateY(-1px);
    }
    .btn-secondary {
      background: white;
      color: #6c757d;
      border: 2px solid #e9ecef;
    }
    .btn-secondary:hover {
      background: #f8f9fa;
    }
    .footer {
      text-align: center;
      padding: 16px 32px 24px;
      color: #6c757d;
      font-size: 12px;
    }
    .footer a {
      color: #667eea;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">&#x26A1;</div>
      <h1>Axon MCP Server</h1>
      <p>Authorization Request</p>
    </div>
    <div class="content">
      <div class="client-info">
        <div class="client-name">${escapeHtml(clientName)}</div>
        <div class="client-id">wants to access your account</div>
      </div>

      ${error ? `<div class="error">${escapeHtml(error)}</div>` : ''}

      <div class="scopes">
        <h3>Permissions Requested</h3>
        ${scopeDescriptions.map(s => `
          <div class="scope-item">
            <div class="scope-icon">${s.icon}</div>
            <div class="scope-text">
              <div class="scope-name">${escapeHtml(s.name)}</div>
              <div class="scope-desc">${escapeHtml(s.description)}</div>
            </div>
          </div>
        `).join('')}
      </div>

      <form method="POST" action="/oauth/login">
        <input type="hidden" name="client_id" value="${escapeHtml(client.client_id)}">
        <input type="hidden" name="redirect_uri" value="${escapeHtml(redirectUri)}">
        <input type="hidden" name="code_challenge" value="${escapeHtml(codeChallenge)}">
        <input type="hidden" name="scope" value="${escapeHtml(scopes.join(' '))}">
        ${state ? `<input type="hidden" name="state" value="${escapeHtml(state)}">` : ''}

        <div class="form-group">
          <label for="username">Username</label>
          <input type="text" id="username" name="username" required autocomplete="username" placeholder="Enter your username">
        </div>

        <div class="form-group">
          <label for="password">Password</label>
          <input type="password" id="password" name="password" required autocomplete="current-password" placeholder="Enter your password">
        </div>

        <div class="buttons">
          <button type="button" class="btn-secondary" onclick="handleDeny()">Deny</button>
          <button type="submit" class="btn-primary">Authorize</button>
        </div>
      </form>
    </div>
    <div class="footer">
      Authorizing will allow this application to access your Axon MCP Server.<br>
      <a href="/dashboard">Return to Dashboard</a>
    </div>
  </div>

  <script>
    function handleDeny() {
      const redirectUri = new URL('${escapeHtml(redirectUri)}');
      redirectUri.searchParams.set('error', 'access_denied');
      redirectUri.searchParams.set('error_description', 'The user denied the request');
      ${state ? `redirectUri.searchParams.set('state', '${escapeHtml(state)}');` : ''}
      window.location.href = redirectUri.toString();
    }
  </script>
</body>
</html>`;
}

/**
 * Get human-readable descriptions for OAuth scopes
 */
function getScopeDescriptions(scopes: string[]): Array<{ name: string; description: string; icon: string }> {
  const scopeMap: Record<string, { name: string; description: string; icon: string }> = {
    'mcp:read': {
      name: 'Read Access',
      description: 'Read Axon code examples, documentation, and query SkySpark data',
      icon: '&#x1F4D6;',
    },
    'mcp:write': {
      name: 'Write Access',
      description: 'Execute Axon code and modify SkySpark data',
      icon: '&#x270F;',
    },
    'mcp:admin': {
      name: 'Admin Access',
      description: 'Full administrative access including user management',
      icon: '&#x1F6E0;',
    },
  };

  // Return descriptions for known scopes, or generate generic ones
  return scopes.map((scope) => {
    if (scopeMap[scope]) {
      return scopeMap[scope];
    }
    return {
      name: scope,
      description: `Access to ${scope} functionality`,
      icon: '&#x2713;',
    };
  });
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (char) => map[char]);
}

/**
 * Render error page
 */
export function renderErrorPage(error: string, description?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Error - Axon MCP Server</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      max-width: 420px;
      width: 100%;
      padding: 48px 32px;
      text-align: center;
    }
    .icon {
      font-size: 64px;
      margin-bottom: 24px;
    }
    h1 {
      font-size: 24px;
      color: #dc3545;
      margin-bottom: 12px;
    }
    p {
      color: #6c757d;
      font-size: 14px;
      line-height: 1.6;
    }
    a {
      display: inline-block;
      margin-top: 24px;
      color: #667eea;
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">&#x26A0;</div>
    <h1>${escapeHtml(error)}</h1>
    ${description ? `<p>${escapeHtml(description)}</p>` : ''}
    <a href="/dashboard">Return to Dashboard</a>
  </div>
</body>
</html>`;
}
