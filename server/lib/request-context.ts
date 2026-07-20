// Platform-neutral replacement for Netlify's `Context` type. Only the two
// fields our handlers actually use — the real client IP and best-effort
// geo-IP data — so this file has zero dependency on any specific hosting
// platform's SDK. Each platform adapter (see ../../api/*.ts) builds one of
// these from whatever that platform gives it (Vercel's x-vercel-ip-*
// headers locally/in prod; a hardcoded loopback value in local dev).
export interface RequestGeo {
  city?: string;
  country?: {
    code?: string;
    name?: string;
  };
  subdivision?: {
    name?: string;
  };
  latitude?: number;
  longitude?: number;
}

export interface RequestContext {
  ip: string;
  geo?: RequestGeo;
}
