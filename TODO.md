# TODO

## Self-hosted replacement for third-party proxies (goal: everything runs on our own infra)

Currently two external services are load-bearing:

- **Garmin upload** — `https://frog01-20364.wykr.es/upload` (author's hosted proxy)
  — **investigated, blocked by an upstream bug, not switched over. See below.**
- **Xiaomi Cloud login + weights fetch** — `https://grzegorz366-20366.wykr.es`
  - Still not attempted. Harder: reverse-engineered, undocumented QR-code SSO
    login protocol, no known open-source implementation found (checked
    `export2garmin` — that project talks to the scale over local Bluetooth,
    not the Xiaomi Cloud account API, so it doesn't transfer). Self-hosting
    this means reverse engineering Xiaomi's login/signing flow ourselves.
    Higher risk (Xiaomi can change the protocol without notice) and effort.

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
