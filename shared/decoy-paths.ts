// Fake admin-login URLs used as honeypot bait for scanning bots. Shared by
// the decoy Netlify Function (config.path), the Vite dev proxy, and the
// local dev server, so all three always agree on the same path list.
export const DECOY_PATH_PREFIXES = ['/wp-admin', '/wp-login.php', '/administrator', '/phpmyadmin', '/admin-test'];

// This one additionally asks the visitor's browser for precise GPS
// coordinates (see netlify/functions/decoy.ts) instead of relying only on
// IP-based geo. Plain HTTP scanners never execute the script, so this only
// ever affects a real browser that lands on the page.
export const PRECISE_LOCATION_PATH = '/admin-test';

export const DECOY_FUNCTION_PATHS = DECOY_PATH_PREFIXES.flatMap((p) => [p, `${p}/*`]);

export function isDecoyPath(pathname: string): boolean {
  return DECOY_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
