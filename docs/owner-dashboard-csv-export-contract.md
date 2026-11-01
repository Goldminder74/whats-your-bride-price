# Owner-dashboard aggregate CSV export contract

Date: 27 August 2026
Route: `GET /owner/analytics/export`

The CSV endpoint enforces the same feature flag, trusted Sites identity, explicit server-only subject allowlist, validated date/edition/source/campaign filters, consent/retention query boundary and fail-closed D1 runtime as the HTML dashboard. It additionally requires same-origin Fetch Metadata and an approved owner-keyed rate limiter. The current in-memory limiter is local-review-only; production export remains unavailable until a distributed limiter is approved.

The fixed columns are `section`, `metric`, `value`, `numerator`, `denominator`, `rate`, `state`, `period`, `filters` and `note`. Sections are aggregate metrics, funnels, viral coefficient, supported/unsupported dimensions, exact channels, editions and sample-controlled source/campaign cohorts. Game mode is included only as `unsupported` with an empty value. Suppressed small cohorts have empty values. No raw event, individual session or hidden worksheet is produced.

Every cell is UTF-8 CSV quoted and embedded quotes are doubled. A cell beginning with `=`, `+`, `-`, `@`, tab or carriage return is prefixed with a single quote before CSV escaping. The response begins with a UTF-8 BOM, uses CRLF rows, `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="wybp-aggregate-report.csv"`, `X-Content-Type-Options: nosniff`, a sandboxed CSP, same-origin resource policy, no-referrer policy and private no-store caching.

The filename contains no date, owner, workspace, source, campaign or identifier. Exports never contain names, emails, photographs, credentials, ownership hashes, analytics-session hashes, event UUIDs, result/challenge/order/Stripe identifiers, answers, raw properties JSON, IP addresses or user agents.
