# API Phoenix

API Phoenix is a MERN development demo of an API gateway that observes real upstream HTTP traffic, detects contract drift, and activates restricted compatibility adapters only after validation. An independent Express provider supplies customer, pricing, and shipping APIs; the React dashboard shows MongoDB evidence and repair decisions; the React ShopFlow client retrieves service data through the gateway.

The core stack is Node.js, Express, MongoDB/Mongoose, React/Vite, Tailwind CSS, Socket.IO, Zod, and React Flow. A Groq-hosted LLM analyst classifies incidents as minor or major, lists changes and effects in English/Hinglish, corroborates restricted repair candidates, or requests operator review. Independent validation remains mandatory; deterministic detection and repair work without an LLM. See [the one-key LLM setup and judge guide](docs/LLM-GUIDE.md).

| Workspace | Role | Default URL |
| --- | --- | --- |
| `apps/provider` | Independent simulated upstream; serves built provider panel | `http://localhost:8001/provider` |
| `apps/gateway` | Observations, drift detection, validation, adapters, checkout preview | `http://localhost:8000` |
| `apps/console` | Phoenix dashboard; also builds the provider panel | `http://localhost:5173` |
| `apps/shopflow` | ShopFlow client | `http://localhost:5174` |
| `packages/shared` | Contracts, adapter definitions, event schemas, masking | Shared by the applications |

For three separate Windows laptops, follow [docs/LAN.md](docs/LAN.md). The Docker option below runs the services on one host and can expose the UIs to the LAN.

See [docs/VERIFIED.md](docs/VERIFIED.md) for the executed checks, tested repair behavior, and remaining verification limits.

## Local quick start

Install Node.js **22.12 or newer** (Node 22 is used by Docker), with npm on `PATH`. Run these commands in PowerShell from the repository root:

```powershell
$env:MONGOMS_DISABLE_POSTINSTALL = '1'
npm install
npm run dev
```

`MONGOMS_DISABLE_POSTINSTALL=1` defers the MongoDB download until a managed database is actually started; the Windows archive can be roughly 600 MB. It does not disable MongoDB at runtime. The launcher starts a **real MongoDB binary** through `mongodb-memory-server`, using WiredTiger and persistent storage in `.cache/mongo-data`. Despite the package name, this local demo does not substitute an in-memory JavaScript database. If `MONGODB_URI` is configured in the gateway environment or shell, the launcher connects to that database instead. The first managed-MongoDB run needs internet access unless an existing binary is selected.

For this checkout only, a portable Node installation may already be available in `.tools`. If `node`/`npm` are missing from `PATH`, add it in each terminal before running commands:

```powershell
$env:PATH = "$((Resolve-Path '.tools/node-v22.20.0-win-x64').Path);$env:PATH"
node --version
npm --version
```

The portable runtime is a local setup artifact, not a prerequisite shipped with a fresh clone. If a verified MongoDB executable already exists at the optional cache location, select it before starting dev, standalone MongoDB, or tests:

```powershell
if (Test-Path -LiteralPath '.cache/mongodb-runtime/mongod.exe') {
    $env:MONGOMS_SYSTEM_BINARY = (Resolve-Path '.cache/mongodb-runtime/mongod.exe').Path
}
```

You can instead set `MONGOMS_SYSTEM_BINARY` to the absolute path of a compatible, trusted installed `mongod.exe`. This selects an executable for the managed process; `MONGODB_URI` selects an already running database. The cached executable may not be present until its separate download completes.

The launcher also starts the provider, gateway, and both Vite servers. It builds the frontends if the console build is missing. After changing the provider UI, run `npm run build` and restart the launcher to refresh the assets served by Express. Stop the launcher with Ctrl+C; its managed database data remains on disk. Do not run another MongoDB process on port 27017 or start the isolated services on these same ports simultaneously.

Open the provider panel, dashboard, and ShopFlow URLs in the table. At port 8001 the console automatically selects provider mode. In each admin UI's connection form, enter the appropriate token:

```powershell
$devSecrets = Get-Content -LiteralPath '.cache/dev-secrets.json' -Raw | ConvertFrom-Json
$devSecrets.providerToken
$devSecrets.gatewayToken
```

