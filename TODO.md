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
