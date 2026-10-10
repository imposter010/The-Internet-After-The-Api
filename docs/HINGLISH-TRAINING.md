# API Phoenix: Zero se Advanced Hinglish Training

Yeh guide un team members ke liye hai jinhe project ya coding ki pehle se knowledge nahi hai. Answers ko word-for-word ratne ke bajaye examples samjho. Har answer ko 20-40 seconds mein apne words mein explain karne ki practice karo.

## Project ki ek line

API Phoenix application aur API provider ke beech ka gateway hai. Yeh unexpected API changes detect karta hai, supported repairs ko test karke activate karta hai, aur unsafe changes par checkout block karta hai.

## Level 1: Bilkul basic concepts — Questions 1-10

### 1. API Phoenix kya hai?

API Phoenix ek development prototype hai jo API ke unexpected changes ko handle karta hai. Jahan supported repair ko verify kar sakta hai, wahan compatibility restore karta hai. Jahan evidence insufficient hai, wahan unsafe response ko checkout mein use hone se rokta hai.

### 2. API kya hoti hai?

API ka full form Application Programming Interface hai. Yeh do software systems ke beech information exchange karne ka defined tareeka hai. Maan lo shopping app ko product ka price chahiye: app pricing API ko request bhejti hai aur API price ka response deti hai.

### 3. Request aur response kya hote hain?

Request matlab information maangna; response matlab us request ka jawab. ShopFlow pricing maangta hai, gateway provider se price leta hai, aur checked result ShopFlow ko wapas deta hai.

### 4. JSON kya hota hai?

JSON ka full form JavaScript Object Notation hai; yeh information likhne ka structured text format hai. Example: {"name":"Rahul","amount":799}. Yahan 'name' aur 'amount' fields hain; 'Rahul' aur 799 unki values hain. Field ka naam aur value ka type application ke liye important ho sakte hain.

### 5. Frontend aur backend mein kya difference hai?

Frontend woh screen hai jo browser mein dikhti hai: buttons, cards, aur forms. Backend server-side logic hai jo requests process karta hai, provider se baat karta hai, validation chalata hai, aur database access karta hai.

### 6. API provider kya hota hai?

Provider woh service hai jo data supply karti hai. Is demo mein customer, pricing, aur shipping data provider server deta hai. Yeh simulated vendor hai, lekin actual HTTP server aur actual responses use karta hai.

### 7. Client application kya hai?

Client woh application hai jo API data use karti hai. Yahan ShopFlow client hai: customer details, price, delivery estimate, aur checkout preview dikhata hai. ShopFlow provider ko directly call nahi karta.

### 8. Gateway kya hota hai?

Gateway application aur provider ke beech ka server hai. Yahan ShopFlow ki request pehle Phoenix gateway par aati hai. Gateway provider ka response observe aur check karta hai; verified adapter ho toh apply karke result deta hai.

### 9. API drift kya hai?

API drift matlab API ki pehle wali behavior mein unexpected change. Example: 'name' ka 'display_name' hona, delivery days ka hours mein aana, ya healthy API ka HTTP 429 dena. Drift structure, meaning, ya HTTP behavior mein ho sakta hai.

### 10. API contract kya hota hai?

API contract expected data ki requirements hain: kaunsi fields chahiye, unka type kya ho, aur acceptable values kya hon. Example: price numeric hona chahiye, currency INR honi chahiye, aur customer ke required fields present hone chahiye.

## Level 2: Interfaces aur project ke parts — Questions 11-20

### 11. Project mein teen panels kyun hain?

Har panel alag viewpoint dikhata hai: Provider console mein API changes introduce karte hain, Phoenix dashboard mein monitoring aur repair evidence dekhte hain, aur ShopFlow mein customer experience dekhte hain.

### 12. Provider console mein hum kya karte hain?

API Change Lab mein customer, pricing, ya shipping endpoint choose karte hain. Normal values edit karke live response dynamic dikhaya ja sakta hai. Scenario dropdown mein minor aur major changes grouped hain. 'Apply scenario' karne par backend runtime behavior badalta hai, next-response JSON update hota hai, aur actual gateway requests activity table mein aati hain. Gateway ko direct change notification nahi milta; change tab detect hota hai jab real request aati hai.

### 13. Phoenix dashboard kya dikhata hai?

Service health, response latency, observations, drift incidents, affected workflows, repair proposals, tests, aur passports. 'Activity stream' event sequence dikhata hai. 'Run probe' actual requests bhejta hai; 'Refresh' latest dashboard state load karta hai.