These are local generated credentials; do not share the file or commit it. If you configured service tokens yourself, use those values instead. The admin UIs retain tokens in browser **session storage**, while connection URLs may be retained in local storage. ShopFlow needs no admin token. Never put admin tokens, the data key, or LLM credentials in a `VITE_*` variable.

Keep all provider scenarios healthy initially. The provider's **API Change Lab** shows the next generated HTTP response, lets you edit safe demo values at runtime, groups minor and major changes, and records actual provider requests. Save a value or apply a scenario, then use the dashboard's **Run probe** action or refresh ShopFlow; the provider does not secretly notify Phoenix. Learn healthy customer, pricing, and shipping baselines before introducing drift because repairs validate all dependent workflows.

## Commands and configuration

Run scripts from the repository root:

| Command | Behavior |
| --- | --- |
| `npm run dev` | Starts managed MongoDB unless a URI is supplied, both backends, and both frontends |
| `npm run mongo:dev` | Starts only managed development MongoDB on port 27017; retains `.cache/mongo-data` |
| `npm run dev:provider` | Starts only the Express provider, using `apps/provider/.env` and shell variables |
| `npm run dev:gateway` | Starts only the Express gateway; requires reachable MongoDB |
| `npm run dev:dashboard` | Starts the console Vite server on 5173 |
| `npm run dev:client` | Starts the ShopFlow Vite server on 5174 |
| `npm run build` | Builds both React applications; console output is `apps/console/dist` |
| `npm run test` | Runs Vitest tests, including temporary real MongoDB and HTTP integration traffic |
| `npm run test:e2e` | Runs Playwright against its test server; requires installed browser binaries |
| `npm run test:llm-ui` | Isolated LLM dashboard fixture tests on port 5183; no real provider calls or demo resets |
| `npm run demo` | Drives the four scenarios against already running backends over HTTP |

The isolated backend scripts load their own workspace `.env`; shell values take precedence. The root `.env` in the Docker instructions is for Compose and is not automatically loaded by these backend scripts. Frontend `.env.example` files describe public Vite settings; `VITE_GATEWAY_URL` must be the URL reachable by the **browser**. Vite reads it at startup or embeds it at build time; restart or rebuild after changing it.

| Variable | Service | Purpose |
| --- | --- | --- |
| `HOST`, `PORT` | Provider / gateway | Isolated server bind address and port; use `HOST=0.0.0.0` for LAN access |
| `PROVIDER_ADMIN_TOKEN` | Provider | Admin bearer token, at least 16 characters |
| `PROVIDER_CONSOLE_ORIGINS` | Provider | Comma-separated origins permitted for its admin UI |
| `MONGODB_URI` | Gateway | Real MongoDB connection URI |
| `PROVIDER_URL` | Gateway | Upstream origin reached by the gateway server |
| `GATEWAY_ADMIN_TOKEN` | Gateway | A separate admin bearer token, at least 16 characters |
| `GATEWAY_DATA_KEY` | Gateway | Stable secret used to derive the AES-256-GCM fixture encryption key |
| `DASHBOARD_ORIGINS` | Gateway | Exact dashboard origins for HTTP administration and Socket.IO |
| `CLIENT_ORIGINS` | Gateway | Exact ShopFlow origins for public API requests |
| `UPSTREAM_TIMEOUT_MS` | Isolated gateway | Upstream request timeout; default 4000 ms |
| `REPAIR_DELAY_MS` | Isolated gateway | Delay between repair stages; default 700 ms |
| `OBSERVATION_TTL_DAYS` | Isolated gateway | MongoDB observation retention; default 7 days |
| `GROQ_API_KEY` | Gateway | Only required LLM setting for the local demo; server-side Groq key |
| `OPENAI_API_KEY`, `LLM_MODEL` | Gateway | Optional OpenAI provider/model override; OpenAI defaults to `gpt-4o-mini` |
| `LLM_ENABLED`, `LLM_TIMEOUT_MS` | Gateway | Set enabled to `false` to opt out; model timeout defaults to 8000 ms |
| `LLM_URL`, `LLM_API_KEY` | Gateway | Optional full chat-completion endpoint/key overrides; HTTPS or loopback HTTP only |
| `VITE_GATEWAY_URL` | Console / ShopFlow | Public gateway URL, for example `http://192.168.1.102:8000` |
| `VITE_DASHBOARD_URL`, `VITE_SHOPFLOW_URL` | Console | Optional public URLs for links to the dashboard on B and ShopFlow on C; set before building A's panel |

