# Three-laptop LAN deployment

Run the independent provider on Laptop A, the gateway and MongoDB plus dashboard on Laptop B, and ShopFlow on Laptop C. Only the gateway makes upstream service calls; ShopFlow uses Laptop B's API. The provider does not notify Phoenix when an operator changes a scenario.

| Laptop | Service | Example address |
| --- | --- | --- |
| A | Provider API and its built React panel | `http://192.168.1.101:8001/provider` |
| B | Phoenix gateway | `http://192.168.1.102:8000` |
| B | Phoenix dashboard | `http://192.168.1.102:5173` |
| B | MongoDB, local to B | `mongodb://127.0.0.1:27017/api_phoenix` |
| C | ShopFlow | `http://192.168.1.103:5174` |

Browser traffic flows from ShopFlow on C to the gateway on B; the gateway sends server-side HTTP requests to the provider on A. The dashboard on B uses authenticated HTTP and Socket.IO to B's gateway. The provider panel on A uses A's authenticated admin API. MongoDB stays local to B.

## Prepare every laptop

Use the same repository revision, Node.js 22.12 or newer, and npm. Connect all three laptops to the same trusted network. Guest Wi-Fi or access-point isolation can prevent laptop-to-laptop communication. Use `ipconfig` to find the Wi-Fi/Ethernet IPv4 addresses; the addresses below are examples to replace, not addresses assigned by the application.

In each PowerShell terminal, change to that laptop's repository root and define the real addresses:

```powershell
Set-Location 'C:\path\to\The-Internet-After-The-Api'
$LaptopA = '192.168.1.101'
$LaptopB = '192.168.1.102'
$LaptopC = '192.168.1.103'
$env:MONGOMS_DISABLE_POSTINSTALL = '1'
npm install
```

The postinstall setting defers the large Windows MongoDB binary download until MongoDB is needed, so A and C need not download it for their services. B's first managed-MongoDB run still downloads a binary unless an existing one is selected. See [README.md](../README.md#local-quick-start) for the optional checkout-local portable Node `PATH` setup and `MONGOMS_SYSTEM_BINARY` selection; these settings apply only in the terminals where they are set.

New terminals do not inherit PowerShell variables; repeat the three address assignments there. The setup below uses the isolated scripts, so no laptop needs to run the entire `npm run dev` launcher. Backend environment files are created only if absent; inspect existing files and update their addresses and origins before proceeding. Existing shell variables take precedence over these files, so clear stale configuration or open a fresh terminal if behavior differs.

Keep each backend's secret on its own operator laptop. The provider and gateway tokens must be distinct and at least 16 characters. The generated 64-character tokens below meet that requirement. Preserve B's data key while retaining its database.

## Laptop A: provider and panel

In A's repository-root PowerShell terminal, with the address variables set:

```powershell
if (!(Test-Path -LiteralPath 'apps/provider/.env')) {
    $providerToken = node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"
    @(
        'HOST=0.0.0.0'
        'PORT=8001'
        "PROVIDER_ADMIN_TOKEN=$providerToken"
        "PROVIDER_CONSOLE_ORIGINS=http://${LaptopA}:8001,http://localhost:8001,http://127.0.0.1:8001"
    ) | Set-Content -LiteralPath 'apps/provider/.env' -Encoding ascii
}
$env:VITE_GATEWAY_URL = "http://${LaptopB}:8000"
$env:VITE_DASHBOARD_URL = "http://${LaptopB}:5173"
$env:VITE_SHOPFLOW_URL = "http://${LaptopC}:5174"
npm run build --workspace=@phoenix/console
npm run dev:provider
```

Keep this terminal running. Open `http://192.168.1.101:8001/provider`, replacing the example IP with A's actual IP, and enter `PROVIDER_ADMIN_TOKEN` from `apps/provider/.env` in the connection form. Express serves `apps/console/dist`; a separate Vite server is unnecessary on A. Port 8001 automatically selects provider mode and connects to the page's own origin.

Use A's `:8001` panel for this distributed demo. Do not add ShopFlow's origin to `PROVIDER_CONSOLE_ORIGINS`. The provider's public service routes reject browser requests carrying an `Origin` header; they are intended for the gateway's server-side requests. Admin routes additionally require the provider bearer token. CORS is not a replacement for authentication or firewall controls.