### 14. ShopFlow kya dikhata hai?

Customer profile, product pricing, shipping estimate, service status, aur checkout preview. Har teen seconds APIs check karta hai. Koi required API unhealthy ho toh last-good data stale mark ho sakta hai, lekin checkout allowed nahi hota.

### 15. Customer API ka role kya hai?

Customer ki identity, name, email, aur membership tier supply karna. Demo endpoint '/api/customer/rahul' hai. Customer profile aur checkout is information par depend karte hain.

### 16. Pricing API ka role kya hai?

Product name, amount, currency, unit, aur tax percentage supply karna. Demo endpoint '/api/pricing/phoenix-pro' hai. Healthy demo price 799 INR hai, tax se pehle.

### 17. Shipping API ka role kya hai?

Carrier, delivery duration, destination, aur order identity supply karna. Demo endpoint '/api/shipping/phoenix-pro' hai. Healthy demo estimate 3 days hai.

### 18. Workflow dependency kya hoti hai?

Dependency ka matlab ek feature ko kis API ki zaroorat hai. Customer profile ko customer API chahiye; checkout ko customer, pricing, aur shipping teeno chahiye. Graph ki dependencies project mein declared hain; automatically har software dependency discover nahi hoti.

### 19. Baseline kya hai?

Baseline known-good behavior ka reference hai. Gateway healthy response ka example aur structure save karta hai. Baad mein new response ko us reference se compare karta hai. Baseline seekhne se pehle provider ko original healthy behavior par rakhna important hai.

### 20. Observation aur incident mein kya difference hai?

Observation ek actual upstream request-response ka record hai: response, HTTP status, aur latency. Incident unexpected change ka record hai. Har normal observation incident nahi banti; change detect hone par incident record hota hai.

## Level 3: Actual working aur demonstrations — Questions 21-30

### 21. Pura system step-by-step kaise chalta hai?

ShopFlow gateway ko request bhejta hai; gateway provider ko actual HTTP request bhejta hai. Response record aur compare hota hai. Supported drift par proposal aur validation hoti hai; passing repair activate hota hai. Unsafe ya unsupported change par error/block milta hai. Evidence MongoDB mein save hota hai.

~~~text
ShopFlow -> Phoenix gateway -> Provider APIs
                 |
                 -> MongoDB: observations aur repair history
~~~

Response provider se gateway ke through ShopFlow ko wapas aata hai.

### 22. Provider change hote hi gateway ko kaise pata chalta hai?

Provider change announce nahi karta. Agli request jab changed response laati hai, gateway comparison se detect karta hai. ShopFlow ki polling ya dashboard ka probe traffic provide karte hain. Bina requests ke naya change immediately discover nahi hoga.

### 23. Run probe button exactly kya karta hai?

Customer, pricing, aur shipping ko teen rounds mein request karta hai: total 9 gateway reads. Healthy provider par yeh baseline examples collect karne mein helpful hai. Retry ya repair validation chale toh additional upstream requests bhi ho sakti hain.

### 24. Demo se pehle healthy baselines kyun chahiye?

System ko pata hona chahiye ki known-good behavior kya tha. Basic contract checks baseline ke bina bhi possible hain, lekin rename ya meaning change compare karne ke liye healthy reference important hai. Pehle healthy provider par probe chalao, phir drift introduce karo.

### 25. Customer field rename kaise repair hota hai?

Provider 'name' ki jagah 'display_name' bhejta hai. Detector check karta hai ki observed value aur type match karein aur baaki fields unchanged hon. Phir field-alias proposal validate hota hai. Passing adapter gateway par 'display_name' ko 'name' mein map karta hai.

### 26. Shipping units kaise repair hote hain?

Provider 'eta_days: 3' ki jagah 'eta_hours: 72' deta hai. Is specific supported case mein 72 / 24 = 3 aur baaki behavior match hota hai. Fresh probes aur workflow checks pass hone par hours-to-days adapter activate hota hai. Har possible unit conversion supported nahi hai.

### 27. HTTP 429 kya hai, aur Phoenix kya karta hai?

429 rate limiting ka status hai: provider temporarily request limit kar raha hai. Phoenix GET-only bounded retry proposal validate karta hai. Policy at most 3 attempts allow karti hai aur Retry-After respect karti hai; allowed delay se zyada ho toh early retry nahi karta.

### 28. Price 799 se 79,900 hone par kya hota hai?

