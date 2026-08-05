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
