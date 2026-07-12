import type { Context } from '@netlify/functions';
import { ensureSchema, getDb } from './lib/db';
import { DECOY_FUNCTION_PATHS } from '../../shared/decoy-paths';

// Honeypot: bound to common CMS admin-login paths (see shared/decoy-paths.ts)
// so scanning bots that probe for them get served a plausible-looking fake
// login instead of a 404. Every hit — and any submitted credentials — is
// logged with IP + Netlify's built-in geo-IP data, viewable by real admins
// at /admin/bot-activity. This never grants access to anything; it's bait.

const MAX_BODY_BYTES = 20_000;
const MAX_FIELD_LEN = 100;
const USERNAME_FIELDS = ['username', 'user', 'log', 'email', 'login'];
const PASSWORD_FIELDS = ['password', 'pass', 'pwd'];

async function extractCredentials(req: Request): Promise<{ username: string | null; password: string | null }> {
  const len = Number(req.headers.get('content-length') || '0');
  if (!len || len > MAX_BODY_BYTES) return { username: null, password: null };
  try {
    const text = await req.text();
    if (!text) return { username: null, password: null };
    const contentType = req.headers.get('content-type') || '';
    const fields: Record<string, string> = {};
    if (contentType.includes('application/json')) {
      const obj = JSON.parse(text);
      if (obj && typeof obj === 'object') {
        for (const [k, v] of Object.entries(obj)) fields[k.toLowerCase()] = String(v);
      }
    } else {
      for (const [k, v] of new URLSearchParams(text).entries()) fields[k.toLowerCase()] = v;
    }
    const username = USERNAME_FIELDS.map((k) => fields[k]).find(Boolean) || null;
    const password = PASSWORD_FIELDS.map((k) => fields[k]).find(Boolean) || null;
    return {
      username: username ? username.slice(0, MAX_FIELD_LEN) : null,
      password: password ? password.slice(0, MAX_FIELD_LEN) : null
    };
  } catch {
    return { username: null, password: null };
  }
}

function loginPageHtml(showError: boolean): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Admin Login</title>
<style>
  body{font-family:-apple-system,Helvetica,Arial,sans-serif;background:#f1f1f1;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;}
  form{background:#fff;padding:32px;border-radius:6px;box-shadow:0 1px 3px rgba(0,0,0,.13);width:280px;}
  h1{font-size:16px;margin:0 0 16px;}
  label{display:block;font-size:13px;margin-bottom:12px;color:#333;}
  input{display:block;width:100%;box-sizing:border-box;padding:8px;margin-top:4px;border:1px solid #ccc;border-radius:3px;font-size:14px;}
  button{width:100%;padding:9px;background:#2271b1;color:#fff;border:none;border-radius:3px;font-size:14px;cursor:pointer;}
  .err{background:#fbeaea;border-left:4px solid #d63638;padding:8px 12px;font-size:13px;margin-bottom:12px;}
</style></head>
<body>
<form method="POST" action="">
  <h1>Admin Login</h1>
  ${showError ? '<div class="err">Invalid username or password.</div>' : ''}
  <label>Username or Email<input type="text" name="log" autocomplete="username"></label>
  <label>Password<input type="password" name="pwd" autocomplete="current-password"></label>
  <button type="submit">Log In</button>
</form>
</body></html>`;
}

function htmlResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store'
    }
  });
}

export default async (req: Request, context: Context): Promise<Response> => {
  const url = new URL(req.url);
  const method = req.method;

  try {
    await ensureSchema();
    const db = getDb();

    const { username, password } = method === 'POST' ? await extractCredentials(req) : { username: null, password: null };
    const geo = context.geo || {};

    await db.execute({
      sql: `INSERT INTO bot_log
              (path, method, ip, country_code, country_name, region, city, latitude, longitude, user_agent, username, password)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        url.pathname,
        method,
        context.ip || null,
        geo.country?.code || null,
        geo.country?.name || null,
        geo.subdivision?.name || null,
        geo.city || null,
        geo.latitude ?? null,
        geo.longitude ?? null,
        (req.headers.get('user-agent') || '').slice(0, 300) || null,
        username,
        password
      ]
    });
    // Opportunistic cleanup so this table doesn't grow forever.
    await db.execute({ sql: `DELETE FROM bot_log WHERE created_at < datetime('now', '-90 days')`, args: [] });
  } catch (err) {
    console.error('[decoy] logging failed', err);
  }

  return htmlResponse(loginPageHtml(method === 'POST'));
};

export const config = { path: DECOY_FUNCTION_PATHS };