Price ke fields aur types same ho sakte hain, lekin meaning suspicious hai. Gateway verified unit evidence ke bina 100 se divide nahi karta. Response HTTP 409 se block hota hai aur checkout hold hota hai.

### 29. Email missing ho ya field type badal jaaye toh kya hoga?

Yeh demo required missing field invent nahi karta aur incompatible type ko silently guess karke convert nahi karta. Drift record hota hai aur client compatibility block hoti hai. Healthy provider behavior restore karo aur fresh requests bhejo.

### 30. Last-good data aur checkout preview ka matlab kya hai?

Last-good data pehle ka successful response hai. ShopFlow failure ke time ise stale label ke saath dikha sakta hai, lekin stale data se checkout nahi karta. Preview ke liye server teeno APIs dobara check karta hai. Real payment ya order create nahi hota.

## Level 4: Technology aur development — Questions 31-40

### 31. MERN kya hai?

MERN ke four parts hain: MongoDB data store karta hai, Express HTTP routes aur backend middleware handle karta hai, React browser interfaces banata hai, aur Node.js JavaScript backend run karta hai. Is project ke core parts inhi technologies par hain.

### 32. Is project mein JavaScript stack helpful kyun hai?

Frontend aur backend dono JavaScript use karte hain, jisse shared definitions ek common package mein rakh sakte hain. JSON-based APIs aur live interfaces ke liye yeh practical prototype stack hai. Iska matlab automatic production scalability ya fastest performance proven hona nahi hai.

Supporting tools mein Vite frontend development/build ke liye, Tailwind CSS styling ke liye, aur React Flow dependency diagram ke liye use hote hain.

### 33. Code mein main parts kahan hain?

'apps/provider' upstream server hai; 'apps/gateway' detection, validation, aur repair logic hai; 'apps/console' dashboard/provider UI hai; 'apps/shopflow' customer UI hai. 'packages/shared' contracts aur shared definitions rakhta hai; 'tests' verification suites rakhta hai.

### 34. Ports kya hain, aur kaunsa port kis ka hai?

Ek computer par different services ko reach karne ke liye ports use hote hain. Provider 8001, gateway 8000, dashboard 5173, aur ShopFlow 5174 par hain. Local managed MongoDB 27017 par hai aur loopback par private rakha gaya hai. Gateway URL panel URL se alag hai.

### 35. Important HTTP status codes ka meaning kya hai?

200 success; 401 invalid/missing authentication; 403 forbidden request/origin; 409 conflict ya blocked checkout; 422 unverified repair approval; 429 rate limit. 502/503 upstream failure ya service unavailability represent kar sakte hain. Har 200 response business-wise safe ho, zaroori nahi.

### 36. Socket.IO kya karta hai? Kya ShopFlow bhi wahi use karta hai?

Socket.IO gateway events aur live dashboard synchronization ke liye use hota hai. ShopFlow service checks ke liye normal HTTP requests har 3 seconds bhejta hai. Dashboard ka live feed aur ShopFlow ka polling alag mechanisms hain.

### 37. Zod kya karta hai?

Zod data-validation library hai. Is project mein expected fields, types, aur allowed adapter definitions check karta hai. Yeh AI model nahi hai aur khud arbitrary repair code generate nahi karta. Business meaning ke checks Zod se alag bhi hote hain.

### 38. Mongoose ka role kya hai?

Mongoose Node.js aur MongoDB ke beech data models aur queries manage karta hai. Baselines, observations, incidents, adapters, validations, passports, aur events ke models defined hain. Yeh frontend rendering nahi karta.

### 39. MongoDB mein kya save hota hai?

Service state, healthy baselines, masked observations, incidents, proposals, adapters, validation results, passports, aur events save hote hain. Raw known-good fixtures encrypted form mein save hoti hain. History persistent hai, lekin reset aur configured retention policies records remove kar sakti hain.

### 40. LAN par panels kaise access hote hain?

Doosre device par 'localhost' us device ko refer karega, host PC ko nahi. Host ka actual LAN IP aur panel port use karo; gateway connection mein host IP ke saath 8000 use karo. Same network, matching browser origins, server binding, aur firewall permissions zaroori hain. Physical three-laptop setup separately test karna hoga.

## Level 5: Safety, evidence, aur testing — Questions 41-50

### 41. Compatibility adapter kya hai?

Adapter ek restricted translation ya retry rule hai. Example: renamed field ko expected field mein map karna. Yeh provider ka code edit nahi karta. Adapter ka allowed format validate hota hai aur verified passport ke bina active repair use nahi hota.

