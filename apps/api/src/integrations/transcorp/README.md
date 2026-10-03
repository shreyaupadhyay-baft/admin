# Transcorp integration foundation

Infrastructure only. No KYC, beneficiary, transaction, card, payment-issue or dispute
operations exist yet, and **no provider-owned data is stored in BAFT PostgreSQL**.

## Data boundary
- BAFT owns users/devices/support/risk/security/campaigns/rewards/administration.
- Transcorp owns transaction/card/KYC/beneficiary/payment data. It is fetched on demand
  through registered operations for permitted admin workflows and is never mirrored.

## Architecture
```
Controller → BAFT service/use case → typed operation function → TranscorpClient.execute(op) → Transcorp
```
- `config.ts` — env-driven config; `settings` (non-secret) vs `secrets` (`SecretValue`, never serialises).
- `operations/types.ts` — `defineOperation()`; every provider call is a registered operation
  (host, method, relative path, schemas, retry/idempotency). The client accepts nothing else, so
  controllers cannot issue arbitrary HTTP and no URL ever comes from user input.
- `client.ts` — auth headers, timeout, bounded retry, circuit breaker, concurrency cap, response
  size cap, schema validation, error normalisation, one log line per call.
- `errors.ts` — `TranscorpProviderError` (extends `AppError`) + category → BAFT status mapping.
- `health.service.ts` — cached provider health, never part of `/health/ready`.
- `webhook/gateway.ts` — verifier + replay store + handler registry (no handlers registered).

## Adding an operation (future slices)
1. Add `operations/<domain>.ts` with `defineOperation(...)` and zod response schema (strip unknown fields).
2. Expose a typed function; call it from a BAFT service, not a controller.
3. Gate the route with the domain's own permission (`kyc.read`, `transactions.read`, ...). There is
   deliberately no "Transcorp admin" permission; `system.integrations.read` only exposes connectivity status.
4. For writes: leave `idempotency: "none"` (single attempt) until Transcorp's idempotency contract is verified.

## Retry policy
| Kind | Retried when | Not retried |
|---|---|---|
| read | timeout, network, 5xx, 429 with `Retry-After` ≤ `TRANSCORP_RETRY_MAX_DELAY_MS` | 400/401/403/404/422, malformed response |
| write, `none` | never (exactly one attempt) | everything |
| write, `natural` | as reads | as reads |
| write, `key` | as reads, only if `TRANSCORP_IDEMPOTENCY_HEADER` is set and the caller supplied a key | otherwise single attempt |

Full-jitter exponential backoff, capped by `TRANSCORP_RETRY_MAX_DELAY_MS`, `TRANSCORP_MAX_ATTEMPTS`
and the overall `TRANSCORP_TOTAL_TIMEOUT_MS` budget. After `TRANSCORP_CIRCUIT_FAILURE_THRESHOLD`
consecutive health-type failures (timeout/network/5xx/malformed) calls fail fast for
`TRANSCORP_CIRCUIT_COOLDOWN_MS`, then one trial request is allowed.

## Error → BAFT API mapping
| Category | HTTP | Code |
|---|---|---|
| authentication (401/403 from provider) | 502 | PROVIDER_AUTH_FAILED (never 401/403: the SPA would log the admin out) |
| validation (other 4xx) | 422 | PROVIDER_REJECTED_REQUEST |
| not_found | 404 | PROVIDER_RESOURCE_NOT_FOUND |
| rate_limited | 429 | PROVIDER_RATE_LIMITED |
| timeout | 504 | PROVIDER_TIMEOUT |
| network / provider_5xx | 502 | PROVIDER_UNAVAILABLE / PROVIDER_ERROR |
| malformed_response | 502 | PROVIDER_BAD_RESPONSE |
| not_configured | 503 | PROVIDER_NOT_CONFIGURED |
| circuit_open / concurrency cap | 503 | PROVIDER_UNAVAILABLE |

Client messages are fixed strings; provider text is never returned or logged (only a token-shaped
provider error code is kept).

## Endpoints
- `GET /api/v1/system/integrations/transcorp/health` — requires `system.integrations.read`
  (Super Admin, Engineering Admin). Always 200; `status`: `disabled | misconfigured | unverified | healthy | unhealthy`.
