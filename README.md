# Class Seating Chart

A classroom seating-plan app with:

- A **public page** (`/`) students visit to see the current seating chart.
- An **admin panel** (`/admin`) — protected by per-person username/password
  accounts — where a teacher manages the roster, shuffles/rotates seats,
  pins fixed seats, sets "keep apart" rules, and reviews an **activity log**
  of every change and who made it.

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

## Project layout

```
netlify/functions/api.ts        Single serverless function, routes all /api/*
netlify/functions/lib/          db, auth, audit, seating-logic modules
shared/types.ts                 Types shared by frontend and backend
scripts/setup-admin.mjs         One-time DB schema + first-admin bootstrap
src/pages/SeatingChart.tsx      Public read-only chart
src/pages/AdminLogin.tsx        Admin sign-in
src/pages/AdminPanel.tsx        Admin panel (roster, rules, log, admins)
```
