# Data retention schedule

Date: 31 August 2026

Status: generated technical summary; final owner and professional approval is required before production activation.

The canonical row data is `app/retentionSchedule.ts` and `/privacy/retention` renders it. Each row states purpose, location, retention trigger, maximum period, expiry behavior, deletion or anonymisation behavior, user control and activation state.

The implemented result rule is authoritative: completed attempts, answers and results expire exactly 90 days after authoritative quiz completion. Publication has no effect on `expires_at`; it does not extend, restart or remove expiry. Unpublication, deletion or another valid lifecycle action can make a result unavailable sooner, and copies or caches outside the service are not controlled by the application.

Challenges remain capped at 30 days or the source result’s remaining life, whichever is earlier. Accepted challenge play is also bounded by its own 24-hour authority. Raw version-1 referral, share and analytics events cannot exceed 30 days. Analytics choices persist for 180 days and analytics sessions for at most 24 hours. Pending Royal Reveal authority lasts 30 minutes; configured commerce record retention remains 400 days pending legal/statutory review. Ordinary Royal Reveal regeneration requires an active result, at most 90 days from completion; a protected return may finish a verified payment already in progress. Downloaded files remain device-controlled.

Inactive daily-challenge, streak and party features do not present earlier proposals as active retention. Browser recovery, anonymous credentials, nomination handoff, private photographs, object URLs and downloads retain their separately implemented or device-controlled lifecycles. Hosted D1 and R2 remain unbound and no retention operation has been activated.
