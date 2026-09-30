# Mobile readiness

This is an incremental mobile audit of the existing application, not certification
of every device or of disabled features. No catalogue, scoring, storage, payment,
ownership or hosting-ingress rules change.

## Implementation

- One explicit zoom-enabled viewport includes `viewport-fit=cover`. Vinext
  1.0.0-beta.2's viewport serializer ignores `viewportFit`; the layout suppresses
  its default tag and renders the complete tag. Compiled tests require exactly one.
- Shared mobile styles provide 44px controls, readable editable text, wrapping
  answers, safe-area spacing and a scrollable short-screen About dialog.
- Footer/privacy links have larger touch targets. The About close button has an
  accessible name and cannot shrink below its intended target size.
- During mobile quiz play the Privacy choices control stays in the footer instead
  of floating over answers. It remains available and uses the same privacy dialog.
- Reduced-motion preferences stop decorative animations, including pseudo-elements.
  Mobile answers no longer require a backdrop-blur layer per button.
- Secondary regional art and avatar grids use native lazy loading. Explicit image
  boxes and asynchronous decoding avoid unnecessary synchronous image work.
  Current question images remain eager, use the same original assets and retain
  spoiler-proof descriptions and server-authoritative judgement. No resolution is
  fabricated or upscaled, and no new image transformation service is required.

## Regression gate

`npm run test:compiled-hosting` runs the same checks against freshly paired Sites
and synthetic Netlify/Worker builds, with no hosted requests:

- `tests/compiled-mobile.mjs`: 320×568, 360×640, 430×932, 844×390 and 768×1024;
  touch targets, dialogs, viewport/zoom configuration, enlarged answer text,
  focus/scroll progression and reduced motion. Contexts have touch support and
  2× pixel density. Screenshots go to the OS temporary directory, never Git.
- `tests/compiled-regional-progression.mjs`: all twelve questions in all five
  regions, desktop and mobile; correct/wrong image answers, final results and
  recoverable server/network/malformed-response errors.
- Existing compiled navigation and security checks remain mandatory.

These are browser-emulated checks, not physical iPhone/Android tests. Image loading
is browser-scheduled; lazy loading is not a promise of a specific byte saving.
No field speed or Core Web Vitals result is claimed without measurements.

## Before public launch

Verify the deployed pair on physical iOS Safari and Android Chrome, with large
system text, a virtual keyboard, cutouts, landscape, screen readers and a slow
mobile connection. Measure cold-load LCP, INP and CLS on representative hardware.
Verify image failure/retry and interrupted sessions without bypassing ownership.
Payments, random regional replay and Cowrie access require the separately gated
catalogue/runtime/payment work in [the handoff](current-handoff.md).

Reference guidance: [W3C reflow](https://www.w3.org/WAI/WCAG21/Understanding/reflow),
[target sizes](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum), and
[native image loading](https://web.dev/articles/browser-level-image-lazy-loading).
The 44px control target is a project ergonomics choice; it is not a claim of full
WCAG conformance.
