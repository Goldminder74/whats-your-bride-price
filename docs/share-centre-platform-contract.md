# Share Centre platform and media contract

Date: 24 August 2026

Prompt 13 adds one reusable, client-side Share Centre to normal results, official comparison results and valid personalised challenge landings. It does not add a social SDK, OAuth flow, contact picker, recipient field, upload endpoint, analytics transport, dynamic Open Graph image, permanent result route or video export.

## Canonical link policy

Personalised sharing accepts only the existing validated public challenge projection and exact canonical `/challenge/{48 lowercase hexadecimal characters}` URL on the approved public origin. The player name, verified score, edition, approved avatar and derived result title come from that projection. Prompt 12 nomination and Prompt 13 sharing use the same tab-local safe snapshot and idempotent creation boundary, so both surfaces reuse one code rather than creating competing challenges.

When challenges, durable storage or safe creation are unavailable, the Share Centre fails closed to `/?edition={approved edition}`. The neutral copy contains no invented inviter identity, score, challenge code or `nominated=1` claim.

## Platform compatibility

| Action | Current implementation | Honest limitation and fallback |
| --- | --- | --- |
| WhatsApp | Opens the approved HTTPS `wa.me` composer with fixed copy, safeguard and one canonical URL. The new context uses `noopener,noreferrer`. | A popup blocker can prevent opening. The game then copies only the safe canonical link when clipboard access is available, or displays it for manual copying. Opening is a handoff, not delivery. |
| Facebook | Opens the HTTPS Facebook sharer with only the canonical URL. The new context uses `noopener,noreferrer`. | Facebook controls its composer and preview. The current static Open Graph image does not contain the safeguard and remains a temporary fallback pending Prompt 14. A blocked composer uses the same safe-link fallback. |
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

This local story portrait is not an Open Graph preview. Prompt 14 may later create safe server-resolved previews from public challenge fields and approved static artwork only. It must not reuse a private photo or treat this in-memory file as a durable public asset.

## Copy controls

Copy is deterministic under `share-centre-v1`. There is no remote experiment, cookie assignment or query-parameter variant. Personalised copy must exactly match the validated public challenge projection. Generic copy must remain neutral. Every complete WhatsApp text includes the safeguard and canonical URL once, and stays below the tested practical maximum of 700 characters.

## Accessibility contract

The Share Centre is a labelled modal dialog with focus on its close control, Escape dismissal, contained Tab order and focus return to the activating control. Controls are at least 44 CSS pixels high. Status changes use a polite live region. Manual fallbacks are selectable and labelled. Safe-area padding, 320-pixel single-column layout, visible keyboard focus and reduced-motion styling are required regression checks.
