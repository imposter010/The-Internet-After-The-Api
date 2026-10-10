# API Phoenix: Groq LLM setup and easy Hinglish guide

API Phoenix is already configured for Groq's free-plan API and the `openai/gpt-oss-20b` model. The model supports strict JSON output. For the normal local demo, no endpoint or model setting is needed: paste one private API key and restart.

## One setting only

1. Create a key at [Groq API Keys](https://console.groq.com/keys).
2. Open `apps/gateway/.env`.
3. Paste the key after `=`:

```dotenv
GROQ_API_KEY=your-private-groq-key
```

4. Save the file and restart from the repository root:

```powershell
npm.cmd run dev
```

The `.env` file is ignored by Git. Never put this key in chat, screenshots, React code, an admin-token box, or any `VITE_*` setting. The key stays on the gateway server.

The built-in defaults are:

```text
Endpoint: https://api.groq.com/openai/v1/chat/completions
Model:    openai/gpt-oss-20b
Timeout:  8000 ms
```

Groq documents this chat endpoint in its [API reference](https://console.groq.com/docs/api-reference) and lists `openai/gpt-oss-20b` as supporting strict structured output in its [Structured Outputs guide](https://console.groq.com/docs/structured-outputs).

## System kaise kaam karta hai

```text
Purana healthy API response save hota hai
                ↓
Naya response purane response se compare hota hai
                ↓
Rules exact evidence aur possible safe fix nikalte hain
                ↓
Masked information LLM ko jaati hai
                ↓
LLM: minor/major + kya badla + kya effect hoga
                ↓
Minor: exact allowed fix ho toh safety tests
Major: automatic fix nahi; manual accept/reject
                ↓
Har result Repair Passport mein save hota hai
```

### Minor change

Example: `name` hata aur `display_name` aaya, value aur baaki fields same hain.

- Comparison rules exact equality check karte hain.
- LLM ise minor bol sakta hai aur sirf diye gaye alias fix ko approve kar sakta hai.
- Gateway old examples, three live requests, business rules, dependent workflows, aur final request test karta hai.
- Sab pass hua toh provider ka `display_name` ShopFlow ko `name` ban kar milta hai.
- LLM koi naya JavaScript code nahi likhta aur tests skip nahi kar sakta.

### Major change

Example: price `799` se `79,900` ho gaya, email gayab ho gayi, ya field ka meaning clear nahi hai.

- LLM dashboard par **What changed**, **Possible effects**, English explanation aur easy Hinglish dikhata hai.
- Automatic adapter nahi lagta.
- Operator **Accept for manual work** ya **Reject provider change** choose kar sakta hai.
- Accept ka matlab risk ko chupana ya broken traffic allow karna nahi hai. Iska matlab team manual code/contract work karegi; traffic blocked rehta hai.
- Reject ka matlab provider se old contract restore karvana hai.
- Decision incident aur Repair Passport mein save hota hai.

## Dashboard mein kya dekhna hai

- **Settings → LLM drift analyst:** `Configured`, provider `groq`, model `openai/gpt-oss-20b`.
- **Drift incidents → LLM analysis:** minor/major, changes, effects, Hinglish explanation and recommendation.
- **Validation:** actually chale hue safety checks.
- **Repairs & passports:** final deployment and operator decision.
- **Activity:** model start/completion/fallback and manual review events.

`Configured` sirf key milne ka signal hai. Real connection tab prove hota hai jab a new incident shows `status: completed`.

## Safety and fallback

- Model ko masked incident data milta hai; admin tokens, API key aur encryption key nahi jaate.
- Model sirf detector ka exact allowlisted candidate return kar sakta hai, ya mana kar sakta hai.
- Model output Zod aur exact-value checks se dobara validate hota hai.
- Invalid output, timeout, rate limit or outage clearly recorded hota hai.
- Supported minor repairs deterministic safety checks ke fallback se continue kar sakte hain.
- Unsupported or major changes always blocked rehte hain; model failure unhe safe nahi banata.
- Generated code kabhi execute nahi hota.

OpenAI API use karna ho toh advanced override ab bhi supported hai: `OPENAI_API_KEY` set karo; without a Groq key or explicit `LLM_URL`, gateway OpenAI endpoint and `gpt-4o-mini` choose karega. OpenAI-compatible custom service ke liye `LLM_URL`, `LLM_MODEL`, and `LLM_API_KEY` use karo. Normal Groq setup mein inki zaroorat nahi hai.

## Quick troubleshooting

- **Not configured:** `GROQ_API_KEY=` ke baad key blank hai, ya restart nahi hua.
- **HTTP 401:** key invalid/revoked hai.
- **HTTP 429:** free quota/rate limit hit hui.
- **HTTP 400:** configured model/request support check karo.
- **Timeout:** internet/provider slow ya unavailable hai.
- **Completed but blocked:** model ne manual review bola ya gateway safety test fail hua.

Tests simulated model responses use karte hain; real Groq quality/connectivity API key ke baad hi verify hogi:

```powershell
npm.cmd test
npm.cmd run build
```
