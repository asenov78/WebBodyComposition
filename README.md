# Web Body Composition

Pulls weight/body-composition data from a Xiaomi/Yunmai scale (via Xiaomi Cloud —
tested with the **S400**) and syncs it to **Garmin Connect**, automatically, with the
correct historical date for each measurement.

Fork of [lswiderski/WebBodyComposition](https://github.com/lswiderski/WebBodyComposition)
— original was a single-user, Bluetooth-first, manual-upload tool. This fork adds
multi-user accounts, server-side storage of both cloud connections, and unattended
background sync. See [`TODO.md`](TODO.md) for what's next (self-hosting the two
external proxies this still depends on).

**Live**: https://scale.karolev.org (custom domain via Cloudflare; the Vercel-
assigned `web-body-composition-three.vercel.app` still works too)

## How it works

1. **Register / log in** (`/register`, `/login`) — email + password, `next-auth`
   (Credentials provider, JWT sessions), plus a "forgot password" email-link flow
   (`/forgot-password` → `/reset-password?token=...`). Every page is auth-gated by
   `middleware.js` except the auth pages and `/api/cron/*` (that one authenticates
   itself, see below).
2. **Connect Xiaomi Cloud** (`/cloud/xiaomiCloud`, "Mi Cloud Connector") — QR-code
   login against Xiaomi's account system (via a proxy, see below), then "Get
   Measurements" pulls your weight history. The connection (`userId` + `passToken`)
   is saved **server-side**, encrypted, tied to your account — not just this one
   browser's `localStorage`. Fetched records are imported into the `Measurement`
   table, deduplicated by exact weigh-in timestamp.
