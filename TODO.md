# TODO

## Password reset email doesn't deliver — blocked on a decision

Feature is fully built (`/forgot-password`, `/reset-password`,
`PasswordResetToken` model, `lib/passwordReset.js`, `lib/email.js`,
25/25... 37/37 tests pass) and `RESEND_API_KEY` is set in Vercel — but
sending fails: `"Domain is not verified: The domain used to send this
email needs to be verified."` Resend requires a verified domain even for
its own `onboarding@resend.dev` sender on this account, and this project
has no custom domain (only the `*.vercel.app` one).

Options put to the user, decision pending ("ще го мисля"):
1. Gmail SMTP via Nodemailer + a Google App Password on `asenov78@gmail.com`
   — no domain needed, works immediately.
2. Verify a subdomain of an existing domain the user already controls
   (apsbg.com, invoicealert.app, dravion...) in Resend.
3. Buy a small domain just for this project.

Don't touch this again until the user picks a direction.

## Run /cso and /improve-codebase-architecture over the whole project

Not started. User asked for both a security audit (`/cso`) and an
architecture review (`/improve-codebase-architecture`) covering the full
app — not just the areas touched this session (auth, encryption at rest,
credential handling, the cron/self-hosted-proxy setup, Prisma schema).
Worth doing now that the feature set (multi-user accounts, encrypted
Garmin/Xiaomi credentials, password reset, self-hosted Garmin proxy) has
settled rather than mid-churn.

## Self-hosted replacement for third-party proxies (goal: everything runs on our own infra)

