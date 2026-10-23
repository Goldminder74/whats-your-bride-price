# Actual-schema recovery lower bound — 23 October 2026

## New90-day physical rehearsal — PASS, local only

The explicit `--local-retained-90d` profile completed450,000 games and5,400,000
answers with independent synthetic wallet identities and varied hashes/clocks.
Complete source file-ID loss, interrupted/resumed index reconstruction and import,
all target table/proof hashes and foreign keys, accounting relationships, holds,
closed wallets and deletion suppression PASS. Access stayed blocked. Temporary
databases/ciphertext were deleted and the synthetic key cleared before the report
was saved. No hosted resource/request, email, Secret or benchmark allowance used.

| Observed quantity | Local90-day fixture |
|---|---:|
| Source SQLite bytes |2,796,285,952|
| Snapshot/proof objects / ciphertext bytes |5,406 /232,140,214|
| All snapshot/plan/control objects / bytes |10,946 /486,335,487|
| Counted local custody reads / transferred bytes |110,109 /8,764,033,399|
| Capture / import / verification calls |11,350 /5,401 /2,702|
| Restore page size |50 rows|
| Elapsed |4,089,677ms (about68.2min)|

This is the90-day completed-game minimum, not the full99-day grace/outage stock.
It excludes incomplete-game stock, full long-lived financial/hold growth and30-day
authority-object history. It is NOT hosted RTO, normal serving capacity or evidence
that a daily source fence of11,350 calls is acceptable. The separate latest-tail
regressions exercise later financial/closure/deletion/hold changes and independent
high-water protection; this physical run does not fabricate that historical volume.
Older nine-day results below remain historical comparisons. Ignored evidence:
`local-schema-recovery-450000.json`, `20261023-retained-90d.log` under
outputs/authority-preparation. No generated report/database/archive is committed.

No hosted call, credential, payment, deployment or benchmark allowance was used.
This is a local SQLite/disk-custody rehearsal, not a provider capacity or RTO result.
The unchanged protected application and production access gates remain OFF.

## Bounded compression follow-up — locally verified, not deployed

New snapshot/restore-plan archive objects use gzip level1 before AES-GCM when it
saves bytes. The codec is authenticated with the object identity; decompression
occurs only after authentication and is limited to the existing3,500,000-byte
plaintext bound. Old archives, hashes, progress and ordinary authority/confirmation
records retain their formats. Retries reuse original ciphertext; there is no
migration, new setting, retention change or new provider.
Before any hosted compressed write, deploy/retain the matching decoder for the
operational Worker AND offline recovery operator. Once new archives exist, an
application rollback must retain that recovery decoder; older code cannot read
the new encoding. No hosted compressed archive has been written by this change.

The same45,000-game/540,000-answer actual-schema LOCAL lower-bound fixture passed
full table/FK/accounting/hold/closed-wallet/suppression checks, complete index loss
and interrupted import. Temporary databases/ciphertext were removed by the existing
scoped helper. The synthetic fixture repeats one historical wallet and gaming row
shapes; its compression ratio must not be assumed for arbitrary production data.

| Quantity | Previous packed archive | Compressed packed archive |
|---|---:|---:|
| Source SQLite bytes |245,944,320|245,944,320|
| Snapshot ciphertext bytes |379,679,396|9,594,958|
| All archive/restore-plan ciphertext bytes |824,131,204|20,910,112|
| Counted local ciphertext transfer bytes |5,401,398,144|263,333,571|
| Objects / custody reads |1,045 /10,404|1,045 /10,404|
| Capture / import / verify calls |1,068 /505 /254|1,068 /505 /254|
| Local elapsed milliseconds |387,167|310,515|

These are separate local runs with uncontrolled cache/background load, not hosted
latency, billing or an attributed speedup. Compression does not reduce inventory
requests, source fencing or the historical authority census. Source D1 still
exceeds Phase C's200MB ordinary threshold; the full90-day and latest-authority
recovery gates remain unresolved. No access receipt or hosted authority is created.