3. **Connect Garmin Connect** (`/sync/garmin-bulk`) — email + password once (Garmin's
   unofficial API doesn't support 2FA; you must disable it on your Garmin account).
   The resulting OAuth token is saved encrypted so later syncs don't need your
   password again.
4. **Sync** — pending (not-yet-synced) measurements get pushed to Garmin using each
   one's actual weigh-in date (not "today"). This happens two ways:
   - **Automatically**, in the background, every ~5 minutes — see
     [Automation](#automation) below. No browser needs to be open.
   - **On demand**, via the "Sync Now" button on `/sync/garmin-bulk` (useful right
     after connecting, or if you don't want to wait for the next scheduled run).
5. **Dashboard** (`/`) — current weight, a trend chart, connection status, and recent
   sync history. Polls every 15s so it reflects background progress without a manual
   refresh.

## Automation

`pages/api/cron/sync.js` does the actual work: for every user with **both** a Xiaomi
Cloud and a Garmin connection saved, it fetches new Xiaomi weigh-ins and pushes
pending ones to Garmin. It's authenticated via a shared secret
(`CRON_SECRET`, sent as the `x-cron-secret` header) rather than a session cookie, so
`middleware.js` explicitly excludes `/api/cron/*` from the login-required gate.

**It's not triggered by Vercel's own Cron Jobs.** Vercel's Hobby plan caps Cron Jobs
at once per day — too coarse for "keep going in the background." Primary trigger is
a `crontab` entry on a DigitalOcean droplet (`deploy@167.71.36.3`, shared with an
unrelated project that already runs it 24/7 — adding one more `curl` every 5 minutes
is effectively free) calling the endpoint every 5 minutes. This ran on a home
laptop (`linux-bot`) at first — moved off it 2026-08-07 purely to stop a physical
machine idling 24/7 just for a periodic curl; GitHub Actions' `schedule` trigger was
tried before that and proved unreliable in practice (observed gaps of 1-3+ hours
despite a 10-minute config, a known GitHub Actions limitation under load, not
specific to this repo). [`.github/workflows/sync-cron.yml`](.github/workflows/sync-cron.yml)
is kept as a secondary fallback and still has a `workflow_dispatch` trigger for
running it on demand from the Actions tab (`gh workflow run "Auto-sync Xiaomi ->
Garmin"`).

This means sync keeps running as long as the droplet (or, as fallback, GitHub
Actions) and Vercel are up — independent of your browser, your computer being on, or being
logged into the app.

### Why syncing happens in small batches, not all at once

Vercel serverless functions have a hard execution time limit
(`vercel.json` sets `maxDuration: 30` for the sync routes). Each Garmin proxy call
takes a second or more, plus a deliberate 400ms pacing delay between requests
(added after a real incident: a fast burst of ~17 uploads got the proxy to start
silently hanging on subsequent requests — see git history on `lib/garminSync.js` for
the full story). So each invocation processes a bounded batch (~10-12 items) and
reports how many are still pending; the next cron run — or a manual "Sync Now" —
picks up where it left off.

## Architecture

- **Next.js 14** (Pages Router), **NextAuth v4** (Credentials + JWT, no adapter —
  see the comment in `pages/api/auth/[...nextauth].js` for why mixing an adapter in
  caused an intermittent post-login redirect loop).
- **Bulma** for UI (real Bulma elements/components throughout — `box`, `field`/
  `control`/`input`, `notification`, `level`, `delete`, etc. — not ad-hoc CSS; see
  TODO.md for the design-audit pass). Dark mode is automatic
  (`prefers-color-scheme`) with a manual override toggle in the navbar.
- **Prisma 5 + Postgres** (Neon, via the Vercel-managed integration). Schema:
  `User`, `GarminCredential`, `XiaomiCredential`, `Measurement`,
  `PasswordResetToken`. `prisma db push` only (no `migrations/` — fine at this
  scale, see TODO.md).
- **Auth**: register/login (bcrypt-hashed passwords) plus a forgot-password email-
  link flow (`pages/api/auth/{forgot,reset}-password.js`, `lib/passwordReset.js` —
  tokens are SHA-256-hashed at rest, single-use, 1-hour expiry). Password-reset
  email sends via Gmail SMTP (`lib/email.js`) — see TODO.md for the plan to move
  this to Resend now that a real domain exists.
- **Encryption**: `lib/encryption.js`, AES-256-GCM, key from `ENCRYPTION_KEY`.
  Garmin/Xiaomi credentials and tokens are stored as `iv:authTag:ciphertext`, never
  plaintext.
- **Shared sync logic** lives in `lib/`, reused by both interactive API routes and
  the cron job, so there's exactly one implementation of each thing:
  - `lib/garminSync.js` — `pushMeasurementToGarmin` (one record),
    `syncPendingMeasurementsBatch` (loops it with pacing/time-budget),
    `computeGarminTimeStamp` / `extractErrorMessage` (pure helpers, unit tested).
    Proxy target is `GARMIN_PROXY_URL` (env, defaults to the third-party proxy) —
    a self-hosted swap was tried and reverted same-day; see TODO.md for why.
  - `lib/xiaomiSync.js` — `fetchAndImportXiaomiWeights` (server-side equivalent of
    what the browser does on the Mi Cloud Connector page).
  - `lib/xiaomiWeightParsing.js` — `parseWeightRecords`, shared by both the
    browser-side fetch and the server-side one (no server-only deps, so it's safe
    to import from client code too).
  - `lib/measurementImport.js` — `importMeasurementRecords` (dedup-on-import logic,
    shared by the client-driven import endpoint and the cron's Xiaomi fetch).

### External dependencies (see `TODO.md` for the plan to remove these)

- **Garmin upload**: `https://frog01-20364.wykr.es/upload` — a proxy hosted by the
  original project's author. Handles the unofficial Garmin Connect OAuth1 login +
  upload. Its own repo may be
  [lswiderski/bodycomposition-webapi](https://github.com/lswiderski/bodycomposition-webapi)
  (mentioned in the upstream README) — worth checking before reimplementing from
  scratch.
- **Xiaomi Cloud login + weights**: `https://grzegorz366-20366.wykr.es` — reverse-
  engineered, undocumented QR-code SSO flow. No known open-source reference found so
  far.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in POSTGRES_PRISMA_URL / POSTGRES_URL_NON_POOLING,
                              # AUTH_SECRET, ENCRYPTION_KEY, CRON_SECRET, NEXTAUTH_URL
npx prisma db push           # Prisma CLI needs .env, not .env.local — see below
npm run dev
```

Prisma's CLI (`prisma db push`, `prisma generate`) only auto-loads `.env`, not
`.env.local` (unlike Next.js, which loads `.env.local` at runtime). Simplest fix:

```bash
grep -E '^POSTGRES_PRISMA_URL|^POSTGRES_URL_NON_POOLING' .env.local > .env
```

## Testing

```bash
npm test
```

[Vitest](https://vitest.dev), mainly covering the `lib/` layer — the pure/isolable
logic where the real bugs during development actually lived (timestamp unit
mismatch, import dedup counting, error-message extraction). Most API routes are
thin wrappers around tested `lib/` functions plus `getServerSession`/Prisma calls,
verified manually against the real (Neon) database during development — except the
password-reset routes (`__tests__/api/auth/`), which do have dedicated mocked
tests. Those live outside `pages/` on purpose: Next.js's Pages Router treats every
file under `pages/api/` as a deployable route regardless of test intent, so a
`*.test.js` sitting next to a route file was shipping as its own (empty) live
serverless function.

## Deploying

```bash
npm run build          # catches type/lint errors before shipping
git push origin main
vercel --prod --yes
```

Neon Postgres is provisioned via the Vercel Marketplace integration
(`vercel integration add neon`), which populates `POSTGRES_PRISMA_URL` /
`POSTGRES_URL_NON_POOLING` automatically. Env vars are per-environment
(`vercel env add <NAME> production|preview|development` — one call per environment,
the CLI doesn't accept all three in a single invocation).

---

## Upstream (original project) notes

The rest of this section is preserved from the original single-user app for
reference — some of it (Bluetooth scanning, FAQ, Android app, manual single-entry
form) isn't part of this fork's menu anymore. The Bluetooth-scanner code itself
(`services/scanner.js`, `components/scanner.js`) was deleted from this fork (dead
code, zero live importers — see TODO.md's architecture-review notes); the
background below is kept for context on what the original upstream project did.

### iOS / iPadOS (iPhone/iPad)

Neither Safari nor Chrome support the Web Bluetooth API on Apple devices (only on
macOS does it work). An alternative browser like
[Bluefy - Web BLE Browser](https://apps.apple.com/us/app/bluefy-web-ble-browser/id1492822055)
is needed for the Bluetooth-scanning flow in the original upstream project (not
part of this fork).

### Android Native Application (original project)

- https://github.com/lswiderski/mi-scale-exporter/

### If you like the original author's work

<a href="https://www.buymeacoffee.com/lukaszswiderski" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/default-orange.png" alt="Buy Me A Coffee" height="41" width="174"></a>
