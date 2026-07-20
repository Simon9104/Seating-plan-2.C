export const SESSION_COOKIE = 'sp_session';

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(val);
  }
  return out;
}

function isDev(): boolean {
  // NODE_ENV covers both our own dev-server.ts (Vite sets it) and a plain
  // `node` run; VERCEL_ENV covers `vercel dev` specifically.
  return process.env.NODE_ENV === 'development' || process.env.VERCEL_ENV === 'development';
}

export function buildSessionCookie(token: string, maxAgeSeconds: number): string {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${maxAgeSeconds}`
  ];
  if (!isDev()) parts.push('Secure');
  return parts.join('; ');
}

export function buildClearSessionCookie(): string {
  const parts = [`${SESSION_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Strict', 'Max-Age=0'];
  if (!isDev()) parts.push('Secure');
  return parts.join('; ');
}

const BASE_SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store'
};

export function json(status: number, body: unknown, extraHeaders?: Record<string, string>): Response {
  const headers = new Headers(BASE_SECURITY_HEADERS);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  if (extraHeaders) {
    const extra = new Headers(extraHeaders);
    extra.forEach((value, key) => headers.append(key, value));
  }
  return new Response(JSON.stringify(body), { status, headers });
}

export function noContent(status: number, extraHeaders?: Record<string, string>): Response {
  const headers = new Headers(BASE_SECURITY_HEADERS);
  if (extraHeaders) {
    const extra = new Headers(extraHeaders);
    extra.forEach((value, key) => headers.append(key, value));
  }
  return new Response(null, { status, headers });
}

// Defense-in-depth alongside the CSRF token: reject state-changing requests
// whose Origin/Referer doesn't match the site itself. A same-site cookie
// already stops browsers from attaching it cross-site, and the CSRF token
// is the primary defense, but checking Origin too means a leaked token
// (e.g. via some unrelated bug) still isn't enough on its own.
export function isSameOriginRequest(req: Request): boolean {
  const selfOrigin = new URL(req.url).origin;
  const origin = req.headers.get('origin');
  if (origin) return origin === selfOrigin;
  const referer = req.headers.get('referer');
  if (referer) {
    try {
      return new URL(referer).origin === selfOrigin;
    } catch {
      return false;
    }
  }
  return true;
}

// Only ever trust the platform adapter's own connection-derived context.ip
// (built from Vercel's request metadata — see api/*.ts) — never read a
// header directly here. A header (even one that looks like a trusted
// platform header, e.g. x-forwarded-for / x-vercel-forwarded-for) can be
// set directly by whoever sends the request if the adapter doesn't
// sanitize it, so falling back to one blindly would let an attacker spoof
// a fresh "IP" per request and defeat IP-based login lockout, or forge the
// IP recorded in the audit/bot logs.
export function clientIp(_req: Request, context: { ip?: string }): string {
  return context.ip || 'unknown';
}