### 42. Repair activate hone se pehle kaunse checks hote hain?

Allowed adapter definition, saved known-good fixtures replay, 3 fresh provider probes, semantic/business checks, affected workflow replay, aur final deployment probe. Required checks pass hone par evidence save hota hai, phir activation hoti hai. Koi check fail ho toh proposal active nahi hota.

### 43. Golden fixture kya hai?

Golden fixture ek saved known-good response example hai. Repair ko is par replay karke check karte hain ki already healthy response damage na ho. Raw fixtures AES-256-GCM se encrypted hain aur admin snapshot mein encrypted fixture fields expose nahi hoti.

### 44. Structural aur semantic drift mein difference kya hai?

Structural drift response ki shape/type badalta hai, jaise field missing hona. Semantic drift mein shape same reh sakti hai, lekin meaning badal sakta hai, jaise unexplained 100-times price. Sirf JSON valid hona business correctness ka proof nahi hai.

### 45. Sirf changed API ko test karna enough kyun nahi?

Ek API multiple features ko affect kar sakti hai. Shipping repair sahi lage, lekin pricing unavailable ho toh checkout still unsafe hoga. Isliye validation declared affected workflows aur unki other API dependencies ko fresh data ke saath check karti hai.

### 46. Repair Passport kya hai?

Passport repair decision ki report hai: before/after behavior, impact, proposal, evidence, tests, decision, aur rollback details. Dashboard mein inspect aur Export JSON kar sakte hain. Blocked decisions ka record bhi banta hai; passport sirf successful repair ke liye nahi hai.

### 47. Revalidate & approve safety rules bypass kar sakta hai?

Nahi. Yeh eligible proposal ki fresh validation request karta hai. Unverified price semantics ya missing proposal ko operator approval magically safe nahi banata. Unsafe case mein UI approval disabled ho sakti hai ya backend request reject karta hai.

### 48. Rollback kya hai?

Rollback active adapter hata kar previous adapter restore karta hai, agar previous available ho. Provider abhi bhi changed ho toh client dobara fail ho sakta hai. Same rolled-back policy automatically redeploy nahi hoti; explicit revalidation ke through eligible repair review kar sakte hain.

### 49. Security aur privacy kaise handle hoti hai?

Provider aur gateway ke separate admin tokens hain; browser admin tokens session storage mein rehte hain. Common sensitive fields masked hain, golden fixtures encrypted hain, aur origins restricted hain. Yeh demo safeguards hain: arbitrary PII anonymization, production authentication, TLS, aur full database access controls ka complete solution nahi.

### 50. Testing hui hai? Proof kya hai?

Latest local verification mein 73 backend/safety tests pass hue. Redesigned dynamic provider ka full desktop Chrome flow bhi pass hua; pehle ke mobile test aur 3 isolated LLM dashboard fixture tests alag record mein hain. Backend integration actual HTTP aur actual MongoDB use karti hai. Automated LLM completions repeatable testing ke liye simulated hain. Configured Groq model ke live checks mein minor change auto-repair aur major change manual review dono verify hue. Detailed record VERIFIED.md mein hai. Yeh production reliability ya har physical network setup ka proof nahi hai.

## Level 6: Advanced judge questions — Questions 51-60

### 51. Kya yeh AI-based system hai?

Primary detection rules aur observed comparison se hoti hai. Groq key configure karne par LLM masked incident ko minor/major classify karta hai, exact changes aur effects dikhata hai, English/Hinglish explanation deta hai, aur exact allowed candidate ko support ya manual review recommend karta hai. Minor fix ko independent tests pass karne padte hain. Major change par accept-for-manual-work/reject decision record hota hai, lekin unsafe adapter deploy nahi hota. Invalid output/outage mein explicit deterministic fallback hota hai; generated JavaScript execute nahi hota. Repeatable automated tests simulated completions use karte hain, aur configured Groq model ka live connection bhi separately verify hua hai. Setup ke liye [LLM-GUIDE.md](LLM-GUIDE.md) dekho.

### 52. Project ka distinctive contribution kya hai?

Is prototype mein observation, declared impact analysis, restricted repair proposal, regression validation, decision evidence, aur rollback ek workflow mein combined hain. Judges ko actual incident se passport aur recovered/blocked client tak trace dikha sakte hain. World-first ya universally unique hone ka claim hum nahi karte.

### 53. Provider HTTP 200 de raha ho, phir bhi gateway block kyun karega?