- `POST /api/v1/integrations/transcorp/webhooks` — authenticated by the provider token header
  (`TRANSCORP_WEBHOOK_AUTH_HEADER`), rate-limited. Replay protection via Redis `SET NX EX`
  (event id header if configured, else hash of the canonical body). Payloads are not persisted.
  202 accepted, 200 duplicate, 401/400/503 otherwise (503 → provider retries).

## Environments
`TRANSCORP_ENVIRONMENT=uat|production` plus per-environment env values; no code change between
dev → UAT → production. `production` is refused unless `NODE_ENV=production`; `none` auth is
refused in production; https is mandatory outside loopback mocks.

## IP allow-listing
Transcorp may require BAFT's egress IPs to be allow-listed (unconfirmed). Production egress should
use a stable NAT/Elastic IP and that address given to Transcorp. Nothing in code depends on it.
Inbound webhook source IPs, if Transcorp publishes them, should be enforced at the load balancer/WAF.

## Known limitations / TBD (need Transcorp confirmation)
- Production auth scheme and header names, tenant header, idempotency header.
- Health/ping endpoint (`TRANSCORP_HEALTH_PATH`), and the exact response shape of any operation.
- Webhook authentication (HMAC vs token), event-id/type fields, retry schedule.
- Secrets come from env vars; migration to AWS Secrets Manager is part of production hardening.
- DNS-rebinding is not mitigated beyond blocking private/metadata IP literals and loopback in config
  (the base URL is operator-controlled); egress firewall rules are the defence in depth.
- Circuit breaker, concurrency cap and health cache are per-process (not shared across instances).

## KYC module (read-only) — contract still unverified
`GET /api/v1/kyc/:userId` (permission `kyc.read`; Super Admin, Support Admin, Risk/Fraud Admin) resolves
the BAFT user, takes the provider identity from `users.external_ref` **server-side**, calls a registered
`KycAdapter` through the Transcorp client, filters the result through an allow-list DTO and writes a
`KYC_VIEWED` audit row (outcome only — no KYC data, no provider ref). Nothing is cached or stored.

**No Transcorp KYC operation exists yet** because the repository contains no KYC contract. To finish:
add `operations/kyc.ts` (`defineOperation`, kind `read`, zod response schema), an adapter in `kyc/` mapping
the validated response to `NormalizedKyc`, and register it (the API reports `state: "unverified"` until then).
Information needed from Transcorp: endpoint + method; request identifier (and whether it equals
`users.external_ref`); auth/tenant headers for the KYC host; response schema incl. status vocabulary,
timestamps, masked reference formats; whether a decline reason may be shown to admins; error
semantics for "no KYC record"; rate limits; UAT credentials.

## Beneficiary module (read-only) — contract still unverified
`GET /api/v1/users/:id/beneficiaries` (permission `beneficiaries.read`; Super Admin, Support Admin, Risk/Fraud
Admin) follows the KYC pattern exactly: BAFT user id in → provider identity from `users.external_ref`
**server-side** → registered `BeneficiaryAdapter` through the Transcorp client → allow-list DTO
(`status`, `displayName`, `beneficiaryType`, `maskedReference`, `addedAt`; no limits, no full account numbers,
no provider ids) → `BENEFICIARY_VIEWED` audit row (outcome only). Nothing is cached or stored; no beneficiary
table exists. States: `available`, `no_provider_relationship`, `not_found` (also an empty list),
`not_configured`, `unverified` (the current production state: no adapter is registered).

To finish: add `operations/beneficiary.ts` (`defineOperation`, kind `read`, zod response schema), an adapter in
`beneficiary/` mapping the validated response to `NormalizedBeneficiary[]`, and register it. The DTO fields and
status vocabulary in `beneficiary/types.ts` are BAFT-side placeholders to be reconciled with the contract.

Information needed from Transcorp: endpoint + HTTP method; lookup identifier (and whether it equals
`users.external_ref`); auth mechanism and tenant headers; request/response schemas; beneficiary status values;
limit fields and semantics (currency, period, per-txn vs aggregate); not-found semantics (404 vs empty list);
rate limits; which fields (name, account/reference masking format) admins may see; UAT credentials.
