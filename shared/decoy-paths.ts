// Fake admin-login URLs used as honeypot bait for scanning bots. Shared by
// vercel.json's rewrites, the Vite dev proxy, and the local dev server, so
// all three always agree on the same path list.
export const DECOY_PATH_PREFIXES = ['/wp-admin', '/wp-login.php', '/administrator', '/phpmyadmin', '/admin-test'];

// This one additionally asks the visitor's browser for precise GPS
// coordinates (see server/decoy.ts) instead of relying only on IP-based
// geo. Plain HTTP scanners never execute the script, so this only ever
// affects a real browser that lands on the page.
export const PRECISE_LOCATION_PATH = '/admin-test';

export function isDecoyPath(pathname: string): boolean {
  return DECOY_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
