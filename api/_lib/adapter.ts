import type { IncomingMessage, ServerResponse } from 'node:http';

// Bridges Vercel's Node.js function signature (IncomingMessage/ServerResponse
// — VercelRequest/VercelResponse are structurally the same, so no
// @vercel/node dependency is needed here) to our handlers, which are plain
// Fetch API (Request in, Response out) and therefore also directly reusable
// by scripts/dev-server.ts for local dev without any Vercel-specific code
// running there.
export async function runFetchHandler(
  handler: (req: Request) => Promise<Response>,
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const proto = firstHeader(req.headers['x-forwarded-proto']) || 'https';
  const host = req.headers.host || 'localhost';
  const url = `${proto}://${host}${req.url}`;

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) value.forEach((v) => headers.append(key, v));
    else if (value !== undefined) headers.set(key, value);
  }

  let body: Buffer | undefined;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    if (chunks.length) body = Buffer.concat(chunks);
  }

  const request = new Request(url, { method: req.method, headers, body });
  const response = await handler(request);

  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() !== 'set-cookie') res.setHeader(key, value);
  });
  const rawHeaders = response.headers as Headers & { getSetCookie?: () => string[] };
  const setCookies = rawHeaders.getSetCookie ? rawHeaders.getSetCookie() : [];
  if (setCookies.length) res.setHeader('Set-Cookie', setCookies);
  res.end(Buffer.from(await response.arrayBuffer()));
}

function firstHeader(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
