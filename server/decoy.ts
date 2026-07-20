import type { RequestContext } from './lib/request-context';
import { ensureSchema, getDb } from './lib/db';
import { PRECISE_LOCATION_PATH } from '../shared/decoy-paths';

// Honeypot: bound to common CMS admin-login paths (see shared/decoy-paths.ts)
// so scanning bots that probe for them get served a plausible-looking fake
// login instead of a 404. Every hit — and any submitted credentials — is
// logged with IP + best-effort geo-IP data (see the platform adapter that
// builds RequestContext, e.g. api/_lib/vercel-context.ts), viewable by real
// admins at /admin/bot-activity. This never grants access to anything; it's
// bait.
//
// PRECISE_LOCATION_PATH additionally asks the visitor's browser for exact
// GPS coordinates via a small inline script. Plain HTTP scanners never
// execute it, so this only ever affects a real browser that loads the page.

const MAX_BODY_BYTES = 20_000;
const MAX_FIELD_LEN = 100;
const GEO_REPORT_WINDOW_MINUTES = 10;
const USERNAME_FIELDS = ['username', 'user', 'log', 'email', 'login'];
const PASSWORD_FIELDS = ['password', 'pass', 'pwd'];

interface GeoReport {
  rowId: number;
  latitude: number;
  longitude: number;
  accuracy: number | null;
}

async function readJsonBody(req: Request): Promise<Record<string, unknown> | null> {
  const contentType = req.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return null;
  const len = Number(req.headers.get('content-length') || '0');
  if (!len || len > MAX_BODY_BYTES) return null;
  try {
    const obj = JSON.parse(await req.text());
    return obj && typeof obj === 'object' ? (obj as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function parseGeoReport(body: Record<string, unknown> | null): GeoReport | null {
  if (!body) return null;
  const rowId = Number(body.__geoReportFor);
  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);
  if (!Number.isFinite(rowId) || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const accuracy = Number(body.accuracy);
  return { rowId, latitude, longitude, accuracy: Number.isFinite(accuracy) ? accuracy : null };
}

async function extractCredentials(req: Request, jsonBody: Record<string, unknown> | null): Promise<{ username: string | null; password: string | null }> {
  let fields: Record<string, string> = {};
  if (jsonBody) {
    for (const [k, v] of Object.entries(jsonBody)) fields[k.toLowerCase()] = typeof v === 'object' ? '' : String(v);
  } else {
    const contentType = req.headers.get('content-type') || '';
    if (contentType.includes('application/json')) return { username: null, password: null }; // already consumed/invalid above
    const len = Number(req.headers.get('content-length') || '0');
    if (!len || len > MAX_BODY_BYTES) return { username: null, password: null };
    try {
      const text = await req.text();
      for (const [k, v] of new URLSearchParams(text).entries()) fields[k.toLowerCase()] = v;
    } catch {
      fields = {};
    }
  }
  const username = USERNAME_FIELDS.map((k) => fields[k]).find(Boolean) || null;
  const password = PASSWORD_FIELDS.map((k) => fields[k]).find(Boolean) || null;
  return {
    username: username ? username.slice(0, MAX_FIELD_LEN) : null,
    password: password ? password.slice(0, MAX_FIELD_LEN) : null
  };
}

const GEO_SCRIPT = (rowId: number) => `
<script>
(function(){
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(function(pos){
    fetch(location.pathname, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        __geoReportFor: ${rowId},
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy
      })
    }).catch(function(){});
  }, function(){}, { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 });
})();
</script>`;

function loginPageHtml(showError: boolean, geoRowId: number | null): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive">
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
${geoRowId !== null ? GEO_SCRIPT(geoRowId) : ''}
</body></html>`;
}

function htmlResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
      // Belt and suspenders alongside the <meta name="robots"> tag — keeps
      // this out of search results so it's never mistaken for a real login
      // or flagged as a lookalike/phishing page by crawlers.
      'X-Robots-Tag': 'noindex, nofollow, noarchive'
    }
  });
}

function noContent(): Response {
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}

export default async (req: Request, context: RequestContext): Promise<Response> => {
  const url = new URL(req.url);
  const method = req.method;
  const isPreciseLocationPath = url.pathname === PRECISE_LOCATION_PATH;

  try {
    await ensureSchema();
    const db = getDb();

    if (method === 'POST') {
      const jsonBody = await readJsonBody(req);
      const geoReport = parseGeoReport(jsonBody);
      if (geoReport) {
        // Follow-up telemetry ping from the geolocation script, not a fresh
        // hit or login attempt — update the row it's reporting for. Scoped
        // to the same path, a short time window, AND the same IP as the
        // original hit, so a client can't spoof someone else's row id to
        // inject fake coordinates into another visitor's entry.
        await db.execute({
          sql: `UPDATE bot_log SET latitude = ?, longitude = ?, accuracy_m = ?, location_source = 'gps'
                WHERE id = ? AND path = ? AND ip = ? AND created_at > datetime('now', ?)`,
          args: [
            geoReport.latitude,
            geoReport.longitude,
            geoReport.accuracy,
            geoReport.rowId,
            url.pathname,
            context.ip || null,
            `-${GEO_REPORT_WINDOW_MINUTES} minutes`
          ]
        });
        return noContent();
      }

      const { username, password } = await extractCredentials(req, jsonBody);
      const rowId = await logHit(db, url.pathname, method, context, req.headers.get('user-agent'), username, password);
      return htmlResponse(loginPageHtml(true, isPreciseLocationPath ? rowId : null));
    }

    const rowId = await logHit(db, url.pathname, method, context, req.headers.get('user-agent'), null, null);
    return htmlResponse(loginPageHtml(false, isPreciseLocationPath ? rowId : null));
  } catch (err) {
    console.error('[decoy] request failed', err);
    return htmlResponse(loginPageHtml(method === 'POST', null));
  }
};

async function logHit(
  db: ReturnType<typeof getDb>,
  pathname: string,
  method: string,
  context: RequestContext,
  userAgent: string | null,
  username: string | null,
  password: string | null
): Promise<number | null> {
  const geo = context.geo || {};
  try {
    const res = await db.execute({
      sql: `INSERT INTO bot_log
              (path, method, ip, country_code, country_name, region, city, latitude, longitude, user_agent, username, password)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        pathname,
        method,
        context.ip || null,
        geo.country?.code || null,
        geo.country?.name || null,
        geo.subdivision?.name || null,
        geo.city || null,
        geo.latitude ?? null,
        geo.longitude ?? null,
        (userAgent || '').slice(0, 300) || null,
        username,
        password
      ]
    });
    // Opportunistic cleanup so this table doesn't grow forever.
    await db.execute({ sql: `DELETE FROM bot_log WHERE created_at < datetime('now', '-90 days')`, args: [] });
    return res.lastInsertRowid !== undefined ? Number(res.lastInsertRowid) : null;
  } catch (err) {
    console.error('[decoy] logging failed', err);
    return null;
  }
}
