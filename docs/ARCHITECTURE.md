# API Phoenix Architecture

API Phoenix is split into three independent views connected through a gateway:

```text
Provider API Change Lab
        |
        | real HTTP responses
        v
API Phoenix Gateway ----> MongoDB evidence and repair history
        |
        +----> LLM analysis (masked evidence only)
        |
        +----> deterministic validation and restricted adapters
        |
        v
ShopFlow client
```

## Components

- **Provider (`apps/provider`)**: Independent Express service for customer, pricing, and shipping APIs. Its runtime records are editable, and its scenario engine produces minor and major API changes.
- **Gateway (`apps/gateway`)**: Observes upstream traffic, compares responses with the latest healthy baseline, detects drift, checks affected workflows, validates restricted adapters, and blocks unsafe responses.
- **Console (`apps/console`)**: React dashboard for incidents, LLM guidance, validation evidence, repair passports, adapters, rollback, and provider controls.
- **ShopFlow (`apps/shopflow`)**: Customer-facing React application that talks only to the gateway and never directly to the provider.
- **Shared package (`packages/shared`)**: Contracts, endpoint definitions, masking rules, workflow dependencies, and the allowlisted adapter schema.
- **MongoDB**: Persists observations, encrypted healthy fixtures, incidents, proposals, validations, adapters, events, and repair passports.

## Minor-change path

1. The gateway compares a new provider response with the latest healthy response.
2. Approved aliases, single-item wrappers, bounded GET rate limits, and the shipping hours-to-days conversion can produce a restricted candidate.
3. The LLM receives masked evidence and the exact candidate. It classifies an eligible change as minor or recommends manual review when no candidate exists.
4. The gateway independently replays encrypted fixtures, makes fresh HTTP probes, checks contracts and business rules, replays affected workflows, and performs a final deployment probe.
5. Only a fully passing candidate becomes an active compatibility adapter. The client then receives its original contract.

## Major-change path

Missing required data, incompatible types, malformed responses, unexplained membership behavior, and unsafe pricing changes do not receive an automatic adapter. The LLM explains the likely impact, while the gateway keeps affected traffic blocked. An operator can record acceptance for manual implementation or reject the provider change; neither action bypasses validation.

## Safety boundary

The LLM never generates or executes application code. It can only corroborate the exact allowlisted candidate supplied by the detector or abstain. Credentials remain server-side, personal fields are masked before analysis, and model agreement cannot override failed gateway tests.
