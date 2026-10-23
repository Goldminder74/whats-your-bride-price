# Compensating plan for migration 0000

This initial migration creates the inactive durable-data foundation. It is forward-only and must never be rolled back automatically.

Before production data exists, the safe rollback is to decline the D1 binding and deploy the prior application version. The unbound application does not call these tables.

After any durable writes exist, do not drop tables. Disable the dependent feature flags, stop write endpoints, export the database, verify row counts and checksums, and deploy compatible code. If a replacement schema is required, use a new expand-copy-verify-contract migration. Destructive table removal requires separate owner approval, a verified backup, a rehearsed restore and an explicit maintenance window.

The isolated test runner may delete its own in-memory SQLite database by closing it. That is not a production rollback and is the only destructive cleanup automated by this repository.
