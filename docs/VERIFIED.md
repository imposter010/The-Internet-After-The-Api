# Verification record

Verified locally on 10 October 2026 with Node 22.20.0, MongoDB 7.0.24, and Chrome through Playwright. The MongoDB process is real; the provider and gateway exchange actual HTTP requests. Browser tests use the built provider console and Vite-served React dashboard and ShopFlow.

| Check | Result |
| --- | --- |
| `npm run build` | Both React production bundles built successfully |
| `npm test -- --reporter=verbose` | 31 tests passed across integration and safety suites |
| `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e` | 2 browser tests passed, including mobile |
| `npm run dev` | MongoDB, provider, gateway, dashboard, and client started successfully |
| `npm run demo` | Four real upstream changes detected; three repairs activated; unsafe pricing and checkout rejected |
| `npm audit --audit-level=high` | No known dependency vulnerabilities reported |

In PowerShell, select an installed browser with `$env:PLAYWRIGHT_CHANNEL = 'chrome'` before the browser-test command, or install Playwright Chromium as described in the README. The build emits a size advisory for the roughly 501 KB console JavaScript bundle; this does not prevent a successful build.

The HTTP demo recorded 38 upstream observations, 4 incidents, 3 verified repairs, and 1 active safety block before its cleanup. Each activated passport contained six passing checks: restricted definition, golden fixture replay, three independent HTTP probes, semantic and business invariants, affected workflow replay, and a final deployment probe. Cleanup restored the provider to normal and recorded subsequent healthy observations.

The regression suite additionally verifies:

- Masked persisted observations and encrypted golden fixtures, excluded from snapshots.
- Safe aliases, hours-to-days conversion, single-item response normalization, and GET retries honoring Retry-After.
- Server-side checkout validation and refusal to approve an unverified price conversion.
- Authentication, forbidden browser origins, and client isolation from the provider.
- Malformed JSON, network disconnects, and request timeouts.
- MongoDB persistence across gateway restart and resumption of interrupted validation.
- Rollback suppression even if volatile rate-limit evidence changes.
- Coordinated supported drifts, rejection of unsafe workflow dependencies, and identity invariants.
- Prevention of activation when a passport cannot be persisted, plus MongoDB's unique active-adapter constraint.
- Socket.IO snapshot synchronization and event delivery.

Browser verification exercised the provider's scenario controls, the client's stale state and disabled checkout, visible recovery, dashboard passport inspection, and mobile price blocking followed by upstream restoration. No uncaught page errors were observed, and ShopFlow made no requests to the provider. Desktop and mobile screenshots were inspected and remain locally under `.cache/screenshots/`; they are excluded from Git.

Dockerfiles and Compose configuration are supplied, but container execution was not tested because Docker is not installed here. Three physical laptops and Wi-Fi connectivity require the [LAN deployment check](LAN.md). Optional LLM requests were not exercised against an external model endpoint without credentials. Checkout is a preview; payments and order processing are outside this demo.