Rebuild the console and restart the provider after frontend changes. Keep all scenarios **normal** while B learns the initial baselines.

## Laptop B: MongoDB, gateway, and dashboard

Use three repository-root PowerShell terminals on B.

### Terminal 1: MongoDB

```powershell
npm run mongo:dev
```

This starts a real MongoDB binary on port 27017 with WiredTiger data in `.cache/mongo-data`. The first run downloads the binary unless `MONGOMS_SYSTEM_BINARY` selects an existing executable. Keep the terminal running. Alternatively run an existing MongoDB service on B and use its URI; do not start a second process on port 27017 or reuse a data directory with two processes. A and C do not need MongoDB.

If B already has Docker Desktop, this standalone, loopback-only MongoDB container is another option **instead of** `npm run mongo:dev`:

```powershell
docker run --name phoenix-lan-mongo --detach --publish 127.0.0.1:27017:27017 --mount type=volume,source=phoenix-lan-mongo,target=/data/db mongo:7
```

Wait for MongoDB to become ready before starting the gateway. Its named volume retains data; stop it with `docker stop phoenix-lan-mongo` and reuse it with `docker start phoenix-lan-mongo`. B's gateway URI below is the same for either option. This standalone container publishes MongoDB only to B's loopback interface; the full project Compose deployment later publishes no MongoDB port at all.

### Terminal 2: gateway

Set the address variables from the preparation section in this terminal, then:

```powershell
if (!(Test-Path -LiteralPath 'apps/gateway/.env')) {
    $gatewayToken = node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"
    $dataKey = node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"
    @(
        'HOST=0.0.0.0'
        'PORT=8000'
        'MONGODB_URI=mongodb://127.0.0.1:27017/api_phoenix'
        "PROVIDER_URL=http://${LaptopA}:8001"
        "GATEWAY_ADMIN_TOKEN=$gatewayToken"
        "GATEWAY_DATA_KEY=$dataKey"
        "DASHBOARD_ORIGINS=http://${LaptopB}:5173,http://localhost:5173,http://127.0.0.1:5173"
        "CLIENT_ORIGINS=http://${LaptopC}:5174,http://localhost:5174,http://127.0.0.1:5174"
        'UPSTREAM_TIMEOUT_MS=4000'
        'REPAIR_DELAY_MS=700'
        'OBSERVATION_TTL_DAYS=7'
    ) | Set-Content -LiteralPath 'apps/gateway/.env' -Encoding ascii
}
npm run dev:gateway
```

The gateway must connect to MongoDB before it begins listening. Set `GATEWAY_DATA_KEY` to a distinct stable secret; changing it prevents decryption of existing golden fixtures. The isolated server uses the gateway token as a fallback if this key is absent, so rotating the token without a separate data key has the same consequence. Keep the key with any database backup.

### Terminal 3: dashboard

Set `$LaptopB` in this terminal:

```powershell
$LaptopB = '192.168.1.102'
$LaptopC = '192.168.1.103'
$env:VITE_GATEWAY_URL = "http://${LaptopB}:8000"
$env:VITE_DASHBOARD_URL = "http://${LaptopB}:5173"
$env:VITE_SHOPFLOW_URL = "http://${LaptopC}:5174"
npm run dev:dashboard
```

Replace both example IPs with the actual addresses. The workspace script binds Vite to `0.0.0.0:5173`. Open `http://192.168.1.102:5173`, and configure the gateway URL as `http://192.168.1.102:8000`. Enter B's `GATEWAY_ADMIN_TOKEN` from `apps/gateway/.env`. If a prior URL is saved in the browser, update it in the connection form.

The same `DASHBOARD_ORIGINS` allowlist controls HTTP administration and Socket.IO. Origins must include the exact scheme, hostname/IP, and port used in the browser, with no path or trailing slash. If you use a hostname instead of an IP, add that hostname origin explicitly.

## Laptop C: ShopFlow

In C's repository-root PowerShell terminal:

```powershell
$LaptopB = '192.168.1.102'
$env:VITE_GATEWAY_URL = "http://${LaptopB}:8000"
npm run dev:client
```

