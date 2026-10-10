# API Phoenix: Simple Guide and Judge Questions

## The idea in one sentence

API Phoenix watches API responses, repairs supported changes only after validation, and blocks unsafe changes before they can be used for checkout.

An API lets one application request information from another. API drift means its response changes unexpectedly: a field is renamed, a unit changes, or its behavior changes.

## The three interfaces

| Interface | Role | Local address |
| --- | --- | --- |
| Provider console | Represents the external provider; lets us introduce API changes | http://localhost:8001/provider |
| Phoenix dashboard | Shows observations, incidents, affected workflows, validation, and repair records | http://localhost:5173 |
| ShopFlow | Represents the customer application; shows profile, pricing, delivery, and checkout preview | http://localhost:5174 |

For another LAN device, replace `localhost` with the host computer's current LAN IP. The gateway backend runs on port 8000. MongoDB stores the evidence and history; it is not another website.

The stack is MongoDB, Express, React, and Node.js (MERN). Socket.IO supplies dashboard updates.

## How a request works

```text
ShopFlow -> Phoenix gateway -> Provider APIs
```

Responses return through the gateway. ShopFlow does not call the provider directly.

1. **Learn:** Healthy requests establish known-good examples and expected response structure.
2. **Observe:** The gateway records actual upstream HTTP responses, status codes, and latency.
3. **Detect:** It compares new responses against the baseline and configured business checks.
4. **Analyze impact:** Declared dependencies identify affected features, such as checkout.
5. **Propose:** For supported changes, it proposes a restricted compatibility adapter: a small translation rule, not arbitrary generated code.
6. **Validate:** It checks saved examples, fresh provider responses, business constraints, and affected workflows.
7. **Decide:** It records the decision, then activates a verified adapter or blocks an unsupported or unsafe change.

The provider does not send a special notification about the change. Detection requires request traffic, supplied by ShopFlow or the dashboard's Run probe button.

## Four examples to explain

| Change | Decision | Simple explanation |
| --- | --- | --- |
| `name` becomes `display_name` | Validate a field alias | Restore the field expected by ShopFlow when the observed evidence supports equivalence |
| 3 delivery days become 72 hours | Validate hours-to-days conversion | Preserve the demonstrated delivery duration |
| Pricing sometimes returns HTTP 429 | Validate bounded GET retries | Respect the provider's retry delay without retrying forever |
| Price jumps from 799 to 79,900 | Block response and checkout | Do not guess whether this is a unit conversion or an actual new price |

Other supported demonstrations include a delivery-field alias and normalization of the specific single-item pagination response. Missing required data, incompatible types, malformed responses, and unexplained membership changes are not silently repaired.

## Where to find the evidence

- **Overview:** Service health, request observations, latency, drifts, repairs, and safety blocks.
- **Dependency map:** Declared links between APIs and customer profile, pricing, delivery, and checkout.
- **Drift incidents:** Before/after behavior, evidence, repair proposal, and validation results.
- **Repairs & passports:** Adapter definitions, decision records, Export JSON, and rollback controls.
- **Observations:** Recorded responses and learned baselines.
- **Activity stream:** The sequence of observation, detection, validation, deployment, and recovery events.
- **Settings:** Gateway connection and an explicitly confirmed reset that deletes gateway history.

ShopFlow polls every three seconds. It can display last-good data marked stale, but checkout requires healthy dependencies and fresh server-side validation. Checkout is a preview only: no order or payment is processed.

## A short demonstration order

1. Connect both admin panels before presenting; keep tokens off the projector.
2. Restore healthy provider behavior and run a probe to establish all three baselines.
3. Show healthy ShopFlow and its checkout preview.
4. Apply Rename customer field, run a probe, and show its incident, validation, passport, and recovery.
5. Demonstrate Convert delivery units and Introduce HTTP 429, restoring normal behavior between experiments.
6. Demonstrate Undocumented price magnitude and show checkout being blocked.
7. Restore normal behavior and end with a healthy application.

Previous adapters survive a restart and can make repeated demonstrations recover immediately. For a fresh session, restore normal behavior, wait for operations to finish, and reset the gateway only if the old history is no longer needed. Then learn healthy baselines again.

## 10 likely judge questions and answers

### 1. What problem does API Phoenix solve?

Applications can break when an external API changes unexpectedly. Phoenix detects those changes, restores compatibility for supported and validated cases, and prevents unsafe responses from being used for checkout. The goal is less manual recovery without blindly trusting changed data.

### 2. How does it discover a change?

It learns healthy examples from real requests. Later requests are checked against those examples, response contracts, and configured business rules. The provider does not notify Phoenix; requests passing through the gateway reveal the change.

### 3. Does it change the provider or rewrite the customer application?

No. The provider can remain changed, and ShopFlow continues expecting its original contract. Phoenix applies a validated compatibility adapter at the gateway boundary. The demonstrated adapters are field aliases, an evidenced hours-to-days conversion, specific single-item response normalization, and bounded GET retries.

### 4. Why not automatically divide the unexpected price by 100?

Because the gateway cannot prove that the price is expressed in a different unit. It could be a genuine new price or an upstream mistake. Guessing could create an incorrect transaction, so the system blocks checkout until healthy behavior is restored or a supported, trusted contract is implemented.

### 5. How do you check that a repair is safe?

A repair must pass a restricted-definition check, replay of encrypted known-good examples, three fresh provider probes, semantic and business checks, affected workflow replay, and a final deployment probe. Its passport is persisted before activation. These checks support the demonstrated transformations, not a guarantee for arbitrary API changes.

### 6. Does the project use AI?

The demonstrated mode is deterministic: rules and observed evidence drive repair decisions. An optional LLM can assist with explaining an existing allowed candidate, but that integration has not been verified against an external endpoint. The gateway does not execute model-generated JavaScript or trust it to override safety checks.

### 7. Is this a real working system or just a simulated animation?

The external provider is deliberately simulated, but it runs an actual HTTP server. The gateway makes real requests, MongoDB persists evidence, and the React screens use live backend data. Recorded local verification includes 31 backend/safety tests, two browser tests, and the four-scenario HTTP demonstration. See VERIFIED.md for the test record and limits.

### 8. What is a Repair Passport, and can a repair be undone?

A passport records the old and new behavior, affected workflows, proposal, evidence, tests, decision, and rollback information. Operators can inspect and export it. An active adapter can be rolled back; the same repair is held from automatic redeployment until explicitly revalidated. Approval cannot bypass missing evidence.

### 9. How is sensitive information protected?

The provider and gateway use separate admin tokens. Common sensitive fields are masked in observations, known-good fixtures are encrypted with AES-256-GCM, and browser origins are restricted. The LAN database stays local to the host. These are demo safeguards, not complete production security or a guarantee that every possible sensitive field is anonymized.

### 10. What are the limitations and next steps?

This is a development prototype with one gateway process and a simulated provider. It cannot repair every change, does not process orders or payments, and has not been verified as a physical three-laptop deployment or running Docker deployment. Production work would include HTTPS, stronger authentication and database controls, broader provider-specific policies, and distributed job coordination.

## A closing statement to practice

"API Phoenix sits between an application and its API provider. It learns healthy behavior, detects unexpected changes, checks which features are affected, and validates compatibility repairs before activation. When the evidence is insufficient, it blocks unsafe behavior instead of guessing. Every decision has an inspectable record."
