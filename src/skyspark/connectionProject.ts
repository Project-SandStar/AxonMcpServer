/**
 * A connection can pin its SkySpark project, so a new MCP session (e.g. after a server
 * restart) starts there instead of on the user's last saved project. Set it in the MCP
 * URL (`/mcp?project=instance/project`) or as an `X-Axon-Project: instance/project` header.
 */
export const CONNECTION_PROJECT_HEADER = 'x-axon-project';

/** Parse "instance/project". Returns null for anything else. */
export function parseProjectRef(value: unknown): { instance: string; project: string } | null {
  if (Array.isArray(value)) value = value[0];
  if (typeof value !== 'string') return null;
  const parts = value.trim().split('/');
  if (parts.length !== 2) return null;
  const [instance, project] = parts.map(p => p.trim());
  return instance && project ? { instance, project } : null;
}

/**
 * mcp-proxy shares one upstream session among all its clients, so it tags each request's
 * `_meta` with the client's own proxy session id and pinned project. Returns null when
 * the request did not come through mcp-proxy.
 */
export const PROXY_SESSION_META = 'mcp-proxy/sessionId';
export const PROXY_PROJECT_META = 'mcp-proxy/project';

export function proxyConnection(
  meta: Record<string, unknown> | undefined
): { sessionId: string; pinned: { instance: string; project: string } | null } | null {
  const sessionId = meta?.[PROXY_SESSION_META];
  if (typeof sessionId !== 'string' || !sessionId.trim()) return null;
  return { sessionId: sessionId.trim(), pinned: parseProjectRef(meta?.[PROXY_PROJECT_META]) };
}

/** The pinned project from request headers (header names are lower-case in Node). */
export function connectionProject(
  headers: Record<string, string | string[] | undefined> | undefined
): { instance: string; project: string } | null {
  return parseProjectRef(headers?.[CONNECTION_PROJECT_HEADER]);
}
