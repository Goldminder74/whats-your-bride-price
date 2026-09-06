# Data retention schedule

Date: 31 August 2026

Status: generated technical summary; final owner and professional approval is required before production activation.

The canonical row data is `app/retentionSchedule.ts` and `/privacy/retention` renders it. Each row states purpose, location, retention trigger, maximum period, expiry behavior, deletion or anonymisation behavior, user control and activation state.

The implemented result rule is authoritative: completed attempts, answers and results expire exactly 90 days after authoritative quiz completion. Publication has no effect on `expires_at`; it does not extend, restart or remove expiry. Unpublication, deletion or another valid lifecycle action can make a result unavailable sooner, and copies or caches outside the service are not controlled by the application.

Challenges remain capped at 30 days or the source result’s remaining life, whichever is earlier. Accepted challenge play is also bounded by its own 24-hour authority. Raw version-1 referral, share and analytics events cannot exceed 30 days. Analytics choices persist for 180 days and analytics sessions for at most 24 hours. Pending Royal Reveal authority lasts 30 minutes; configured commerce record retention remains 400 days pending legal/statutory review. Ordinary Royal Reveal regeneration requires an active result, at most 90 days from completion; a protected return may finish a verified payment already in progress. Downloaded files remain device-controlled.

Daily challenges and streaks remain off by default. The approved product rule creates a streak only after an authoritative official daily completion and sets `expires_at` to exactly 180 days later. Each later valid official completion resets that deadline; practice, page visits, failures, retries, analytics, sharing and ordinary quiz play do not. A missed UTC day resets the current count while retaining the best count until the record expires. At expiry the streak is unavailable immediately, the bounded operation must remove it within seven days, and a returning player begins a new streak without reconnecting the former record. Clear my streak data makes the record unavailable immediately and permanently removes it within seven days; the current repository removes it in the same atomic request. Ownership hashes are functional only and must never be reused for analytics, marketing or cross-site tracking. Identifiable deletion logs are prohibited except where strictly required for security and operational integrity.

Daily recovery lasts only until the next UTC boundary, successful completion or a relevant clear control. Party features remain inactive and have no approved production retention. The Prompt 22 rules, migration and routes are local source only: production activation still requires documented privacy and legal review, an approved D1 binding, an approved server secret and separate deployment and migration approval.
