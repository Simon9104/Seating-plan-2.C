# Class Seating Chart

A classroom seating-plan + timetable app with:

- A **public page** (`/`) students visit to see the current seating chart,
  plus a live clock and a "Now / Next class" panel with a countdown, driven
  by the weekly timetable.
- An **admin panel** (`/admin`) — protected by per-person username/password
  accounts — where a teacher manages the roster, shuffles/rotates seats,
  pins fixed seats, sets "keep apart" rules, and reviews an **activity log**
  of every change and who made it.
- A **Weekly Timetable admin page** (`/admin/timetable`) for the 5-day ×
  9-period schedule: period times, break marking, subject-per-cell (with an
  optional early period and splitting a period into parallel groups for
  electives), and a subjects → teacher lookup table.
- A **Room Timetable admin page** (`/admin/room-timetable`) for periods when
  a class is away from its home room — fill in which other class is visiting
  instead; leave blank to fall back to the weekly timetable.
- A **bot honeypot**: fake admin-login pages at common CMS paths bots scan
  for (`/wp-admin`, `/wp-login.php`, `/administrator`, `/phpmyadmin`, plus
  `/admin-test`). Nothing ever actually signs in through them — every hit
  (and any submitted username/password) is logged with IP and geo-IP
  country/city, viewable at `/admin/bot-activity`. `/admin-test` also asks
  the visitor's browser for exact GPS coordinates, shown separately from
  the IP-based estimate when granted.

Rebuilt from a Claude Design HTML/CSS/JS prototype
(`../student-seating-arrangement-plan/`) as a real deployable app: React
frontend + Vercel Serverless Functions backend + a shared database, so
every device sees the same chart (the prototype used per-browser
`localStorage`, which doesn't work once real students on real devices are
involved).

## How it works

- **Frontend**: React + Vite, built to `dist/`, served as a static site.
- **Backend**: Vercel Node.js Serverless Functions. The actual routing/
  business logic lives in `server/api.ts` and `server/decoy.ts` as
  plain `(req: Request) => Promise<Response>` handlers with zero
  platform-specific code; `api/[...path].ts` and `api/decoy.ts` are thin
  adapters that translate Vercel's Node.js function signature to/from
  that (see `api/_lib/adapter.ts`) and build a platform-neutral
  `RequestContext` (client IP + geo-IP) from Vercel's request headers
  (see `api/_lib/vercel-context.ts`). This split is what lets
  `scripts/dev-server.ts` run the exact same handlers locally without any
  Vercel-specific code in the loop.
