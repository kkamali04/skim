# Changes

## 1.2.1 — release candidate

- Retain distinct controls with shared names, visible alerts/validation messages, and current open-shadow form values with shadow-local sensitive-label protection.
- Keep empty contact labels intact without weakening next-line credential redaction. Skip invisible overlay content and respect clipping ancestors when computing screenshot masks.
- Close probed portal menus through the focused listbox so React menus do not remain open after capture.
- Preserve sticky containers as containing blocks during screenshot stitching so positioned children and their masks stay in place.
- Add an opt-in ten-website native-popup acceptance suite with actual clipboard readback, independent screenshot comparisons and source hashes.
- Copy the complete screenshot automatically after capture, including multipart layouts within the combined image budget. Keep masking, full-image recopy, per-part copy and manual downloads. Oversized image failures preserve the previous clipboard.
- Make captures clipboard-only by default with no screenshot cache or automatic files. Reset the prior default-on text history policy; optional text history expires after 14 days using a local cleanup alarm.
- Read ARIA combobox choices without requiring aria-haspopup, support legacy keyboard handlers, and report unavailable options. Include aria-labelledby textareas and up to 12,000 characters of their redacted values with explicit truncation.
- Recognize current Upwork feed cards and export one structured record per job, preserving repeated proposal/payment/location/rate details with the correct title and URL. Keep skill links in the link list without treating them as jobs.
- Hide fixed/sticky overlays inside nested open shadow roots during screenshot stitching, then restore their original styles on success or failure.
- Fix native action-popup sizing (the viewport-width cap could collapse its width); use a fixed 460 × 400 frame with consistent padding and internal scrolling.
- Fix text/code/transcript, history and recopy clipboard writes when the extension document loses focus. Use the existing clipboard permission inside the extension rather than relying on the captured page's clipboard policy.
- Prevent smooth scrolling from fighting text capture and restore page position/focus before completion. Restore screenshot position before re-enabling site scrolling styles.
- Add a real native-action popup regression using production extraction defaults; disable Playwright's artificial focus for background-document clipboard checks.
- Fix live YouTube extraction for the current native transcript view-model and its timestamp/text classes; retain both older layouts.
- Add layout regressions, native extension clipboard coverage for the current layout and successful live DOM verification.
- Add exact-production-manifest permission tests with no host grants, proving capture and provider requests are denied before permission.
- Round manual masks outward to whole pixels so fractional drag edges remain fully opaque in preview, clipboard, PNG and ZIP exports.
- Activate GitHub Actions tests/packaging and keep live network diagnostics separate from deterministic CI.


## 1.2.0

- Fixed 400 × 600 purple light/dark popup, consistent local Lucide SVG controls, bundled Manrope, visible keyboard focus and 20px content padding.
- Full current-capture text preview, keyboard recopy and text downloads independent of history truncation.
- Keyboard coordinate masks and a single ZIP export containing every reviewed screenshot part with its individual opaque masks.
- Removed the unused screenshot-cache setting and obsolete cache paths.
- Clarified AI opt-in, local key storage, provider permissions and possible charges.
- Reject incorrectly typed profile values, including a string `"false"` that previously acted as enabled.
- Privacy regressions for provider destination changes, secret redaction before size caps, iframe field labels, metadata truncation and numeric record URLs.
- Provider deadlines cover response bodies; summary failure remains visible after raw clipboard fallback.
- Explicit screenshot review, coverage and failure handling, isolated native Chromium regression suite, packaging and a ready-to-enable CI template.
- Public documentation states the unresolved live YouTube transcript failure and installed-profile verification gap.

This public source snapshot continues the original MIT-licensed capture project; the upstream copyright is preserved in LICENSE.