Use distinct provider and gateway tokens. Set a separate, stable `GATEWAY_DATA_KEY` and retain it with the database. The isolated gateway currently falls back to its admin token when the data key is absent; rotating that token would then prevent decryption of existing fixtures. The all-in-one launcher instead has a generated data key in `.cache/dev-secrets.json`. Keep that file when reusing its database. Observation masking covers credentials and common PII fields; it is a field-based demo policy, not a guarantee that arbitrary sensitive payloads are anonymized. Golden fixtures are encrypted and excluded from admin snapshots.

## Repair demonstration

With `npm run dev` running, open a second PowerShell terminal in the repository root:

```powershell
npm run demo
```

The script uses cached local tokens, or explicit `PROVIDER_ADMIN_TOKEN` and `GATEWAY_ADMIN_TOKEN` shell values. It does not load the service `.env` files itself. For isolated or LAN backends, also set `PROVIDER_URL` and `GATEWAY_URL` in that terminal. The script **resets provider scenarios and gateway baselines, incidents, adapters, and repair history**, warms up with nine real HTTP observations, then performs these checks:

| Provider change | Gateway decision |
| --- | --- |
| Customer `name` becomes `display_name` | Validate observed value equivalence and activate a field alias |
| Shipping `eta_days: 3` becomes `eta_hours: 72` | Validate hours-to-days evidence and activate conversion only after regression checks |
| Pricing intermittently returns HTTP 429 | Validate a bounded GET-only retry policy; respect `Retry-After` within the delay budget |
| Pricing amount jumps from 799 to 79,900 with the same schema | Return HTTP 409, block checkout, and reject approval of an unverified price conversion |

Detection, proposal, validation, and deployment are backend stages visible over seconds; the first request after a change can fail while validation runs. Refresh ShopFlow after an adapter activates to observe recovery. Validation replays encrypted known-good fixtures, probes the independent provider, checks contracts and business invariants, and replays affected workflows. A Repair Passport records the evidence and decision in MongoDB.

**Revalidate & approve** requests fresh validation; it cannot override missing semantic evidence. For the price scenario, restore healthy pricing at the provider and refresh/probe again. The demo script restores all provider scenarios to normal in its cleanup and observes healthy traffic again; it leaves the recorded repair evidence available for inspection.

Rollback restores the previous adapter, if present, and holds the same drift from automatic redeployment. An operator can explicitly revalidate the incident after reviewing it. To begin a completely fresh demo manually, first restore the provider to normal, let running validations finish, reset gateway state through Settings, then learn healthy baselines again. Gateway reset deletes its observation and repair history; provider reset only changes provider behavior.

The LLM integration defaults to Groq's OpenAI-compatible chat endpoint and `openai/gpt-oss-20b`; paste only `GROQ_API_KEY` for the normal local setup. It sends masked incident data, schema/evidence, impacted workflows, and an existing allowlisted candidate (or null for unsafe drift). Strict structured output and independent Zod checks accept only that exact candidate or a valid abstention. Minor candidates still need every safety check. Major changes show their likely effects and manual accept/reject controls, but neither choice deploys an unsafe adapter. Invalid output or model outages explicitly fall back to deterministic validation, while unsupported drift remains blocked. Model guidance is recorded separately from executed tests in incidents and passports; generated JavaScript is never executed. Follow [docs/LLM-GUIDE.md](docs/LLM-GUIDE.md) for setup and limitations.

## Tests

```powershell
npm run build
npm run test
npx playwright install chromium
npm run test:e2e
```

Integration tests start temporary actual MongoDB instances and exercise HTTP traffic. MongoDB binary downloads may be necessary on first use. Playwright needs its browser installed and starts its own services; stop the local demo first to free the default ports. Run `npm run demo` separately against the development servers after testing. A successful local test run does not verify a physical three-laptop network.

