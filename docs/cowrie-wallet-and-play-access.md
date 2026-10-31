# Cowrie Wallet and play-access contract

Status: disabled local source. No hosted migration, Stripe request, purchase credit or feature activation has occurred.

## Purpose and access rules

Cowries are closed-loop access tokens for eligible Random Quick Play. They have no cash value and cannot be transferred, resold, withdrawn, borrowed, wagered or converted to prizes. There are no random rewards, odds, paid spins, mystery items or secondary market.

`cowrie_economy` and `random_quick_play` are both false by default. Query parameters, cookies, browser storage, request headers and request bodies cannot enable them. Cowrie access also requires approved D1 and at least 30 current approved and published questions in the selected region. The first two successfully issued random games per authoritative anonymous owner are free. Later starts cost one Cowrie. Bonus Cowries are spent before purchased Cowries.

Classic regional fallback, Daily Challenges, incoming challenges, attempt recovery, results, basic result media, nominations and ordinary sharing remain free. The £1.99 Royal Reveal remains a separate product. Neither classic play nor review fixtures consume or award Cowries.

## Authority and atomicity

The browser supplies only a raw functional owner credential, region and bounded idempotency key. The server derives the owner hash and chooses the exact question and option order. A D1 batch uses an optimistic wallet-version guard, consumes the free allowance or appends one ledger debit, and inserts the exact immutable attempt. A failed statement rolls back the whole batch. Foreign-key ordering prevents a debit from being committed before its attempt exists. There is no financial reversal when neither the debit nor attempt exists.

Immediately before returning a paid selection, the service reloads its persisted question and option order, validates the active wallet and owner, and constructs the complete safe response. A conditional D1 transaction sets `quiz_attempts.cowrie_issued_at` only while it is null, the exact Quick Play idempotency hash and unreversed debit match, and the attempt remains current and unexpired. The final transactional read accepts either that transition or an already issued retry. No fallible projection or database work follows the commit. Retrying returns the same persisted attempt without changing its ordering, issuance marker, allowance or debit.

The nullable marker is a positive integer UTC epoch timestamp in milliseconds, within the JavaScript Date range and no earlier than the attempt start. Historical, free and non-Cowrie attempts may remain null. It means the server committed the safe projection for return; it does not prove network delivery, browser receipt, viewing or completion. Persistence triggers prohibit inserting an initially issued attempt, clearing a non-null marker, or replacing it. The marker is never browser supplied, public, logged or used for analytics. Setting it changes no retention deadline or ordinary attempt timestamps.

A pre-issuance server failure invokes a protected, domain-idempotent transaction: conditionally retire the unissued paid attempt as `abandoned`, append exactly one `technical_reversal` referencing its exact debit, restore the same balance bucket, and reconcile the original purchased allocation if applicable. Issuance and reversal use the same attempt-state predicate and serializable D1 batch boundary. If issuance wins, reversal cannot restore value; if reversal wins, no resume, answer or completion path can return a usable paid attempt. The old key is unavailable and a new game needs a new key and access decision. SQL authority and uniqueness guards enforce this even outside the service. Network loss after issuance never refunds; the same authorised key recovers the issued attempt. A temporary storage outage can leave an unissued persisted attempt pending for the same-key retry or protected recovery reconciliation; it cannot create a debit without an attempt.

## Wallet, ledger and bonuses

One active or frozen wallet may exist for an owner relationship. The public projection exposes only the opaque reference, controlled availability, total, separate purchased and bonus balances, free plays remaining and the bonus-expiry notice. Stored hashes and internal IDs are never bearer credentials and are never returned.

The append-only ledger supports only purchase credit, deterministic bonus credit, Quick Play debit, technical reversal, bonus expiry, refund reversal, dispute freeze and future protected owner correction. Database triggers prevent mutation, inactive-wallet writes and negative balances, then reconcile the matching wallet bucket after every insert. Domain-scoped idempotency is unique.

The only bonus rules are: first authoritative 12/12 in a region per UTC date, one Cowrie; first official three-day streak, one; first official seven-day streak, two; first authoritative all-five-region mastery, three. Server authority, compatible results and the relevant feature state must be proved before creating the internal capability used by the award service. Practice, fallback play, forged scores, retries and challenge comparisons cannot award. Bonus credits expire exactly 180 days after award. Purchased credits do not expire. Bounded FIFO reconciliation prevents a spent older credit from expiring a newer valid one.

## Recovery, deletion and privacy

Creation is deliberate: retrieval on a fresh device never creates a placeholder wallet that could prevent recovery. Creation produces 32 cryptographically random bytes encoded as 64 lowercase hexadecimal characters. A domain-separated SHA-256 hash is stored. The raw credential appears once on creation or rotation and can be copied or downloaded in `wallet-recovery.txt`. Recovery uses a same-origin, POST-only, strictly validated body and constant-time comparison. Verified recovery settles up to 100 unissued funded attempts through the same terminal-state mechanism before rebinding ownership. Each conditional reversal rechecks the verified recovery hash, and the final version guard rejects concurrent rotation or new pending debits. Issued attempts are never refunded. Rotation invalidates the former credential. Losing both the device credential and recovery credential can prevent automatic recovery.

Every route requires the exact method, HTTPS, the explicitly configured trusted application origin, same-origin Fetch Metadata with a fetch mode, JSON content type, a 4 KiB limit, strict fields, D1 and bounded rate control. Disabled routes return a neutral unavailable response before runtime acquisition. No public route credits Cowries or mutates ledger history. Analytics consent is irrelevant to functional use, and functional identifiers must not be reused for analytics or marketing.

The clear operation freezes access immediately and preserves the balance, immutable ledger and free-play counter. It cannot create a replacement allowance. No financial deletion deadline has been approved: the seven-day streak deletion rule does not apply to wallet records. Permanent wallet deletion, statutory retention, refund, dispute and customer-support periods and processes require professional approval and Workstream D before production activation.

Random completion is independent of commerce. It validates ownership and the exact issued snapshot, computes the score on the server, and atomically persists answers and the private result on the original attempt. Completion retries reconcile unique bonuses. Official Daily completion may prove possession of both existing independent raw credentials to credit a wallet. It creates no reusable ownership link and does not change streak retention. Each official milestone is unique across regions and wallets for that daily ownership relationship. Practice never invokes that hook.

Bonus availability excludes expired value immediately. Ordinary play never runs retention; if an expired balance still awaits bounded internal reconciliation, a paid start fails closed until that operation finishes. Immutable expiry entries remove value, not ledger history.