- **Garmin upload** — **DONE, switched over.** See below.
- **Xiaomi Cloud login + weights fetch** — `https://grzegorz366-20366.wykr.es`
  - Still not attempted. Harder: reverse-engineered, undocumented QR-code SSO
    login protocol, no known open-source implementation found (checked
    `export2garmin` — that project talks to the scale over local Bluetooth,
    not the Xiaomi Cloud account API, so it doesn't transfer). Self-hosting
    this means reverse engineering Xiaomi's login/signing flow ourselves.
    Higher risk (Xiaomi can change the protocol without notice) and effort.

### Garmin: self-hosted proxy is live in production — DONE

`GARMIN_PROXY_URL` in Vercel production now points at
`https://linux-bot.tail8b795f.ts.net/upload` — our own patched
build of YAGCC, running on `linux-bot`. `frog01-20364.wykr.es` (the
original third-party proxy) is no longer used.

**Root cause of the blocker** (issue #15) traced all the way through the
source (`gh api`, not summaries): `TryToAuthenticate()` in `Client.cs`
calls the real Garmin SSO login. When that login throws instead of
cleanly returning `IsSuccess: false`, the `catch` block never sets
`result.ErrorLogs` (no default initializer, stays `null`), so
`UploadEndpoints.cs`'s `uploadResult.ErrorLogs.LastOrDefault()` crashes —
the null-check bug was just hiding a transient Garmin-login exception,
not a permanent block.

**Fix** (patched in our own build, not upstream yet): in both `catch`
blocks of `TryToAuthenticate()`, set `result.ErrorLogs` to the real
exception message before returning; in `UploadEndpoints.cs`, use
`uploadResult.ErrorLogs?.LastOrDefault()` (null-safe) as a second layer.
Rebuilt the Docker image on `linux-bot` from patched source
(`docker build -f src/Api/Dockerfile`), swapped it in on the same port
(`yagcc-patched`, `--restart unless-stopped` so it survives reboots/
crashes), re-ran the same real-credentials test that used to crash —
**4/4 real uploads succeeded** across two test runs. Whatever was
throwing inside `Authenticate()` is transient (matches the maintainer's
recent "multi flow auth" / "extended random delays" commits) — retrying
just works.

Posted the root-cause + fix as a
[comment on issue #15](https://github.com/lswiderski/yet-another-garmin-connect-client/issues/15#issuecomment-5203533022)
upstream, offered to open a PR.

**Known operational risk, accepted for now**: `ClientFactory.Create()`
fetches OAuth consumer keys from
`github.com/.../raw/main/oauth_consumer.json` on every request with no
persistent cache (separately confirmed via issue #13) — under real load
this could hit GitHub 429s. Personal-scale traffic (a handful of syncs
every few minutes) is unlikely to trip it, but if Garmin syncs start
failing with a GitHub-rate-limit-shaped error, this is the first thing to
check. Also: `linux-bot` is a single laptop — if it's down, Garmin sync
just fails until it's back (same single-point-of-failure tradeoff as
before, no change).

<details>
<summary>Original investigation (superseded, kept for context)</summary>

### Garmin: found the real thing, it has a blocking bug

The proxy's own README pointed at its source:
[lswiderski/bodycomposition-webapi](https://github.com/lswiderski/bodycomposition-webapi)
(Go, marked outdated) → superseded by
[lswiderski/yet-another-garmin-connect-client](https://github.com/lswiderski/yet-another-garmin-connect-client)
(YAGCC, .NET, MIT, Docker image
`lswiderski/yet-another-garmin-connect-client-api`).

Confirmed from YAGCC's actual source
(`src/Api/Contracts/BodyCompositionRequest.cs`, `src/Api/Endpoints/UploadEndpoints.cs`):
identical `/upload` route, identical field names (case-insensitive JSON
binding), and `DateTime.UnixEpoch.AddSeconds(request.TimeStamp.Value)` —
proof that unix **seconds** is the correct `timeStamp` unit (matches what we
landed on this session) and explains why sending milliseconds threw a
`DateTime` overflow exception earlier: the server added our ms value as if
it were seconds and blew past year 9999.

**Deployed and reachable**: running via Docker on `linux-bot`
(`docker run -p 8081:8080 lswiderski/yet-another-garmin-connect-client-api`),
exposed publicly via `tailscale funnel --bg 8081` at
`https://linux-bot.tail8b795f.ts.net` (Tailscale Funnel — no router port
forwarding needed).

**But it doesn't work**: a real-credentials test against `/upload` returns
`400 "Exception: Value cannot be null. (Parameter 'source')"` — matches
[issue #15](https://github.com/lswiderski/yet-another-garmin-connect-client/issues/15)
on that repo exactly (open, unresolved, `ArgumentNullException` from a
`.LastOrDefault()` call in `UploadEndpoints.cs`). Not a config problem on our
end — same error with fake and real credentials.

`lib/garminSync.js` reads `GARMIN_PROXY_URL` from env (falls back to the
original proxy) so switching over later is a one-line env var change —
infrastructure is ready, just not flipped on. Revisit if the upstream issue
gets fixed, or consider patching it ourselves (would need a .NET toolchain)
if this becomes worth the effort.

Instance metadata (`GET /` on the linux-bot deployment), for reference —
confirms the version we tested and that it also exposes a blood-pressure
upload endpoint we haven't looked at (not needed for this app, S400 is
weight/composition only):
```json
{"name":"yet-another-garmin-connect-client-api","projectUrl":"https://github.com/lswiderski/yet-another-garmin-connect-client","uploadBodyCompositiontEndpoint":"/upload","uploadBloodPressureEndpoint":"/uploadbloodpressure","version":"0.0.14.0"}
```
Watch [issue #15](https://github.com/lswiderski/yet-another-garmin-connect-client/issues/15)
— when it's closed upstream, bump the Docker image on linux-bot, re-run the
same real-credentials test, and flip `GARMIN_PROXY_URL` in Vercel prod if it
passes.

### Root cause, actually traced this time (not just "known bug")

Read the whole call chain on GitHub (`gh api`, not the summarized README):
`UploadEndpoints.cs` → `Client.Weight.cs UploadWeight()` → `Client.cs
TryToAuthenticate()`. Found it:

- `TryToAuthenticate()` calls the real Garmin SSO login (`Authenticate()`).
  If login **throws** (`GarminClientException` or any `Exception`) — as
  opposed to cleanly returning `IsSuccess: false` — the `catch` block only
  does `_logger.Error(ex, ex.Message)` (internal NLog only) and returns
  `result` **without ever setting `result.ErrorLogs`**. `UploadResult.
  ErrorLogs` has no default initializer (`IList<string> ErrorLogs { get;
  set; }`), so it's `null`, not empty.
- Because auth threw, `IsOAuthValid` stays false, so `TryToUploadActivity()`
  — the *only* other place that sets `ErrorLogs` — never runs.
- `UploadEndpoints.cs` then does
  `uploadResult.ErrorLogs.LastOrDefault()` on that null list → the exact
  `ArgumentNullException: Value cannot be null (Parameter 'source')` we hit.

**So the real problem is that Garmin's login (`Authenticate()`) is throwing
an exception for us, and the null-check bug is just hiding what that
exception actually says.** Corroborating evidence: the maintainer's two most
recent commits (May 31, 2026) are "First try with multi flow auth" and
"Extended random delays between requests" — exactly the kind of change you'd
make if Garmin's SSO flow started tripping bot detection / rate limiting.
Also confirmed separately (issue #13): `ClientFactory.Create()` fetches
OAuth consumer keys from `github.com/.../raw/main/oauth_consumer.json` on
**every** request with no persistent cache — a different, real fragility of
self-hosting this project (frequent GitHub 429s under load), though not the
cause of our specific crash (a 429 there throws before auth and would
surface as a Flurl exception message, not this one).

**Plan**:
1. Fork, patch two things, build our own Docker image (repo has its own
   Dockerfile, so `docker build` needs no local .NET toolchain):
   - `Client.cs TryToAuthenticate()`: set `result.ErrorLogs =
     Logger.GetErrorLogs()` (and ideally push `ex.Message` into it) in both
     `catch` blocks before returning, so a thrown auth exception isn't
     silently swallowed.
   - `UploadEndpoints.cs`: `uploadResult.ErrorLogs?.LastOrDefault()` (null-
     safe) as a belt-and-suspenders fix regardless of the above.
2. Rebuild + redeploy on `linux-bot`, re-run the same isolated real-
   credentials test used before (decrypt real GarminCredential, POST
   directly to the Funnel URL — never touches the live app's
   `GARMIN_PROXY_URL` or marks anything synced).
3. Read whatever real error comes back this time:
   - Bot-detection / CAPTCHA / blocked-IP → self-hosting from linux-bot's
     IP may not be viable regardless of code fixes; not worth chasing
     further for a personal-scale tool.
   - A genuine, fixable auth bug → worth it, and worth upstreaming as a PR
     to lswiderski's repo (keeps us on the official image going forward
     instead of maintaining a fork).
4. Either way, post the root-cause finding as a comment on issue #15 —
   costs nothing, helps the maintainer, and might get it fixed upstream
   before we'd otherwise revisit this.
5. `GARMIN_PROXY_URL` / prod stays on the current working third-party proxy
   through all of this — same "isolated test, don't touch what works"
   discipline as the first YAGCC investigation.

This plan was executed — see the DONE summary above.

</details>

## Design audit vs bulma.io/documentation/elements — DONE

User asked for a full pass: read every element on
[bulma.io/documentation/elements](https://bulma.io/documentation/elements/)
and use the real ones instead of inventing custom combos. Checklist:

- [x] Stat tiles (`pages/index.js`) — were `.box` + a raw
  `has-background-X-light` helper with no matching text color (illegible
  pale-on-pale in dark mode). → real **Notification** element
  (`notification is-X is-light`), which pairs bg+text correctly per Bulma's
  own design.
- [x] Navbar buttons — were `is-primary is-outlined` on an `is-primary` bar
  (invisible, same hue as background). → `is-light`, matching Bulma's own
  basic-navbar doc example (colored bar + is-light buttons).
- [x] Navbar "Mi Cloud Connector (S400)" link — removed, redundant with the
  dashboard's connection card.
- [x] Navbar logo — raw `next/image` with manual width/height, not wrapped
  in Bulma's **Image** element. → `<figure class="image is-32x32">`.
- [x] Page-section spacing (`pages/index.js`) — was manual `mb-2`/`mb-5`/
  `mb-6` utility stacking on every section, fighting the bottom-margin
  `.box`/`.notification` already inherit from Bulma's `%block` placeholder.
  → wrapped each top-level section in the **Block** element (`class="block"`)
  for the canonical 1.5rem rhythm instead of ad-hoc numbers.
- [x] "Disconnect" links (`xiaomiCloud.js`, `sync/garmin.js`) — were plain
  `<a>` text. → Bulma's **Delete** element (`button class="delete"`) next
  to the connected-status line — it's literally the documented affordance
  for "remove/dismiss this thing", closer to the actual action than a text
  link.
- Left as-is (already correct, or a documented exception):
  - `.table`, `.tag`, `.field`/`.control`/`.input`, `.level`, `.buttons` —
    already the real elements/components, not homemade.
  - QR code image frame (`xiaomiCloud.js`) — deliberately fixed light
    background regardless of theme, documented inline (a QR code needs a
    light quiet-zone to scan, independent of page theme).
  - Emoji used as inline status icons (✅⏳🎉⚠️) — left as plain text, not
    forced into `.icon`/`.icon-text` wrappers; that helper is sized for
    icon-font glyphs and wrapping emoji in it added visual noise without a
    real correctness gain.

## Design: Bulma — DONE

Switched the whole UI from ad-hoc Tailwind utility classes to
[Bulma](https://bulma.io) (user liked its look). Full swap, not a partial
crib: `npm uninstall tailwindcss @tailwindcss/forms autoprefixer postcss`,
`npm install bulma`, `styles/globals.css` now just `@import
'bulma/css/bulma.min.css'` plus a couple of layout helper classes
(`.app-shell`/`.app-main` for the sticky footer). `tailwind.config.js` and
`postcss.config.js` removed.

Every page/component rewritten to Bulma's class vocabulary (`box`, `field`/
`control`/`input`, `button is-primary|is-link|...`, `notification`, `tag`,
`table is-fullwidth`, `navbar` with a working burger menu) —
`components/layout.js`, `components/navbar.js`, `components/footer.js`,
`components/weightChart.js`, `pages/index.js`, `pages/login.js`,
`pages/register.js`, `pages/cloud/xiaomiCloud.js`, `pages/sync/garmin.js`,
`pages/sync/garmin-bulk.js`. `components/scanner.js` left untouched — it's
dead code, not imported anywhere (Bluetooth flow isn't in this fork's UI).

Verified: `npm run build` clean, all 25 Vitest tests pass, dev server
checked in-browser (computed styles confirmed Bulma classes resolve, e.g.
`.button.is-primary` background matches Bulma's palette).

### Reliability fix that came out of this: cron scheduling

GitHub Actions' `schedule` trigger (`*/10 * * * *`) turned out to fire far
less reliably than configured in practice — observed gaps of 1-3+ hours
between actual runs (this is a documented GitHub Actions limitation under
load, not specific to this repo). A real morning weigh-in sat unsynced for
hours because of it.

**Fix**: moved the trigger to a `crontab` entry directly on `linux-bot`
(`*/5 * * * * curl ... /api/cron/sync`) — our own always-on machine, not
subject to a third party's scheduler queue. `.github/workflows/sync-cron.yml`
is kept as a secondary fallback (in case linux-bot itself is down), but
linux-bot's crontab is now primary.

## Full automation: pull new Xiaomi data and push to Garmin on a schedule — DONE

Implemented once manual sync was confirmed solid (correct dates, no dupes,
no more silent hangs):

- `pages/api/cron/sync.js` — for every user with both XiaomiCredential and
  GarminCredential saved: `fetchAndImportXiaomiWeights` (lib/xiaomiSync.js)
  pulls latest Xiaomi Cloud data and imports new records (dedup'd via the
  existing sourceDate unique constraint), then `syncPendingMeasurementsBatch`
  (lib/garminSync.js) pushes up to 10 pending measurements to Garmin.
  Auth'd via `CRON_SECRET` in the `x-cron-secret` header.
- Triggered by **GitHub Actions** (`.github/workflows/sync-cron.yml`), not
  Vercel's own Cron Jobs — Hobby plan caps Vercel Cron at once/day, way too
  coarse. GitHub Actions' `schedule` runs every 10 minutes instead, calling
  the endpoint over plain HTTPS. Also has `workflow_dispatch` for a manual
  "run it now" trigger from the Actions tab.
- `/sync/garmin-bulk` now polls `GET /api/sync/garmin/bulk` every 15s and
  shows live totals instead of requiring "batch size + click" — the manual
  POST is still there as a "sync now, don't wait for the next auto-run"
  fallback, but the cron job is the primary path.

Remaining loose end: if the Garmin/Xiaomi proxy starts throttling during an
unattended cron run, nobody's watching to notice the way we were during
manual testing — errors land in `syncError` on the Measurement row and in
Vercel's function logs, but there's no alerting. Fine for personal-scale use;
revisit if this becomes flaky unattended.
