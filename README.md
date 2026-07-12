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
  for (`/wp-admin`, `/wp-login.php`, `/administrator`, `/phpmyadmin`).
  Nothing ever actually signs in through them — every hit (and any
  submitted username/password) is logged with IP and geo-IP country/city,
  viewable at `/admin/bot-activity`.

Rebuilt from a Claude Design HTML/CSS/JS prototype
(`../student-seating-arrangement-plan/`) as a real deployable app: React
frontend + Netlify Functions backend + a shared database, so every device
sees the same chart (the prototype used per-browser `localStorage`, which
doesn't work once real students on real devices are involved).

## How it works

- **Frontend**: React + Vite, built to `dist/`, served as a static site.
- **Backend**: Netlify Functions (`netlify/functions/api.ts`), a single
  serverless function handling `/api/*`.
- **Database**: [libSQL](https://turso.tech/libsql) — SQLite-compatible.
  Locally it's just a file (`local.db`), no setup needed. In production it
  must point at a hosted libSQL database (e.g. [Turso](https://turso.tech),
  free tier is enough for this) because Netlify Functions run in a fresh,
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
npm install -g netlify-cli   # if you don't already have it
netlify dev
```

This runs the Vite frontend and the Netlify Function together at
`http://localhost:8888`, using a local `local.db` SQLite file (created
automatically — nothing to configure).

If `netlify-cli` won't install on your Node version, run `npm run dev:local`
instead — a small netlify-cli-free dev server (`scripts/dev-server.ts`) that
does the same job, and auto-restarts on file changes.

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

## Deploying to Netlify

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

3. **Push this repo to GitHub/GitLab and connect it as a new Netlify site**
   (or run `netlify deploy --prod` from the CLI). Netlify will read
   `netlify.toml` automatically (build command, publish dir, functions dir).

4. **Set environment variables on the Netlify site** (Site configuration →
   Environment variables):
   - `DATABASE_URL` = `libsql://your-db.turso.io`
   - `DATABASE_AUTH_TOKEN` = the token from step 1

   Do **not** set `DATABASE_URL` to a `file:` path in production — the app
   deliberately refuses to start that way (see `netlify/functions/lib/db.ts`)
   to avoid silently losing data on an ephemeral filesystem.

5. Deploy. Students visit the site root; sign in at `/admin/login`.

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
- `netlify.toml` sets `Content-Security-Policy`, `X-Frame-Options`,
  `Referrer-Policy`, `HSTS`, etc. on every response.

## Bot honeypot

`netlify/functions/decoy.ts` is a second, separate serverless function bound
directly to a handful of URLs bots commonly scan for (`/wp-admin`,
`/wp-login.php`, `/administrator`, `/phpmyadmin` — see
`shared/decoy-paths.ts`). It's intentionally unauthenticated and public —
that's the point. Every request (GET or POST) is logged to a `bot_log`
table with IP, Netlify's built-in geo-IP data (country/city/lat-lon), user
agent, and — if the request POSTed something that looks like a login form
(recognizing both generic `username`/`password` and WordPress's `log`/`pwd`
field names, as JSON or form-encoded) — the submitted username and
password. It always responds with a generic "Invalid username or
password," never grants anything, and never touches real admin sessions.
View captured activity at `/admin/bot-activity` (real-admin-auth
protected, same as everything else under `/admin`). Entries older than 90
days are pruned automatically.

Since these paths sit outside `/api/*`, in local dev the Vite proxy and
`scripts/dev-server.ts` route them to the decoy function specifically —
see `shared/decoy-paths.ts` for the single source of truth all three
places (Netlify's `config.path`, the Vite proxy, and the dev server) read
from.

## Project layout

```
netlify/functions/api.ts          Main serverless function, routes all /api/*
netlify/functions/decoy.ts        Honeypot function, bound to fake admin-login paths
netlify/functions/lib/            db, auth, audit, seating/timetable/bot-log logic modules
shared/types.ts                   Types shared by frontend and backend
shared/decoy-paths.ts             Honeypot path list (single source of truth)
scripts/setup-admin.mjs           One-time DB schema + first-admin bootstrap
scripts/dev-server.ts             netlify-cli-free local dev server (npm run dev:local)
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
