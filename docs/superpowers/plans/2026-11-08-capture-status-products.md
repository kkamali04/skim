# Capture status, transcript language and product export

Goal: make capture limits visible, allow native transcript-language selection, and download product context from the current page without expanding the main UI on unrelated sites.

Execution: inline in this session. Preserve fixed popup dimensions, clipboard-only defaults, redaction and installed-folder identity. No provider or new dependency.

## 1. Capture status

Files: extension/popup.js, popup.html; tests/verify-exports.cjs and verify-e2e.cjs.
Add a pure captureStatus(text) helper. Unknown coverage stays limited. Explicit warnings and unparsed transcript observations produce partial status. Reached transcript end means transcript captured, never audio verified. Add a result status and explicit failure heading; screenshot completion refers to captured area. Test with `assert.match(captureStatus('CAPTURE WARNING: main scroll limit reached'), /Partial/)` and actual popup DOM.

## 2. Transcript language

Files: extension/youtube.js, api.js, popup.js, popup.html; tests/verify-youtube.cjs and verify-e2e.cjs.
Default `transcriptLanguage: ''` means native current language. Settings accepts an exact native language label. Pass it as an executeScript argument. Select only an exact item in the transcript's native menu, wait for the selected language, and fail without clipboard writes if unavailable. Exercise default, exact match, switching, unavailable and malformed segments in fixtures, then inspect an unsigned-in live video. No translation or separate transcript provider.

## 3. Product export

Files: extension/products.js, popup.js, popup.html, api.js, scripts/package.cjs; tests/verify-products.cjs and native E2E.
Use a self-contained read-only extractor in the page world: Schema.org Product/ProductGroup JSON-LD, Alibaba's known product data and conservative product DOM fields. Return an explicit schema with source URL, capture time, source methods, title, identifiers, offers, variants, specs, supplier, image links and missing-data warnings. Never export arbitrary bootstrap/account state, input values or credentials. No bulk crawling, forced variant changes, asset fetching, login bypass or purchase actions. Apply existing redaction before JSON download. Expose a contextual product button on recognized commerce pages; unavailable extraction is an explicit failure. Test malformed JSON, arrays/graphs, variants, redaction, unsafe URLs, bounds and actual JSON download. Live merchant restrictions must be recorded as unsupported/unverified, never PASS.

## Delivery

Run npm test and npm run package. Verify focused live cases. Back up and guard old-commit installed files before mirroring. Update guides and handoff with evidence and remaining limits; commit/push tested source. Keep stable publication held for installed-toolbar acceptance.
