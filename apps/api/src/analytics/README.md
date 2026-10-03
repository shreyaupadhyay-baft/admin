# Analytics (BAFT-owned aggregates)

Read-only aggregation over existing BAFT tables. No provider (Transcorp) data is read, mirrored or inferred; no analytics tables,
snapshots or materialized views exist. Code: `routes/analytics.routes.ts` → `controllers/analytics.controller.ts` →
`services/analytics.service.ts` (definitions, suppression) → `repositories/analytics.repository.ts` (SQL).

## Date contract
UTC everywhere (the app has no timezone convention). `from`/`to` are inclusive UTC days; internally `[start, endExclusive)`.
Presets: `today`, `7d`, `30d`, `90d` (anchored on the current UTC day, inclusive) and `custom` (`from` and `to`, YYYY-MM-DD,
`from <= to`, `to <= today`, max 366 days). Unknown query parameters are rejected. Granularity: ≤31 days → day, ≤180 → week
(Monday start, edge buckets may be partial), else month.

Metric scopes: `range` (timestamp inside the range), `as_of_range_end` (cumulative before the range end), `snapshot`
(current state — statuses have no history, so they cannot be reconstructed for past ranges).

## Metric → source mapping
| Metric | Table.fields | Calculation | Time | Permission |
|---|---|---|---|---|
| Total users | users.created_at | count created < end | as_of_range_end | analytics.overview.read |
| New users / Users created | users.created_at | count in range | range | overview / onboarding |
| Active-status accounts | users.status | count status='active' (account flag, NOT activity) | snapshot | overview |
| Device adoption | devices.user_id, first_seen_at; users | distinct users with ≥1 device / total users | as_of_range_end | overview |
| Device registration rate | users, devices | created users with ≥1 device / created users | range | onboarding |
| Devices registered | devices.first_seen_at | count in range | range | overview / usage |
| Registered devices (total, by platform/status) | devices.platform, status | count first_seen_at < end; groups < 5 hidden | as_of_range_end | usage |
| Support cases created / open | support_cases.created_at, status | count / status in (open,in_progress) | range / snapshot | overview |
| App issues created / open | app_issues.created_at, status | same | range / snapshot | overview |
| Risk / security cases created / open | risk_cases / security_cases | same, status not in (resolved,closed) | range / snapshot | overview + risk_cases.read / security_cases.read |
| Campaigns / rewards created, by type/status | campaigns, rewards | count in range, grouped by current value | range | analytics.rewards.read |
| Active/paused/expired rewards; active/completed campaigns | rewards.status, campaigns.status | count | snapshot | rewards |
| Users created by status | users.status | grouped by current status; groups < 5 hidden | range | onboarding |

All sources are BAFT-owned. Time-series use `generate_series` buckets in SQL (zero-filled).

## Unavailable (never shown as 0)
Active users, activation rate, onboarding funnel stages, inactive-by-activity, feature usage (all), retention (all), usage
frequency/activity trend/active devices, entitlement evaluations, redemptions, redemption rate, payouts, user reward history,
and all financial metrics. Missing sources: a BAFT customer activity/event stream, onboarding stage timestamps, a feature-event
stream, a reward grant ledger, and an authorized financial dataset.
