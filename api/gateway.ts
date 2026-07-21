import type { IncomingMessage, ServerResponse } from 'node:http';
import apiHandler from '../server/api.js';
import { runFetchHandler } from './_lib/adapter.js';
import { buildRequestContext } from './_lib/vercel-context.js';

// Every request under /api/* is explicitly routed here by vercel.json
// (see server/api.ts for the actual routing/logic — this file only
// adapts Vercel's Node.js function signature to it). Deliberately a
// plain fixed filename, not a "[...path]" bracket catch-all: Vercel
// was registering that bracket file as matching exactly one path
// segment instead of a true catch-all (single-segment /api/* calls
// worked, multi-segment ones like /api/auth/me silently fell through
// to the SPA fallback) — an explicit route to a fixed destination
// sidesteps whatever was misdetecting it, and matches the same
// fixed-destination pattern already working for the decoy routes.
export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const context = buildRequestContext(req);
  await runFetchHandler((request) => apiHandler(request, context), req, res);
}
