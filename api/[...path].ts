import type { IncomingMessage, ServerResponse } from 'node:http';
import apiHandler from '../server/api.js';
import { runFetchHandler } from './_lib/adapter.js';
import { buildRequestContext } from './_lib/vercel-context.js';

// Vercel catch-all: every request under /api/* lands here (see
// server/api.ts for the actual routing/logic — this file only adapts
// Vercel's Node.js function signature to it).
export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const context = buildRequestContext(req);
  await runFetchHandler((request) => apiHandler(request, context), req, res);
}
