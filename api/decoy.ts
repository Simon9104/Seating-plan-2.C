import type { IncomingMessage, ServerResponse } from 'node:http';
import decoyHandler from '../server/decoy.js';
import { runFetchHandler } from './_lib/adapter.js';
import { buildRequestContext } from './_lib/vercel-context.js';

// The honeypot's actual endpoint. Not reached directly by its public-facing
// URLs (/wp-admin, /admin-test, etc.) — vercel.json rewrites those to here.
// See shared/decoy-paths.ts for the path list and server/decoy.ts for the
// logic.
export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const context = buildRequestContext(req);
  await runFetchHandler((request) => decoyHandler(request, context), req, res);
}
