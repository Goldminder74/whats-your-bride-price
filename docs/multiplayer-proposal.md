# Multiplayer proposal — preparation only

15 October 2026. No feature implementation, hosted resource, charge or activation.
This is a proposed direction, not an approved specification. Core launch at5,000
completed player games/day,500/hour and£50/month remains the priority.

## Recommended scope

After the single-player capacity/recovery gates pass, assess an invite-only friend
room for2–6 players, one region,12 shared eligible questions and a shared result.
Use the existing published pool, canonical scoring, shuffled options and image
progression. Keep tied knowledge scores tied; do not turn network speed into culture
points. Optional timing/tie-break rules require a separate product decision.
Defer public matchmaking, chat, spectators, prizes, tournaments and new photo sharing.

Every player completion counts as one game for capacity, not one room. Six players
produce72 answers. Do not add multiplayer demand on top of5,000/day silently.
Synthetic pilots have no wallet charges. A real-user pilot needs an explicit
allowance/eligibility decision: do not bypass the two-free-game/paid-play contract,
invent a Cowrie fee, or grant real rewards under the guise of a test.

## Delivery options to compare

| Option | Benefit | Trade-off / decision |
|---|---|---|
| Existing asynchronous challenge | Reuses current concepts and avoids continuous presence traffic. | Lowest-risk first social release; not a simultaneous live room. |
| HTTP room state every5seconds | Simple recovery and ordinary signed ingress. | Extra request/DB traffic and delayed updates; must measure budget fit. |
| WebSocket room coordinator | Timely rounds and fewer polls. | Requires separately reviewed state coordination, reconnect, hibernation, limits and billing; not assumed installed or free. |

Illustration, not telemetry: a six-minute match with six players polling every5s
adds432 polls/room,72/player. At150,000 player completions/month that is10.8m extra
requests, about2,160 Netlify credits at the recorded2credits/10k rate, before compute,
assets or room writes. The existing optimistic4,281-credit model would become6,441;
the quoted10k tier$63 plus Workers$5 is about£65.28 before operational contingency
under the planning FX/tax allowance. It would exceed£50. One-second polling would
add54m requests/10,800 credits. Do not assume those polling architectures fit.
WebSocket/coordinator costs and provider guarantees require fresh documentation,
an isolated proposal and explicit approval before choosing or creating anything.

## Safety and recovery requirements

- Issue opaque, scoped, expiring/revocable room invites. Rate-limit room creation,
  joins, answers and reconnects. A room token never grants operator authority or
  another player's wallet/result access. Preserve origin and ingress checks.
- Show, before joining, which chosen name/result friends will see. Keep rooms
  private and unindexed; avoid exposing wallet IDs, recovery tokens or contact details.
- Record authoritative participant/attempt identity and answer order. Duplicate
  joins, retries and refresh must recover the same attempt without another charge.
  Reconnect cannot reopen a closed/frozen wallet or restore suppressed records.
- Server-verify answers and round transitions. Do not reveal answer keys before
  the relevant round is complete. Prevent host or participant substitution of scores.
- Reuse approved retention/hold/dependency rules for attempts, results and accounting.
  Classify any new room/presence metadata before implementation; no new retention
  duration is approved here. Recovery must replay closure/deletion authority first.
- Provide keyboard/mobile/reduced-motion behaviour and a useful reconnect path;
  do not assume persistent connectivity or require analytics consent.

## Next proposal, after core launch gates

Compare asynchronous play with a2–6-player live room, including exact CPU/DB/request
costs, state model, invite/recovery rules, retention classification and a capped
synthetic test. Then ask for the specific mode and allowance decision. No schema,
coordinator, payment or public deployment is authorised by this proposal or by the
current capacity benchmark approval.

Pricing arithmetic reuses the recorded15October
[Netlify credit tiers](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/).
It is not a verified multiplayer bill or a request to raise the current ceiling.
