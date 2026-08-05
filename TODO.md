# TODO

## Self-hosted replacement for third-party proxies (goal: everything runs on our own infra)

Currently two external services are load-bearing:

- **Garmin upload** — `https://frog01-20364.wykr.es/upload` (author's hosted proxy)
  - Feasible to self-host: Garmin Connect's unofficial API is reasonably well
    documented by the community (`garth`, `python-garminconnect`). Reimplement
    the OAuth1 login + `.fit`/weight upload as our own Vercel API route or a
    small Node/Python service, drop the proxy dependency entirely.
- **Xiaomi Cloud login + weights fetch** — `https://grzegorz366-20366.wykr.es`
  - Harder: reverse-engineered, undocumented QR-code SSO login protocol, no
    known open-source implementation found (checked `export2garmin` — that
    project talks to the scale over local Bluetooth, not the Xiaomi Cloud
    account API, so it doesn't transfer). Self-hosting this means reverse
    engineering Xiaomi's login/signing flow ourselves. Higher risk (Xiaomi
    can change the protocol without notice) and higher effort.

**Plan**: start with Garmin (lower risk/effort, keeps credentials fully
in-house), evaluate Xiaomi Cloud self-hosting separately once that's proven
out. Revisit and write a concrete implementation plan before starting.

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