Replace the IP with B's actual address. The script binds Vite to `0.0.0.0:5174`. Open `http://192.168.1.103:5174`, using C's actual IP. Check that ShopFlow's gateway URL points to B. ShopFlow receives no admin token and never needs A's URL.

`VITE_GATEWAY_URL` is a browser-facing public setting. A container service name, B's `127.0.0.1`, or A's provider URL is incorrect for C's browser. Restart Vite after changing its environment. For a durable frontend setting, put the public URL in that frontend's `.env.local`; shell values still take precedence. Never store secrets in Vite settings.

Use the explicit addresses in this guide to open each UI. The optional `VITE_DASHBOARD_URL` and `VITE_SHOPFLOW_URL` above configure console links across the three laptops. Set them before building A's static provider panel and before starting B's Vite server. Without overrides, those links derive the hostname from the current page and can point to the wrong machine.

## Windows firewall and connectivity

Permit only the required inbound TCP ports on a trusted Windows **Private** network: A needs 8001, B needs 8000 and 5173, and C needs 5174. MongoDB does not need an inbound LAN rule. If Windows has not already allowed Node.js, these optional commands require an Administrator PowerShell terminal on the corresponding laptop:

```powershell
# Run on A only.
New-NetFirewallRule -DisplayName 'API Phoenix provider' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8001 -Profile Private -RemoteAddress LocalSubnet
# Run on B only.
New-NetFirewallRule -DisplayName 'API Phoenix gateway and dashboard' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8000,5173 -Profile Private -RemoteAddress LocalSubnet
# Run on C only.
New-NetFirewallRule -DisplayName 'API Phoenix ShopFlow' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 5174 -Profile Private -RemoteAddress LocalSubnet
```

Do not disable the firewall. Confirm the network is trusted before selecting the Private profile. From B, verify A; from C, verify B, using the actual address variables:

```powershell
# From B:
Test-NetConnection -ComputerName $LaptopA -Port 8001
Invoke-RestMethod -Uri "http://${LaptopA}:8001/health"
# From C:
Test-NetConnection -ComputerName $LaptopB -Port 8000
Invoke-RestMethod -Uri "http://${LaptopB}:8000/health"
```

Both health endpoints should return `status: ok`; the gateway reports MongoDB persistence. PowerShell HTTP checks do not exercise browser CORS. If health succeeds but a UI fails, compare its address-bar origin with the configured allowlist and check the browser's Network panel. A 401 admin response means the token is missing or incorrect; a 403 origin response means the origin is disallowed.

## Demonstrate the four scenarios

1. Leave A's three services normal. Connect B's dashboard with the gateway token and use **Run probe**. Verify healthy baselines for all three services, then refresh ShopFlow on C.
2. On A, rename customer `name` to `display_name`. Refresh C to create real traffic. Watch B record drift, affected workflows, validation results, an active alias adapter, and a Repair Passport. Refresh C after deployment to see recovery.
3. Change shipping from `eta_days: 3` to `eta_hours: 72`. Observe the unit evidence and regression checks before conversion activates. Unknown unit changes are not automatically guessed.
4. Introduce pricing HTTP 429. Observe a bounded retry adapter for GET requests. It honors `Retry-After` when within the configured budget; a larger delay is not shortened to force a retry.
5. Introduce the semantic pricing change, 799 to 79,900. The unchanged schema does not make the price safe. Pricing returns HTTP 409 and checkout stays blocked. **Revalidate & approve** refuses an unverified price conversion; restore normal pricing on A, then refresh/probe to recover.

Proposal, validation, and deployment occur over seconds. Brief errors on C during this interval are expected. These are actual backend operations and HTTP requests, not success animations. Repair Passports contain recorded evidence and validation decisions.

To demonstrate rollback, select an active adapter on B and roll it back while its provider drift remains active. Its previous adapter is restored if one exists; the same drift is held from automatic redeployment. Use the incident's revalidation control deliberately if you want to redeploy after review, or restore the provider to normal.

For the automated four-scenario driver, use another terminal in B's repository root. Set both tokens to the existing values from the respective private backend environment files; do not generate replacement tokens for the driver:

