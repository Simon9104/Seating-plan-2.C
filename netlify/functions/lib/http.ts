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
  return process.env.NETLIFY_DEV === 'true' || process.env.NODE_ENV === 'development';
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

export function clientIp(req: Request, context: { ip?: string }): string {
  return context.ip || req.headers.get('x-nf-client-connection-ip') || 'unknown';
}