200 sirf HTTP request successfully serve hone ka signal hai. Price 799 se 79,900 ka response 200 aur valid JSON ho sakta hai, lekin configured business checks fail ho sakte hain. Gateway meaning check karke is unsafe response ko 409 se reject kar sakta hai.

### 54. Retry sirf GET ke liye kyun hai?

GET data read karne ke liye hai; POST jaise operations payment ya order create kar sakte hain. Unki blind retry duplicate action ka risk la sakti hai. Is prototype ki automatic retry policy upstream GET tak limited hai; payment retry ya idempotency system implemented nahi hai.

### 55. Ek saath requests/repairs aayein toh conflict kaise handle hota hai?

Gateway same endpoint ke operations ko in-process serialization se manage karta hai aur duplicate local repair jobs guard karta hai. MongoDB ka unique partial index ek endpoint par ek active adapter enforce karta hai. Yeh multi-gateway distributed coordination ka complete solution nahi hai.

### 56. Database unavailable ho ya passport save na ho toh?

Regular gateway data routes unavailable database par safe response claim nahi karte. Repair evidence persist hona activation ka requirement hai; passport save failure par naya adapter activate nahi hona chahiye. Is behavior ke tests hain, lekin full crash-atomic deployment transaction ka claim nahi karte.

### 57. Restart ke baad kya hota hai?

Same persistent database aur stable encryption key use karne par baselines, incidents, aur adapters retained rehte hain. Supported detecting/validating incidents startup par inspect karke pending proposals ki validation resume kar sakte hain. Sirf purana proposal hone se unchecked deployment nahi hoti.

### 58. Kya yeh production-ready aur highly scalable hai?

Abhi development prototype hai, single gateway process ke saath. Production ke liye stronger auth, HTTPS, database controls, distributed jobs/locks, deployment recovery, load testing, aur broader policies chahiye. Docker files aur three-laptop instructions available hain, lekin un deployments ki full execution verification pending hai.

### 59. Iski practical value kya hai, aur kaun use kar sakta hai?

Future integrations mein external API-dependent applications ke liye compatibility recovery aur safety review ka starting point ho sakta hai. E-commerce jaise examples mein customer, price, aur delivery data important hain. Current vendor endpoints fixed demo endpoints hain; real vendors ya arbitrary APIs plug-and-play supported nahi hain.

### 60. Next development steps kya honge?

Trusted provider-specific contracts, more carefully validated transformations, stronger security, distributed coordination, aur realistic load/failure testing. New domain integrations ko separate evidence aur tests chahiye. Inhe roadmap bolo, implemented features nahi.

## Judges ke saamne 30-second introduction

API Phoenix application aur API provider ke beech ka gateway hai. API unexpectedly change ho toh application break ho sakti hai. Yeh project healthy behavior observe karke changes detect karta hai, affected workflows identify karta hai, aur supported compatibility repairs ko test karke activate karta hai. Jahan meaning clear nahi hota, jaise unexplained price jump, wahan checkout block hota hai. Har decision ka evidence Repair Passport mein milta hai.

## Demo ke four points jo yaad rakhne hain

| Change | Explain karne wali line |
| --- | --- |
| Customer field rename | Value/type equivalence aur validation ke baad field mapping |
| Delivery days se hours | Demonstrated 24-to-1 relation verify karke conversion |
| Pricing HTTP 429 | Retry-After respect karne wali bounded GET retry |
| Unexplained 100-times price | Guessed conversion nahi; checkout block |

## Claims jo nahi karne hain

- Har API change automatically repair hota hai.
- Yeh universal AI hai jo application code rewrite karta hai.
- System 100% secure ya production-ready hai.
- Payment process hota hai ya actual order place hota hai.
- API dependencies automatically har codebase se discover hoti hain.
- Physical three-laptop, Docker, ya external LLM integration fully verified hai.
- Million users, zero downtime, ya guaranteed recovery speed tested hai.

## Team training plan

1. Pehle Questions 1-20 padho aur API, gateway, baseline apne words mein samjhao.
2. Questions 21-30 ke examples browser panels par manually practise karo.
3. Questions 31-50 mein technology aur evidence ko relevant screen/code se connect karo.
4. Questions 51-60 se advanced viva practise karo; unknown detail par limitation honestly batao.
5. Ek member question poochhe, doosra 30 seconds mein bina guide dekhe answer de. Jahan possible ho incident, test, ya passport dikha kar proof do.

Useful references: [existing judge guide](JUDGES-GUIDE.md), [test record](VERIFIED.md), [LAN setup](LAN.md), aur [project README](../README.md).
