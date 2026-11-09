# Changelog

## 1.2.1 release candidate

- Reuse Cogent’s embedded product JSON parser, lazy image sources, image scoring and DOM extraction patterns. Add specification-table, video-link and visible-review fallbacks without adding agent permissions. Preserve MIT attribution.

- Show capture limits and partial-result reasons. Add an optional native transcript-language preference with explicit unavailable-track errors.
- Add contextual product JSON downloads with redaction, captured page context, field provenance and missing-data warnings. Read standard Product metadata and whitelisted Alibaba product fields; do not claim complete AliExpress or Temu support.

- Put screenshot actions above the preview. Avoid a duplicate starting-position wait and reuse unedited, already-redacted PNGs for full-image copy and ZIP export. Re-encode parts with manual masks.

- Separate installable files in `extension/`, checks in `tests/`, and guides in `docs/`. Add a concise README and workflow infographic.
- Copy complete screenshots automatically. Preserve masks, multipart coordinates, part copy, PNG exports, and ZIP exports. Oversized copies fail explicitly and preserve the previous clipboard.
- Make captures clipboard-only by default. Clear the former default-on history cache. Optional text history expires after 14 days through local alarms and read-time cleanup.
- Restore native popup sizing, clipboard writes after focus loss, and page position after capture. Keep the purple popup fixed at 460 × 400.
- Preserve shared-name form controls, visible alerts, full labelled textareas, and redacted shadow-field values. Read supported menu choices and close probe-created portals.
- Preserve repeated Upwork job details in structured records with primary URLs. Keep skill links separate.
- Hide fixed overlays in open shadow roots. Preserve sticky containing blocks. Respect visibility and clipping when computing screenshot masks.
- Keep empty contact labels intact while preserving credential redaction. Round manual masks outward to prevent transparent edges.
- Support current and older YouTube transcript layouts. Add live transcript and ten-site clipboard checks.
- Add native popup, exact production permission, history expiry, and screenshot regressions. Run deterministic tests and packaging in CI.

Installed-toolbar acceptance is pending. This candidate is not a stable release.

## 1.2.0

- Add a purple light or dark popup, local Lucide icons, Manrope typography, keyboard focus, and consistent padding. The original popup size was 400 × 600.
- Add full current-text preview, recopy, and download beyond the history cap.
- Add keyboard masks and a ZIP export containing all reviewed screenshot parts.
- Remove unused screenshot-cache settings.
- Clarify optional AI, provider permissions, local key storage, and charges. Clear credentials when the provider destination changes.
- Reject invalid profile types. Apply privacy checks before truncation and extend provider timeouts through response bodies.
- Add regression tests and packaging. Document the live transcript and installed-profile verification gaps.

Skim continues Peter Coles' MIT-licensed capture project. The original copyright remains in [LICENSE](../LICENSE).
