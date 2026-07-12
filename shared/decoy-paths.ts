// Fake admin-login URLs used as honeypot bait for scanning bots. Shared by
// the decoy Netlify Function (config.path), the Vite dev proxy, and the
// local dev server, so all three always agree on the same path list.
export const DECOY_PATH_PREFIXES = ['/wp-admin', '/wp-login.php', '/administrator', '/phpmyadmin'];

export const DECOY_FUNCTION_PATHS = DECOY_PATH_PREFIXES.flatMap((p) => [p, `${p}/*`]);

export function isDecoyPath(pathname: string): boolean {
  return DECOY_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
