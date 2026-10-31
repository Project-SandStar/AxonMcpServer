/**
 * fetch() for the sidecar receiver.
 *
 * The receiver serves HTTPS with a self-signed certificate. Node's fetch
 * rejects it, so for https URLs with a pin (SIDECAR_RECEIVER_FINGERPRINT,
 * "SHA256:AB:CD:..." or plain hex, as the receiver and the sidecar show it)
 * this opens the TLS connection itself, checks the certificate's SHA-256
 * before any byte (so before the bearer token) is sent, and then runs the
 * request on that socket. Names and dates are not checked: the pin is the
 * trust, the same rule as the sidecar's pinned verifier.
 *
 * http URLs, and https URLs without a pin, use the normal fetch.
 */

import * as http from 'http';
import * as tls from 'tls';
import { isIP, type Socket } from 'net';

/** "SHA256:ab:cd..." / "AB:CD..." / "abcd..." -> "ABCD..." (64 hex), or null. */
export function normalizeFingerprint(v: string | undefined | null): string | null {
  if (!v) return null;
  const hex = v.trim().replace(/^sha256:/i, '').replace(/[\s:]/g, '').toUpperCase();
  return /^[0-9A-F]{64}$/.test(hex) ? hex : null;
}

export function createReceiverFetch(pin: () => string | undefined = () => process.env.SIDECAR_RECEIVER_FINGERPRINT): typeof fetch {
  const pinned = async (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input.toString() : input.url);
    const raw = pin();
    const want = normalizeFingerprint(raw);
    if (url.protocol !== 'https:' || !raw) return fetch(input, init);
    if (!want) throw new Error('SIDECAR_RECEIVER_FINGERPRINT is not a SHA-256 fingerprint');

    const headers: Record<string, string> = {};
    new Headers(init.headers).forEach((v, k) => { headers[k] = v; });
    const body = typeof init.body === 'string' ? init.body : init.body == null ? undefined : String(init.body);
    if (body !== undefined) headers['content-length'] = String(Buffer.byteLength(body));

    const host = url.hostname.replace(/^\[|\]$/g, '');
    const port = Number(url.port || 443);
    const sock = await new Promise<tls.TLSSocket>((resolve, reject) => {
      const s = tls.connect({
        host,
        port,
        servername: isIP(host) ? undefined : host,
        rejectUnauthorized: false, // trust comes from the pin below
      });
      const onAbort = () => { s.destroy(); reject(init.signal?.reason instanceof Error ? init.signal.reason : new Error('aborted')); };
      if (init.signal?.aborted) return onAbort();
      init.signal?.addEventListener('abort', onAbort, { once: true });
      s.once('secureConnect', () => {
        init.signal?.removeEventListener('abort', onAbort);
        const got = normalizeFingerprint(s.getPeerCertificate()?.fingerprint256);
        if (got !== want) {
          s.destroy();
          reject(new Error('Receiver certificate does not match SIDECAR_RECEIVER_FINGERPRINT'));
        } else resolve(s);
      });
      s.once('error', (e) => { init.signal?.removeEventListener('abort', onAbort); reject(e); });
    });

    return new Promise<Response>((resolve, reject) => {
      // Plain HTTP framing over the already pinned TLS socket: nothing is sent before the pin check
      const req = http.request({
        method: init.method || 'GET',
        host,
        port,
        path: `${url.pathname}${url.search}`,
        headers: { host: url.host, connection: 'close', ...headers },
        signal: init.signal ?? undefined,
        createConnection: () => sock as unknown as Socket,
      } as http.RequestOptions, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('error', reject);
        res.on('end', () => {
          const h = new Headers();
          for (const [k, v] of Object.entries(res.headers)) {
            if (Array.isArray(v)) v.forEach(x => h.append(k, x));
            else if (v !== undefined) h.set(k, String(v));
          }
          const status = res.statusCode || 500;
          const noBody = status === 204 || status === 304;
          resolve(new Response(noBody ? null : Buffer.concat(chunks), { status, statusText: res.statusMessage || '', headers: h }));
        });
      });
      req.on('error', (e: Error & { code?: string }) => {
        if (e.name === 'AbortError' || e.code === 'ABORT_ERR') {
          const reason = (init.signal as AbortSignal | undefined)?.reason;
          reject(reason instanceof Error ? reason : e);
        } else reject(e);
      });
      if (body !== undefined) req.write(body);
      req.end();
    });
  };
  return pinned as typeof fetch;
}

/** Shared default for the receiver clients. */
export const receiverFetch = createReceiverFetch();
