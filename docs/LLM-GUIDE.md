# API Phoenix: OpenAI setup and easy Hinglish explanation

API Phoenix now has an LLM drift analyst. It uses OpenAI Chat Completions with strict structured JSON output, independently validated by Zod. The default model is `gpt-4o-mini`; `LLM_MODEL` can select another compatible model available to your account. This adds explanations, restricted candidate review, English/Hinglish guidance, and operator recommendations. It does not turn the project into an unrestricted code-writing agent.

The code and simulated-completion tests are implemented. A real OpenAI response still requires your server-side API key, account access, and a gateway restart. Do not say a real model has been demonstrated until an incident records `status: completed` with your configured OpenAI model.

## 1. Enable OpenAI in easy steps

1. Create an API key using the [OpenAI API dashboard](https://platform.openai.com/api-keys). Use an account/project with API access and configure a suitable spending budget. Keep the key private.
2. Open `apps/gateway/.env` on the gateway computer. This file is ignored by Git. In this checkout a minimal file has been prepared; in a fresh clone, create it with the following LLM settings. Retain any existing service settings, tokens, and stable encryption key.
3. Replace only the blank key with your real key:

```dotenv
OPENAI_API_KEY=your-private-api-key
LLM_MODEL=gpt-4o-mini
LLM_ENABLED=true
LLM_TIMEOUT_MS=8000
```

The default endpoint is `https://api.openai.com/v1/chat/completions`. You do not need `LLM_URL` or `LLM_API_KEY` for normal OpenAI setup. If previously configured, those overrides take precedence; clear them if switching back to OpenAI.

Do not put the key in chat, screenshots, admin-token forms, `VITE_*` variables, React code, or committed files. The OpenAI key is different from both project admin tokens. The backend loads it; browsers never need it. Do not blindly copy the entire gateway `.env.example` over existing settings: its explicit MongoDB URI selects an already-running database instead of the launcher's managed MongoDB.

4. Restart the project, keeping the same database and encryption key. For a foreground launcher, Ctrl+C in its terminal, then from the repository root:

```powershell
# Only needed if this checkout's portable Node is not on PATH:
$env:PATH = "$((Resolve-Path '.tools/node-v22.20.0-win-x64').Path);$env:PATH"
npm.cmd run dev
```

If Codex previously started it as a hidden background process, ask Codex to restart the local panels after saving the key. Do not launch another copy on occupied ports. For LAN use, retain the LAN `HOST` and allowed-origin settings; see [LAN.md](LAN.md). Adding a key does not require a database reset.

5. Open the dashboard and choose **Settings → LLM drift analyst**. It should show **Configured** and initially **Ready — no model response tested yet**. This checks configuration, not connectivity or billing.
6. Keep the provider healthy and learn all three baselines with **Run probe** if they do not already exist.
7. Apply a new provider change, such as customer rename, then refresh ShopFlow or run a probe. Open **Drift incidents → incident → LLM analysis**. Look for **completed**, model name, English explanation, Easy Hinglish, recommendation, and suggested operator checks.
8. Inspect **Validation** and **Repairs & passports**. A model response is not proof of deployment: check the actual passport decision and executed tests.

Existing incident records and active repairs are not automatically resent to OpenAI. Repeating an already resolved scenario may not call the model. For an existing eligible proposal, **Revalidate & approve** requests a fresh model review and validation, but cannot authorize unsupported changes. A completely fresh gateway reset deletes demo history; only do that intentionally, after restoring the provider and letting jobs finish.

For Docker, put LLM settings in Compose's root `.env` or shell environment instead; the isolated gateway `.env` is not copied into the image. Apply with `docker compose up --build -d`. Do not share expanded Compose configuration containing secrets. Docker execution is not verified here.

## 2. What happens internally?

```text
Real provider response
        ↓
Rule-based detector compares baseline, schema, status and business rules
        ↓
Masked incident + evidence + impacted workflows + eligible candidate (or null)
        ↓
OpenAI structured analysis
        ↓
Zod validation + exact-candidate match / valid abstention
        ↓
Independent regression, live-probe and workflow checks
        ↓
Persist Repair Passport → activate adapter, or remain blocked
```

The gateway supplies the model with field structure, masked before/after responses, detector evidence, required client fields, impacted workflows, and the eligible deterministic adapter. It does not send admin tokens, API credentials, the fixture encryption key, or decrypted golden fixtures. Masking is field-based demo protection, not a guarantee that every arbitrary personal value is anonymized. Only send permitted demo data to an external model.

The structured response contains:

| Field | Meaning |
| --- | --- |
| `explanation` | Plain-English explanation of the observed change |
| `hinglishExplanation` | Easy Roman-Hindi/Hinglish explanation |
| `recommendedAction` | Apply candidate, manual review, or restore provider |
| `risk` | Model-reported low/high/unknown risk, not a calibrated safety guarantee |
| `adapter` | The exact evidenced candidate, or `null` to abstain |
| `verificationNotes` | Suggested operator checks, not executed tests |

The output schema limits the adapter to the supplied candidate or null. Server-side validation checks again, because structured JSON is not proof that a repair is correct.

## 3. Example: customer field rename

Healthy response has `name: "Rahul"`; the new response has `display_name: "Rahul"`. The actual response also contains unchanged identity, email, and membership fields.

The deterministic detector confirms exactly one missing and added field, identical observed value/type, and unchanged remaining fields. It supplies this candidate:

```json
{"type":"alias","source":"display_name","target":"name"}
```

The LLM may explain: "Field ka naam badla hai, value same hai. Client ko purana name field chahiye, isliye alias candidate relevant hai."

That is an illustrative explanation, not a recorded real-model response. If the model recommends the exact candidate with low reported risk, the gateway still checks old healthy fixtures, three live responses, business rules, affected workflows, and a final fresh deployment probe. After a passing passport is saved, future provider responses are translated for the client.

Provider code and client source code are not rewritten. The gateway restores compatibility at the boundary.

## 4. What if the model disagrees or fails?

| Result | Gateway behaviour |
| --- | --- |
| Valid exact candidate | Add LLM candidate review; all independent safety checks remain mandatory |
| Valid abstention / operator-review recommendation | Hold the candidate; do not auto-activate |
| Unsupported adapter, code, invalid JSON, oversized/incomplete output | Reject the output and visibly use deterministic validation fallback |
| Timeout, refusal, network failure, authentication/rate-limit error | Record unavailability and use deterministic validation fallback |
| Missing key or `LLM_ENABLED=false` | No model call; run the deterministic demo |
| Unsafe/unsupported provider change | Remain blocked regardless of model output or outage |

For unsafe pricing `799 → 79,900`, the model receives no eligible adapter. It can explain the risk and recommend review, but cannot divide the price by 100 or unblock checkout. Manual approval cannot bypass this restriction.

The default model timeout is 8 seconds, configurable from 50 to 30,000 ms. Each request has a 1,500 completion-token cap, a 32 KiB context limit, a 64 KiB response limit, and no automatic LLM retries. Repeated matching incidents are deduplicated rather than calling OpenAI on every ShopFlow poll. Explicit revalidation can call it again. These limits do not replace account-level cost controls or a production global rate limiter.

## 5. Where to show judges

- **Settings:** model, configuration, latest result; configured does not mean a successful request.
- **Drift incidents → LLM analysis:** explanation, Hinglish guidance, model recommendation, or explicit fallback reason.
- **Activity stream:** LLM analysis started/completed/fallback events.
- **Validation:** executed checks, plus LLM candidate review when a valid analysis exists.
- **Repair Passport:** recorded model analysis separately from deterministic evidence, tests, decision, and rollback.

## 6. Easy Hinglish questions and answers

**LLM kya hai?** Large Language Model: text ko analyze karke explanation aur recommendations dene wala AI model. Hamara default OpenAI GPT-4o mini hai, jo configuration se change ho sakta hai.

**AI exactly kya kar raha hai?** Masked drift evidence aur affected workflows dekhkar English/Hinglish explanation deta hai, allowed candidate ko corroborate karta hai ya human review recommend karta hai.

**Detection AI karta hai?** Primary detection abhi baseline comparison aur rules se hoti hai. LLM detected incident ko analyze karta hai; arbitrary new drift types ko automatically repair karna implemented nahi hai.

**AI repair deploy karta hai?** Directly nahi. Valid candidate review ke baad gateway independent tests chalata hai. Tests fail hon toh AI ke agree karne par bhi deployment nahi hoti. Valid AI abstention bhi deployment hold kar sakti hai.

**AI hallucinate kare toh?** Unknown code, extra fields, changed mapping ya unsafe conversion reject hoti hai. Fallback status visible hota hai; original safe deterministic process hi use hota hai.

**Internet/API fail ho toh?** Supported rule-based repairs validation ke saath work kar sakte hain. Unsupported drift blocked rehti hai. System fake AI explanation nahi dikhata.

**Kya hum model train kar rahe hain?** Nahi. Hum existing model ko inference request bhejte hain. Baseline storage training ya fine-tuning nahi hai; embeddings/vector database/RAG pipeline bhi implemented nahi hai.

**LLM project ko kya extra deta hai?** Operators ko change aur workflow risk samajhne mein help, Hinglish explanations, suggested next actions, additional candidate review, aur inspectable model evidence. Repair coverage aur accuracy automatically improve hone ka measured claim nahi hai.

**Judge-ready answer:** "API Phoenix combines deterministic drift detection with an OpenAI LLM analyst. The model explains incidents and reviews restricted repair candidates; the gateway independently validates them before activation. Unsafe changes stay blocked, and every model result, fallback, and repair decision is inspectable."

## 7. Verification and troubleshooting

Run `npm.cmd test` for backend tests and `npm.cmd run test:llm-ui` for isolated UI fixture tests on port 5183. For installed Chrome, set `$env:PLAYWRIGHT_CHANNEL = 'chrome'` first. These tests use simulated completions and do not make paid OpenAI calls or prove real-model accuracy. See [VERIFIED.md](VERIFIED.md).

- **not configured:** save a nonblank server-side key, check `LLM_ENABLED`, then restart the gateway.
- **http 401:** check the key/project and any old endpoint/key overrides; never share the key while troubleshooting.
- **http 429:** check account rate/quota/billing limits; deterministic fallback remains visible.
- **http 400:** verify model access and support for the configured structured-output request. The app intentionally does not silently retry with a looser output format.
- **timeout:** check network access; cautiously adjust `LLM_TIMEOUT_MS` if necessary.
- **completed but blocked:** check valid abstention, regression failures, workflow failures, and the final deployment probe.
- **no LLM status field:** the gateway may still run its older code; restart it after updating.

Implementation follows the [official OpenAI Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=chat), [Chat Completions reference](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create), and [GPT-4o mini model documentation](https://developers.openai.com/api/docs/models/gpt-4o-mini). Structured output constrains format; application evidence and validation remain the safety authority.