- **Database**: [libSQL](https://turso.tech/libsql) — SQLite-compatible.
  Locally it's just a file (`local.db`), no setup needed. In production it
  must point at a hosted libSQL database (e.g. [Turso](https://turso.tech),
  free tier is enough for this) because Vercel Functions run in a fresh,
  read-only container per invocation — a local file would not persist.
- **Auth**: bcrypt-hashed passwords, opaque random session tokens (hashed
  before being stored, so a DB leak alone can't be replayed), CSRF tokens
  required on every state-changing request, and DB-backed login-attempt
  lockout (5 failed attempts per username/IP locks out for 15 minutes).
- **Audit log**: every admin action (sign-in/out, roster edits, shuffles,
  rule changes, seat swaps, admin account changes) is written to an
  append-only `audit_log` table with the acting admin's username, action,
  details, IP, and timestamp — viewable in the "Activity log" panel.

## Local development

```bash
npm install
npx vercel login      # one-time, opens a browser to authenticate
npx vercel link       # one-time, links this directory to a Vercel project
npm run dev            # = vercel dev
```

`vercel dev` runs the Vite frontend and the real `api/` functions together,
using `vercel.json`'s rewrites/headers exactly as production will — the
most accurate way to preview the deploy locally.

If you don't want to link a Vercel project yet, run `npm run dev:local`
instead — a small dev server (`scripts/dev-server.ts`) that runs the exact
same handlers (`server/api.ts` / `server/decoy.ts`) directly, no Vercel CLI
auth required, and auto-restarts on file changes. It won't have real geo-IP
data (nothing does, without a real Vercel edge request) and doesn't
exercise `vercel.json`'s routing, but everything else — auth, the seating
chart, the timetable, the honeypot — behaves identically.

Create your first admin account against the local database:

```bash
npm run setup:admin
```

It'll prompt for a username, display name, and password (password input is
hidden). You can also set `ADMIN_BOOTSTRAP_USERNAME` /
`ADMIN_BOOTSTRAP_NAME` / `ADMIN_BOOTSTRAP_PASSWORD` env vars to run it
non-interactively. Once you have one admin, you can create more from inside
the admin panel itself ("Admins" section) — no need to re-run the script.

Then sign in at `http://localhost:8888/admin/login`.

## Deploying to Vercel

1. **Create a hosted database** (Turso is the easiest fit since it speaks
   the same libSQL protocol used locally):
   ```bash
   npm install -g turso-cli   # or see https://docs.turso.tech/quickstart
   turso auth login
   turso db create seating-plan
   turso db show seating-plan --url            # -> DATABASE_URL
   turso db tokens create seating-plan          # -> DATABASE_AUTH_TOKEN
   ```
   (Any other hosted libSQL-compatible endpoint works too — just set the
   two env vars below.)

2. **Bootstrap the schema + first admin against that hosted database**:
   ```bash
   DATABASE_URL="libsql://your-db.turso.io" \
   DATABASE_AUTH_TOKEN="..." \
   npm run setup:admin
   ```

3. **Push this repo to GitHub/GitLab/Bitbucket and import it as a new
   Vercel project** (vercel.com → Add New → Project), or run
   `npx vercel --prod` from the CLI after `vercel link`. Vercel reads
   `vercel.json` automatically (rewrites, headers) and auto-detects the
   Vite build (also pinned explicitly in `vercel.json`'s `buildCommand`/
   `outputDirectory`).

4. **Set environment variables on the Vercel project** (Project →
   Settings → Environment Variables, for Production — and Preview too, if
   you want preview deploys to work against the same data):
   - `DATABASE_URL` = `libsql://your-db.turso.io`
   - `DATABASE_AUTH_TOKEN` = the token from step 1

   Do **not** set `DATABASE_URL` to a `file:` path in production — the app
   deliberately refuses to start that way (see `server/lib/db.ts`) to avoid
   silently losing data on an ephemeral filesystem.

5. Deploy. Students visit the site root; sign in at `/admin/login`.

**A note on geo-IP accuracy**: Vercel's `x-vercel-ip-*` headers only give a
country *code* (e.g. `US`), not a full country name — `server/lib/db.ts`'s
`bot_log` table ends up with the code in both `country_code` and
`country_name` for entries captured this way, so the honeypot's admin view
will show "US" rather than "United States". Cosmetic only; see
`api/_lib/vercel-context.ts` if you want to add a code→name lookup table
later.

### Adding/removing admins later

Any signed-in admin can add another admin from the "Admins" section of the
panel (it requires re-entering *your own* password as a confirmation step)
or remove one (you can't remove yourself or the last remaining account).
You only need `npm run setup:admin` once, to create the very first account.

## Security notes

- Sessions are stored server-side (DB) and expire after 8 hours; only a
  SHA-256 hash of the session token is stored, never the token itself.
- Cookies are `HttpOnly`, `SameSite=Strict`, and `Secure` (outside local
  dev) — not readable by JavaScript and not sent cross-site.
- Every mutating request must include a CSRF token issued at login, checked
  against the session record with a timing-safe comparison.
- Login responses don't reveal whether a username exists (a dummy bcrypt
  comparison runs even for unknown usernames, so timing doesn't leak it).
- Passwords require 12+ characters with at least one letter and one digit.
- `vercel.json` sets `Content-Security-Policy`, `X-Frame-Options`,
  `Referrer-Policy`, `HSTS`, etc. on every response.
- **IP address is never taken from an arbitrary header.** `clientIp()` in
  `server/lib/http.ts` only ever trusts the `RequestContext.ip` built by
  the platform adapter (`api/_lib/vercel-context.ts`, from Vercel's
  `x-real-ip`/`x-forwarded-for` — which Vercel's edge sets itself and
  strips any client-supplied version of first) — handler code never reads
  a header directly for this. Get this wrong and an attacker can spoof a
  fresh "IP" per request to defeat the IP-based login lockout, or forge
  the IP recorded in the audit/bot logs.
- **Origin-header check as CSRF defense-in-depth.** Every state-changing
  admin request (and login/logout) additionally requires its `Origin` (or
  `Referer`) to match the site itself — on top of, not instead of, the
  CSRF token. Verified a request with a valid CSRF token but a mismatched
  `Origin` is still rejected (403).
- **The GPS geo-report on `/admin-test` is scoped to the reporting
  request's IP**, not just the row id and time window — otherwise anyone
  could guess/enumerate a recent row id and inject fake coordinates into
  a different visitor's logged entry.

## Bot honeypot

`server/decoy.ts` (served in production via `api/decoy.ts`) handles a
handful of URLs bots commonly scan for (`/wp-admin`, `/wp-login.php`,
`/administrator`, `/phpmyadmin`, `/admin-test` — see
`shared/decoy-paths.ts`), reached via `vercel.json` rewrites since they
sit outside `/api/*`. It's intentionally unauthenticated and public —
that's the point. Every request (GET or POST) is logged to a `bot_log`
table with IP, geo-IP data (country/city/lat-lon), user agent, and — if
the request POSTed something that looks like a login form (recognizing
both generic `username`/`password` and WordPress's `log`/`pwd` field
names, as JSON or form-encoded) — the submitted username and password. It
always responds with a generic "Invalid username or password," never
grants anything, and never touches real admin sessions. View captured
activity at `/admin/bot-activity` (real-admin-auth protected, same as
everything else under `/admin`). Entries older than 90 days are pruned
automatically.

Every decoy path sends `X-Robots-Tag: noindex, nofollow, noarchive` and a
matching `<meta name="robots">` tag, and `public/robots.txt` disallows
them too, so search engines never crawl or index a page that looks like a
real login form (avoids it turning up in search results or getting
flagged as a phishing lookalike).

`/admin-test` (`PRECISE_LOCATION_PATH` in `shared/decoy-paths.ts`) is the
same idea plus one thing: the served page includes a small inline script
that asks the browser's Geolocation API for exact coordinates and reports
them back (`{ __geoReportFor: <row id>, latitude, longitude, accuracy }`)
to the same path. Plain HTTP scanners never execute JavaScript, so this
only ever affects a real browser that loads the page and grants the
permission prompt — most bots won't. The report updates the specific row
it names (scoped to that path and a 10-minute window, so it can't be used
to tamper with unrelated rows), setting `location_source = 'gps'` and
`accuracy_m`; the admin view links straight to Google Maps for that point
and visually distinguishes it from the IP-based estimate.

`shared/decoy-paths.ts` is the single source of truth for the path list —
`vercel.json`'s rewrites, the Vite dev proxy, and `scripts/dev-server.ts`
all read from it, so there's one place to add a new bait path.

## Project layout

```
api/[...path].ts                  Vercel entry point, adapts to server/api.ts (all of /api/*)
api/decoy.ts                      Vercel entry point, adapts to server/decoy.ts (honeypot)
api/_lib/adapter.ts               Node req/res <-> Fetch Request/Response bridge
api/_lib/vercel-context.ts        Builds RequestContext from Vercel's geo-IP/client-IP headers
server/api.ts                     Main handler, routes all /api/* — plain (Request) => Response
server/decoy.ts                   Honeypot handler — plain (Request) => Response
server/lib/                       db, auth, audit, seating/timetable/bot-log logic modules
server/lib/request-context.ts     Platform-neutral {ip, geo} shape handlers depend on
shared/types.ts                   Types shared by frontend and backend
shared/decoy-paths.ts             Honeypot path list (single source of truth)
scripts/setup-admin.mjs           One-time DB schema + first-admin bootstrap
scripts/dev-server.ts             Local dev server (npm run dev:local) — no Vercel CLI needed
src/pages/SeatingChart.tsx        Public chart + live Now/Next timetable panel
src/pages/AdminLogin.tsx          Admin sign-in
src/pages/AdminPanel.tsx          Admin panel (roster, rules, log, admins)
src/pages/TimetableAdmin.tsx      Weekly timetable editor
src/pages/RoomTimetableAdmin.tsx  Room-override editor
src/pages/BotActivity.tsx         Honeypot capture viewer
src/schedule.ts                   Client-side "what's happening now" computation
```

Timetable and room-timetable data are stored the same way as the seating
chart (`timetable_state` / `room_timetable_state` tables, same
optimistic-concurrency singleton-row pattern) — same auth, same audit
logging, same multi-device sync. Grid edits (period times, subjects, split
groups, home-room checkboxes) are a local draft with an explicit **Save
changes** button, same reasoning as the roster: editing shouldn't fire a
network request per keystroke.
