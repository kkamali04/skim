# Testing

## Reproduce locally

```sh
npm ci
npx playwright install chromium
npm test
npm run package
```

No production API key is required. The provider tests use synthetic responses. `npm run test:youtube-live` is a separate network diagnostic and can fail because of YouTube's current response; it is not part of deterministic CI.

## What the checks prove

| Check | Evidence |
| --- | --- |
| `verify-links.cjs` | Link normalization, accessible labels, safe schemes and frame link recovery. |
| `verify-provider.cjs` | Permission/HTTPS gates, response-body timeouts, credential clearing on destination change, typed profile JSON. Provider transport is stubbed. |
| `verify-exports.cjs` | ZIP entries, bytes, CRC32 known vector, central directory, empty archive and size validation. |
| `verify-privacy.cjs` | Browser DOM extraction and redaction, private-key truncation boundaries, metadata and iframe labels. Thirty current Upwork-shaped cards retain repeated details. Proposal fixtures cover ARIA menus without aria-haspopup, legacy keyboard events, unchanged selections, aria-labelledby textareas and full redacted values. |
| `verify-capture.cjs` | Browser scroll orchestration, nested crop, restoration and failed-tile handling with simulated tile messages, including fixed overlays inside nested open shadow roots. |
| `verify-youtube.cjs` | Legacy renderer, earlier view-model and current native view-model layouts: timestamp links, every fixture segment and scroll restoration. |
| `verify-permissions.cjs` | Exact production manifest in a fresh Chrome profile: native popup registration; no installed host/clipboard-read grants; scripting, screenshot and provider network access denied without permission. A real local alarm deletes expired synthetic history while preserving unexpired entries. |
| `verify-action.cjs` | A real native action popup opened with `chrome.action.openPopup()` in a disposable profile. Tests the 460 × 400 viewport/body, production extraction defaults, scroll/focus restoration, real text clipboard readback and automatic complete PNG copy without another Copy click. Background text/code capture runs with Playwright's forced focus disabled and a clipboard-restricted captured page. |
| `verify-e2e.cjs` | An isolated unpacked Chromium extension exercising actual scripting, capture, storage, PNG clipboard and downloads. Checks proposal dropdown/textarea clipboard contents, history-off migration, no automatic downloads/persistent capture cache, automatic complete multipart images, masks, horizontal part layouts and oversized-copy failure without overwriting the clipboard. Full text/ZIP exports, stitching pixels, keyboard controls and the fixed frame remain checked. |

E2E fixtures also cover native transcript controls, scrolling, timestamp records and failure without clipboard replacement. They are controlled DOM fixtures, not live YouTube acceptance.

The Upwork capture audit found 30 job titles and 30 direct job URLs in the user's pasted export, but no structured record section. Read-only inspection of the same live feed found 27 payment-verified labels; the deduplicated text contained just one. Current feed cards use `section[data-ev-sublocation="job_feed_tile"]`, which the old record extractor missed. A failing 30-card regression reproduced the gap. Native extension fixtures check that per-job records reach the clipboard with repeated metadata and redaction intact. Screenshot fixtures also check actual pixels behind nested shadow-root overlays, which the old overlay scan missed. These checks do not verify full job-detail pages or replace a fresh installed-profile capture.

## Important boundaries

`verify-e2e.cjs` opens the extension popup in a separate test window and disables dropdown probing except in the dedicated proposal fixture. Its disposable manifest adds fixture host access and clipboard read permission. Only its active-tab lookup is redirected to the fixture tab; production has neither those host grants nor clipboard read permission. This test alone previously missed actual native-popup sizing and focus failures.

`verify-action.cjs` uses Chrome's real native action popup and production extraction defaults without redirecting tab lookup. Its disposable manifest grants all-site capture access and clipboard readback solely for the test. `openPopup()` does not grant `activeTab`, so this still does not prove a physical toolbar gesture or a permission prompt in the user's installed profile. Use `node verify-action.cjs --headed` to inspect the same test in a visible disposable browser.

The proposal-page paste omitted all eight rate-increase choices and its aria-labelledby Cover Letter textarea. Live menu inspection verified the frequency and percentage choices without changing either value; synthetic fixtures reproduce their exact control structure. No proposal was submitted. A fresh installed-profile capture must still confirm the updated extractor. Screenshots now copy automatically at the user's request; current automatic redaction applies first, and subsequent manual masks require recopying.

Installed-profile acceptance failed on November 2, 2026: the user supplied a real “Document is not focused” clipboard error and reported scrolling jitter and a narrow/tall popup. The new regression reproduced a 25px native popup width, incomplete scroll restoration, and failed clipboard writes from an actually unfocused extension document. These failures invalidate prior readiness claims. The stable release remains unpublished while repairs await installed-profile acceptance.

On November 2, 2026, investigation found a current native `transcript-segment-view-model` layout with different timestamp/text classes. Skim previously missed those readable segments. A failing regression reproduced the problem, and the minimal selector fix passed all three layout variants plus the native extension clipboard path. A fresh unsigned-in live browser then captured 110 segments (19,051 characters), from 0:07 to 15:01, on Stanford's public 2005 Steve Jobs commencement video (`UF8uR6Z6KLc`), reaching the transcript panel's stable end. This is live DOM extraction evidence, not verification against audio or a claim that every video works.

The connected regular Chrome profile also showed a YouTube ad-blocker restriction, and native transcript requests for another video returned HTTP 400. Skim does not bypass site restrictions or change the browser's ad blocker. A third-party transcript extension's output is not evidence that Skim read YouTube's native transcript. The unsigned-in diagnostic records only response status and public error details; it does not inspect the user's session headers.

Before treating a release as fully accepted in your installed profile, load/reload it and verify the real toolbar on a public long page, review/copy/download a screenshot, try provider access with the real Chrome prompt if you want AI, and try a live YouTube video whose native transcript loads. Do not equate the automated suite or CI badge with those checks.

## Privacy of test evidence

Fixtures contain synthetic personal data and test credentials specifically to verify redaction. `test-results/`, temporary profiles and downloaded captures are ignored. Documentation screenshots use only synthetic fixtures.

## Continuous integration

The GitHub Actions workflow is active in `.github/workflows/test.yml`. It runs on Ubuntu with Node 22, installs Chromium, executes the deterministic tests and packages the runtime. Live YouTube remains a separate diagnostic because site availability is outside the deterministic suite.
