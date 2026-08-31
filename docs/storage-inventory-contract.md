# Storage inventory contract

Date: 31 August 2026

Status: local implementation contract; not production legal approval.

`app/storageInventory.ts` is the single versioned, machine-readable source for the application’s storage and browser-access notice. Every entry has a stable key, technology, exact key or controlled pattern, party/provider, purpose and category, data description, trigger, pre-choice and consent status, functional status, retention, device-transfer status, clearing route, source modules, notice version and enabled state. `/privacy/storage` renders the same entries and `/privacy/storage/inventory` returns only this public-safe schema. Values, credentials, hashes, deletion tokens, internal IDs and secrets are never returned.

The registered entries are: `regional_best_scores`, `quiz_recovery`, `quiz_recovery_tab`, `anonymous_session`, `analytics_preference`, `analytics_session`, `analytics_seen`, `nomination_snapshot`, `pending_order`, `private_photo_memory`, `generated_media_memory`, `controlled_url_state`, `navigation_history_state`, `clipboard_write`, `file_downloads`, `application_cookies`, `indexed_db`, `application_caches`, `sites_platform`, `stripe_site`, and `social_sites`.

The inventory distinguishes application-controlled storage from platform-controlled Sites/trusted-dispatch behavior and storage controlled by Stripe or a social platform only after deliberate navigation. Automated source scanning fails when an application storage read/write is introduced without a registered exact key or controlled prefix. Application-owned cookies, IndexedDB, Cache Storage and service-worker caches are registered as not installed; marketing, advertising, pixels and third-party analytics are absent.

Local clearing derives exact localStorage and sessionStorage allowlists plus the safe nomination prefix from this contract. It never calls a broad origin clear and does not claim to remove downloads, browser history outside the current app entry, public links, orders, entitlements, third-party storage or server records.
