# Share Centre platform and media contract

Date: 24 August 2026

Prompt 13 adds one reusable, client-side Share Centre to normal results, official comparison results and valid personalised challenge landings. Prompt 14 adds an explicitly published permanent result route and dynamic Open Graph image behind `dynamic_results`. Neither prompt adds a social SDK, OAuth flow, contact picker, recipient field, analytics transport or video export.

## Canonical link policy

Personalised sharing accepts only the existing validated public challenge projection and exact canonical `/challenge/{48 lowercase hexadecimal characters}` URL on the approved public origin. The player name, verified score, edition, approved avatar and derived result title come from that projection. Prompt 12 nomination and Prompt 13 sharing use the same tab-local safe snapshot and idempotent creation boundary, so both surfaces reuse one code rather than creating competing challenges.

An explicitly published result uses `/result/{48 lowercase hexadecimal characters}`. Facebook, WhatsApp, Copy link and Native share use that same URL. Publication is never triggered by opening the Share Centre, page rendering, metadata, media preparation or crawler traffic. The player sees the approved disclosure and must select Make result public. Keeping it private preserves the existing challenge or neutral regional fallback. Unpublishing immediately returns the Share Centre to its fallback and makes the origin page and generated media unavailable.

When challenges, durable storage or safe creation are unavailable, the Share Centre fails closed to `/?edition={approved edition}`. The neutral copy contains no invented inviter identity, score, challenge code or `nominated=1` claim.

## Platform compatibility

| Action | Current implementation | Honest limitation and fallback |
| --- | --- | --- |
| WhatsApp | Opens the approved HTTPS `wa.me` composer with fixed copy, safeguard and one canonical URL. The new context uses `noopener,noreferrer`. | A popup blocker can prevent opening. The game then copies only the safe canonical link when clipboard access is available, or displays it for manual copying. Opening is a handoff, not delivery. |
| Facebook | Opens the HTTPS Facebook sharer with only the canonical URL. An eligible public result resolves to its deterministic 1200 by 630 regional preview. | Facebook controls its composer and cache. Challenge, unavailable and temporary generation states retain `/og-v2.png`; that fallback still lacks the safeguard. A blocked composer uses the same safe-link fallback. |
| Instagram Story | Prepares a local 1080 by 1920 PNG. If file sharing is supported, it opens the operating-system share sheet with that file. | Browsers cannot reliably target or verify Instagram. If file sharing is unavailable, the image downloads and the UI gives exactly two steps: open Instagram and create a Story; select the downloaded image. |
| TikTok | Prepares the same local 9:16 PNG and uses the operating-system file share sheet when supported. | Browsers cannot reliably target or verify TikTok. If file sharing is unavailable, the image downloads and the UI gives exactly two steps: open TikTok and start a post or Story; select the downloaded image. |
| Copy link | Copies only the validated canonical URL. | If clipboard permission is unavailable, a read-only selectable field is shown. |
| Native share | Invokes Web Share with fixed copy, canonical URL and the prepared local PNG when file sharing is supported. | Availability and destination depend on the browser and device. Cancellation is reported separately and never counted as a handoff. |
| Download portrait | Downloads the locally rendered `bride-price-{edition}-story.png`. | The browser controls the download destination. No delivery or later upload is claimed. |

No Instagram, TikTok or Facebook deep link is used. No platform login token is requested. The game cannot see the selected recipient, account, app destination, post status, message status or delivery result.

## Static media contract

- Format: PNG.
- Dimensions: 1080 by 1920 pixels, exact 9:16 aspect ratio.
- Artwork: approved regional image, region palette and approved avatar, or the expressly selected device-local portrait for the current result only.
- Required text: edition, culture score, derived approved result title, product name and `A playful culture score, never a measure of human worth.`
- Filename: fixed from the approved edition key and never from a name, score, source filename, challenge code or session value.
- Privacy: rendering uses canvas on the device. The resulting blob is kept in memory until a deliberate share or download. Object URLs are revoked after download. No media bytes are sent to D1, R2, the application server or a third-party service.
- Safe area: key content remains within a 96-pixel horizontal inset and central story composition.

This local story portrait is not an Open Graph preview. Prompt 14’s separate 1200 by 630 server preview uses only the neutral identity, authoritative public result fields, approved avatar identifier, regional palette/motif, quiz branding and permanent safeguard. It has a 1,000,000-byte hard ceiling and a preferred target below 500,000 bytes. It never reuses a private photo or treats the local 9:16 file as a durable public asset.

## Five-second Story video contract

Prompt 15 adds a feature-gated, browser-local 1080 by 1920 animated result. The exact timeline is five seconds at a requested 30 frames per second: regional reveal, avatar and score, result-title reveal, then a readable final hold. High scores receive the strongest approved celebratory accents. Every final frame includes the permanent safeguard and product branding.

- The encoder selects only a MIME type positively reported by `MediaRecorder.isTypeSupported`, preferring H.264 MP4 and then VP9 or VP8 WebM. The extension and MIME type always match.
- Output has an 8,000,000-byte hard ceiling. Unsupported, failed, cancelled and oversized paths retain the existing static 9:16 Story result.
- Optional sound is a short abstract drum flourish synthesised after the player selects Generate. It contains no speech, does not request microphone access and is omitted when audio capture is unavailable or sound is muted.
- The video uses only the approved regional image, palette, approved avatar, authoritative score, derived result title, mastery state, product branding and permanent safeguard. Entered names and private photographs are excluded.
- A prepared Blob, File and short-lived object URL exist only in browser memory. Nothing is uploaded or persisted. Download object URLs and preview object URLs are revoked.
- Native or platform-labelled actions first require `navigator.canShare({ files })`. Otherwise the correctly named file downloads and the interface gives honest manual instructions. No route claims a target app, post, message or delivery.
- `story_video` is false in ordinary production and has no query-parameter override. Authorised visual fixtures require both existing review-build controls and are excluded from ordinary output.

## Copy controls

Copy is deterministic under `share-centre-v1`. There is no remote experiment, cookie assignment or query-parameter variant. Personalised copy must exactly match the validated public challenge projection. Generic copy must remain neutral. Every complete WhatsApp text includes the safeguard and canonical URL once, and stays below the tested practical maximum of 700 characters.

## Accessibility contract

The Share Centre is a labelled modal dialog with focus on its close control, Escape dismissal, contained Tab order and focus return to the activating control. Controls are at least 44 CSS pixels high. Status changes use a polite live region. Manual fallbacks are selectable and labelled. Safe-area padding, 320-pixel single-column layout, visible keyboard focus and reduced-motion styling are required regression checks.
