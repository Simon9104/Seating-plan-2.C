import type { IncomingMessage } from 'node:http';
import type { RequestContext } from '../../server/lib/request-context.js';

// Vercel's edge network sets these headers on every request it proxies to a
// Function, and — like Netlify's equivalent x-nf-* headers before it —
// strips/overwrites any client-supplied version of the same header names
// first, so they're connection-derived, not attacker-controlled. That
// distinction matters: server/lib/http.ts's clientIp() only ever trusts
// context.ip built here, never a header read directly in handler code,
// specifically so a spoofed IP can't defeat the login lockout or forge the
// IP recorded in the audit/bot logs.
//
// One real gap vs. Netlify's context.geo: Vercel only gives an ISO country
// *code* (e.g. "US"), not a full country name — there's no
// x-vercel-ip-country-name equivalent. We store the code as both
// country_code and country_name in bot_log, so the admin UI will show "US"
// rather than "United States" for entries captured on Vercel. Cosmetic only;
// swap in a code->name lookup table later if that's worth polishing.
export function buildRequestContext(req: IncomingMessage): RequestContext {
  const header = (name: string): string | undefined => {
    const v = req.headers[name];
    return Array.isArray(v) ? v[0] : v;
  };

  const ip = header('x-real-ip') || header('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

  const countryCode = header('x-vercel-ip-country');
  if (!countryCode) return { ip };

  const regionName = header('x-vercel-ip-country-region');
  const cityRaw = header('x-vercel-ip-city');
  const lat = header('x-vercel-ip-latitude');
  const lon = header('x-vercel-ip-longitude');

  return {
    ip,
    geo: {
      country: { code: countryCode, name: countryCode },
      subdivision: regionName ? { name: regionName } : undefined,
      city: cityRaw ? safeDecode(cityRaw) : undefined,
      latitude: lat ? Number(lat) : undefined,
      longitude: lon ? Number(lon) : undefined
    }
  };
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