The actual Worker runtime separately passes compressed/legacy round trips and
rejects authenticated oversized decompression. Mixed legacy schema/new packed
segments, retry ciphertext identity, tampering, wrong key/name, unrecognised codec
and existing interrupted/hash-verification regressions pass. Ignored evidence:
local-schema-recovery-45000-compressed.json,20261023-archive-{focus,
recovery-regressions,worker,stock,ops-built,data-gate,data-resume,
retention-worker,lint,typecheck}.log. Initial broad data checks hit local Windows
sandbox localhost/rename restrictions; only the affected files were rerun with
normal local permissions. No assertion, timeout or security bound was weakened.
Cloudflare documents [node:zlib support](https://developers.cloudflare.com/workers/runtime-apis/nodejs/zlib/);
this change was also verified in the configured local Worker compatibility runtime.

## Verified workload and corrections

45,000 completed-game records and540,000 answer records represent a nine-day
physical sample at5,000 completions/day, NOT the approved full retention stock.
Completed attempts AND their answers follow the90-day lifecycle; seven days is
the maximum physical-purge delay after expiry, not ordinary answer retention.
The fixture also
contains real-schema synthetic refunded accounting relationships, a closed wallet,
holds and deletion suppression. It uses one historical wallet and cloned gaming
rows, NOT45,000 independently active players. It excludes incomplete/retried/abusive
traffic, full90-day attempt/answer/result stock, six-year financial history and
30-day authority inventory.
Those omissions make it a physical lower bound, not complete production stock.

Local migrations0000–0014 only; no hosted schema changed. The existing production
recovery guards run against explicit local adapters, not a production connection.
Bounded source capture and verified scratch cleanup precede independent snapshot
materialisation and provenance-bound import. Every source file-ID mapping is lost;
reconstruction is interrupted then resumed, preserving original IDs and clocks.
Import crashes after a committed page and resumes without duplicate data. Full
table hashes,540,000 answers and foreign keys match; accounting, holds, closures
and suppression match exactly. No retention/access receipt is installed and the
source remains fenced at the same sequence/hash after verification.

Two confirmed defects were corrected:

- Verification fetched the same immutable proof block for every100-row leaf.
  It now keeps one hash-pinned block within one bounded call, then downloads and
  authenticates again after restart. Corruption between calls still fails closed.
- Canonical projections alias encoded values back to column names. SQLite
  `ORDER BY id` could sort an encoded INTEGER alias lexically, while keyset resume
  used the actual numeric key. Ordering now explicitly qualifies raw primary-key
  columns in source hashes, proof construction and target verification. A2,600-row
  INTEGER-key regression exercises multiple resumptions and corruption. TEXT-key
  archive ordering is unchanged; no immutable archive is rewritten.

## Measured local result

| Quantity | Initial25-row plan | Proof cache,25 rows | Final proof cache,50 rows |
|---|---:|---:|---:|
| Verified answers |540,000|540,000|540,000|
| Source SQLite bytes |245,944,320|245,944,320|245,944,320|
| Snapshot objects / ciphertext bytes |510 /379,679,396|510 /379,679,396|510 /379,679,396|
| Total snapshot plus restore-plan objects / bytes |1,550 /824,792,780|1,550 /824,792,780|1,045 /824,131,204|
| Synthetic custody read actions |19,476|13,433|10,404|
| Counted local ciphertext transfer bytes |6,940,323,568|5,993,106,612|5,401,398,144|
| Capture / import / verify calls |1,068 /1,010 /254|1,068 /1,010 /254|1,068 /505 /254|
| Whole local rehearsal elapsed |812,441ms|604,559ms|387,167ms|

These read actions and transferred bytes come from the synthetic custody adapter;
they are not observed Google requests, Cloudflare billing or hosted timings.
OS cache/scheduling were not controlled; do not attribute the wall-time difference
solely to a source change or extrapolate it as hosted recovery capacity.
Randomised ciphertext/boundary hashes differ between independent runs. Temporary
databases and ciphertext were deleted after each run, keys cleared from the helper's
buffer and sanitised reports retained only in ignored output.

## Explicit hosted stop and remaining recovery work

Original Phase C hard caps are250MB D1,250MB Drive and750MB transfer; ordinary
admission must stop before80%. Even this lower bound exceeds the ordinary D1
allowance, the hard snapshot/total Drive cap and the hard transfer cap (about7.2x).
Retained B stock and historical authority objects would add to it. A36k-answer
sample cannot establish full-stock recovery or the48h outage requirement.

No cap was raised, expired window restarted or resource recreated. The separate
[exact renewal](benchmark-renewal-2026-10-23.md) preserves all reservations and only
measures its original bounded sample. It is not sufficient full-stock authority.

Remaining engineer-owned work: bound archive/plan storage and repeated reads;
account for genuine retained authority/financial/result stock; establish an
independently verifiable latest-authority tail after archive capture and complete
loss of D1/index; verify fresh suppression/accounting before any access receipt;
then propose a full-stock hosted scope with physical/request/CPU/cost limits.
Unknown/later authority currently rejects recovery, as required. Import completion
alone cannot grant access, prove a24h RTO or establish financial zero-loss.
D1 and independent storage delivery are not atomic.

The full hosted500-game hour, ongoing-arrival purge drain and full-stock recovery
remain unverified. Neither this result nor the old25-game baseline proves the
5,000/day,500/hour,48h andGBP50 combination. No lower target was substituted and
no paid upgrade or architectural migration was performed.

The90-day minimum alone is450,000 completions /5.4m answers, before incomplete
games, purge grace, holds and accounting. At the previous default25 rows/page,
answers + attempts + results require at least252,000 data pages, above the existing
250,000-page restore-plan guard. Do not raise this security bound. The existing
supported50-row page size reduces that minimum to126,000 pages and is now selected
for new production restore plans. Focused tests verify bounded segment bytes and
interrupted import; full-stock execution still needs verification. This arithmetic is
not a full-stock execution or a guarantee that all other limits fit.
Existing immutable25-row plans remain readable/resumable. Do not reuse an old
plan-start name with different settings: preparation rejects that conflict. Use a
new plan identity with the same original provenance/expiry, never refresh retention.

The retained authority census is another independent scaling risk: current
`boundedAuthority.mjs` traverses all live provider inventory and decrypts each live
intent while the source remains fenced, including intents at/below the baseline.
The local compiled one-game fixture observed four new Drive objects with refresh
and completion replay; this is not a population or billing forecast. At four
intents per new-player completion,5k/day and30-day custody would mean600k intents
before abandonment, journals or snapshots. Even one read each exceeds a60-minute
window at the experiment's10-starts/sec pacing. A renewed tiny inventory cannot
prove production fence duration. Engineer-owned baseline/delta verification and
capture fencing need a bounded design/proof, without omitting unknown/later authority
or weakening original clocks, before full-stock hosted recovery can be certified.