To use an already installed Chrome instead of downloading Playwright Chromium, set `$env:PLAYWRIGHT_CHANNEL = 'chrome'` before `npm run test:e2e`. Leave this unset for Playwright's Chromium.

## Docker Compose

Install Docker with Compose v2; on Windows use Docker Desktop with Linux containers. From the repository root, create a root `.env` **once** with independently generated secrets. If it already exists, retain its secrets and edit its public URLs/origins instead:

```powershell
if (Test-Path -LiteralPath '.env') { throw 'Root .env already exists; retain its stable secrets and edit it instead.' }
$providerToken = node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"
$gatewayToken = node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"
$dataKey = node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"
@(
    "PROVIDER_ADMIN_TOKEN=$providerToken"
    "GATEWAY_ADMIN_TOKEN=$gatewayToken"
    "GATEWAY_DATA_KEY=$dataKey"
    'VITE_GATEWAY_URL=http://localhost:8000'
    'VITE_DASHBOARD_URL=http://localhost:5173'
    'VITE_SHOPFLOW_URL=http://localhost:5174'
    'PROVIDER_CONSOLE_ORIGINS=http://localhost:8001,http://127.0.0.1:8001'
    'DASHBOARD_ORIGINS=http://localhost:5173,http://127.0.0.1:5173'
    'CLIENT_ORIGINS=http://localhost:5174,http://127.0.0.1:5174'
) | Set-Content -LiteralPath '.env' -Encoding ascii
docker compose config --quiet
docker compose up --build -d
docker compose ps
```

Alternatively supply the three secrets through shell environment variables; Compose requires them and includes no default admin credentials. Missing values fail configuration; the backends also enforce the token length. Shell values override root `.env` values.

The default URLs are the same as the local table. Provider and gateway health endpoints are `/health`. All services have healthchecks, and dependencies wait for startup health. MongoDB is on a private internal network, has **no published host port**, and persists in the `mongo-data` named volume. The gateway reaches MongoDB as `mongo:27017` and the provider as `provider:8001`; these names are container addresses, not browser addresses.

The common Node 22 Dockerfile builds both React bundles. Its `backend` target retains production dependencies and built console assets, and Compose overrides its command for each backend. Its `frontend` target retains development dependencies and runs the Vite servers with `--host 0.0.0.0` on 5173/5174 via the workspace scripts. Compose is a development/demo deployment, not production frontend hosting. `.dockerignore` excludes local credentials, caches, downloaded tools, and host build/dependency directories.

For browsers on the LAN, replace `localhost` in root `.env` with the **Docker host's real LAN IP** for the three `VITE_*` URLs and the corresponding UI origins; see [the Docker LAN example](docs/LAN.md#docker-on-a-lan-host). The public URLs are passed both as build arguments and as the Vite runtime environment. Apply changes with `docker compose up --build -d`. Do not use `http://gateway:8000` as a browser URL.

```powershell
docker compose logs --tail 100 provider gateway
docker compose down
```

`down` retains the database volume. Keep the data key for the next startup. Adding `--volumes` intentionally deletes the persisted database and repair history. Do not start the native demo at the same time on these published ports. Avoid sharing expanded `docker compose config` output because it contains environment secrets.

## Scope and limitations

This is a development demonstration with one gateway process. In-process repair jobs and locks do not provide cluster coordination. The provider is an independent simulated API, not a production external vendor, and checkout is a verified preview with no payment or order placement. Repairs cover the explicit allowlisted demo transformations; changed semantics, missing required fields, and other unsupported changes can remain blocked.

HTTP LAN access and the private, unauthenticated development MongoDB setup assume a trusted demo network. Production authentication, TLS, database access controls, broader PII policies, and operational scaling require further work. Three physical laptops cannot be verified in this workspace. LLM transport, safety/fallback behaviour, and dashboard rendering are tested with simulated responses, not a real Groq model without credentials. API access, real-model quality, quota, and live latency require separate verification. Docker execution also requires a working Docker engine; static file checks alone do not establish a running container deployment.
