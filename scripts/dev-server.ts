// Lightweight local dev server used instead of `vercel dev` when you don't
// want to (or can't yet) run `vercel login` / `vercel link` — runs the Vite
// dev server and the API handlers together in one process, no Vercel CLI
// auth required. `vercel dev` remains the officially supported way to
// preview the real Vercel routing (rewrites, headers) locally once the
// project is linked; this is a same-logic stand-in for quick iteration.
//
// Usage: npm run dev:local
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createServer as createViteServer } from 'vite';
import apiHandler from '../server/api';
import decoyHandler from '../server/decoy';
import { isDecoyPath } from '../shared/decoy-paths';
import type { RequestContext } from '../server/lib/request-context';

const FUNCTIONS_PORT = 9999;
const FRONTEND_PORT = 8888;

// No real edge/geo-IP locally (same as `vercel dev` without a linked
// project) — handlers already treat a missing geo gracefully.
const LOCAL_CONTEXT: RequestContext = { ip: '127.0.0.1' };

async function readBody(req: IncomingMessage): Promise<Buffer | undefined> {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined;
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

async function handleFunctionRequest(req: IncomingMessage, res: ServerResponse) {
  // Use the original Host header (the browser's real localhost:8888), not
  // this internal port, so the reconstructed Request's origin matches what
  // the browser actually sent as Origin/Referer — isSameOriginRequest()
  // compares against it, and Vite's proxy must NOT rewrite Host for this
  // to hold (see vite.config.ts: no changeOrigin on these proxy entries).
  const host = req.headers.host || `localhost:${FUNCTIONS_PORT}`;
  const url = `http://${host}${req.url}`;
  const pathname = new URL(url).pathname;
  const handler = isDecoyPath(pathname) ? decoyHandler : apiHandler;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) value.forEach((v) => headers.append(key, v));
    else if (value) headers.set(key, value);
  }
  const body = await readBody(req);
  const request = new Request(url, { method: req.method, headers, body });

  try {
    const response = await handler(request, LOCAL_CONTEXT);
    res.statusCode = response.status;
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() !== 'set-cookie') res.setHeader(key, value);
    });
    const rawHeaders = response.headers as Headers & { getSetCookie?: () => string[] };
    const setCookies = rawHeaders.getSetCookie ? rawHeaders.getSetCookie() : [];
    if (setCookies.length) res.setHeader('Set-Cookie', setCookies);
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (err) {
    console.error('[dev-server] function error', err);
    res.statusCode = 500;
    res.end('Internal error');
  }
}

async function main() {
  createHttpServer(handleFunctionRequest).listen(FUNCTIONS_PORT, () => {
    console.log(`API functions listening on http://localhost:${FUNCTIONS_PORT}`);
  });

  const vite = await createViteServer({
    server: { port: FRONTEND_PORT, host: true }
  });
  await vite.listen();
  console.log(`Frontend (with /api proxy) at http://localhost:${FRONTEND_PORT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