```powershell
$LaptopA = '192.168.1.101'
$LaptopB = '192.168.1.102'
$env:PROVIDER_URL = "http://${LaptopA}:8001"
$env:GATEWAY_URL = "http://${LaptopB}:8000"
$env:PROVIDER_ADMIN_TOKEN = Read-Host 'Existing provider admin token from A'
$env:GATEWAY_ADMIN_TOKEN = Read-Host 'Existing gateway admin token from B'
npm run demo
```

Run this only when you want a fresh session: it resets the gateway's saved baselines, observations, incidents, adapters, and repair history before warmup. It drives the real backends, verifies the three repairs plus unsafe-price rejection, and restores provider scenarios to normal in cleanup. It leaves the newly recorded repair evidence available. Avoid changing scenarios manually while the driver runs.

## Docker on a LAN host

The root Compose file runs all five services on a single Docker host. It is an alternative to the native three-laptop arrangement above. Install Docker Desktop with Linux containers and Compose v2, then create stable root `.env` secrets as shown in [README.md](../README.md#docker-compose).

If the Docker host has address `192.168.1.102`, edit these **public settings** in root `.env`, replacing that example IP with its actual address:

```dotenv
VITE_GATEWAY_URL=http://192.168.1.102:8000
VITE_DASHBOARD_URL=http://192.168.1.102:5173
VITE_SHOPFLOW_URL=http://192.168.1.102:5174
PROVIDER_CONSOLE_ORIGINS=http://192.168.1.102:8001,http://localhost:8001,http://127.0.0.1:8001
DASHBOARD_ORIGINS=http://192.168.1.102:5173,http://localhost:5173,http://127.0.0.1:5173
CLIENT_ORIGINS=http://192.168.1.102:5174,http://localhost:5174,http://127.0.0.1:5174
```

The client origin here is the Docker host's 5174 origin because that host serves ShopFlow, even when a browser runs on another laptop. Keep gateway `PROVIDER_URL` at its Compose default `http://provider:8001` and MongoDB at `mongodb://mongo:27017/api_phoenix`. These server-side addresses are independent of the browser's LAN URL.

```powershell
docker compose config --quiet
docker compose up --build -d
docker compose ps
docker compose logs --tail 100 provider gateway
```

Use the Docker host's IP on ports 8001, 5173, and 5174 for the UIs. Set that host's firewall rules for all four published application ports (8000, 8001, 5173, 5174). MongoDB has no published port and is only on an internal network with the gateway. The MongoDB volume and root `.env` data key must be retained together. Root/service `.env` files are excluded from image build context; Compose supplies backend secrets at runtime. Frontend URLs are supplied explicitly as public build arguments and runtime variables.

## Troubleshooting and limits

| Symptom | Check |
| --- | --- |
| Cannot connect from another laptop | Actual IP, same network, Wi-Fi isolation, firewall Private profile, and backend `HOST=0.0.0.0` |
| Provider panel is missing | Build `@phoenix/console` on A; Express reads `apps/console/dist` |
| Gateway exits before listening | MongoDB availability/URI and gateway token length |
| UI cannot load despite healthy backend | Exact browser origin, saved connection URL, correct service token, and browser-facing `VITE_GATEWAY_URL` |
| Dashboard polls but has no live connection | Socket.IO origin and gateway token; inspect connection errors |
| First-run MongoDB setup fails | Binary download access and available port 27017; an existing MongoDB service is an alternative |
| Repair is blocked | Healthy baselines for all dependencies, live upstream responses, and recorded failed validation checks |
| Decryption fails after a restart | Original stable `GATEWAY_DATA_KEY` or local dev secret file must match the retained database |
| Rolled-back drift stays broken | Automatic redeployment is held; restore upstream health or explicitly revalidate |

Stop each service with Ctrl+C and keep the database files and its key. Tests use temporary MongoDB and real HTTP traffic; Playwright additionally needs installed browsers. Run those on an isolated local test setup with the default ports free, rather than interrupting the LAN demonstration.

This guide cannot establish that three physical laptops have been tested from this workspace. The demo uses one gateway process with in-process coordination, an independent simulated provider, and HTTP on a trusted LAN. It is not a clustered or hardened production deployment. Optional LLM integration needs a compatible endpoint and credentials and has not been tested without them.
