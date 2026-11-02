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
| `verify-privacy.cjs` | Browser DOM extraction and redaction, private-key truncation boundaries, metadata and iframe labels. |
| `verify-capture.cjs` | Browser scroll orchestration, nested crop, restoration and failed-tile handling with simulated tile messages. |
| `verify-youtube.cjs` | Legacy renderer, earlier view-model and current native view-model layouts: timestamp links, every fixture segment and scroll restoration. |
| `verify-permissions.cjs` | Exact production manifest in a fresh Chrome profile: native popup registration; no installed host/clipboard-read grants; scripting, screenshot and provider network access denied without permission. |
| `verify-e2e.cjs` | An isolated unpacked Chromium extension exercising actual scripting, capture, storage, PNG clipboard and downloads. Pixel checks cover nested stitching, ordinary horizontal overflow, part seams, input masks and manually reviewed masks. Full text downloads and all-part ZIPs are read back. Keyboard controls and the fixed 400 × 600 popup are checked. |

E2E fixtures also cover native transcript controls, scrolling, timestamp records and failure without clipboard replacement. They are controlled DOM fixtures, not live YouTube acceptance.

## Important boundaries

The automated E2E test opens the extension popup in a separate test window. Its disposable manifest adds fixture host access and clipboard read permission. Only its active-tab lookup is redirected to the fixture tab; production has neither those host grants nor clipboard read permission. Consequently, passing E2E does not prove the actual installed toolbar's `activeTab` gesture or Chrome permission prompt works in a particular user's profile.

On November 2, 2026, investigation found a current native `transcript-segment-view-model` layout with different timestamp/text classes. Skim previously missed those readable segments. A failing regression reproduced the problem, and the minimal selector fix passed all three layout variants plus the native extension clipboard path. A fresh unsigned-in live browser then captured 110 segments (19,051 characters), from 0:07 to 15:01, on Stanford's public 2005 Steve Jobs commencement video (`UF8uR6Z6KLc`), reaching the transcript panel's stable end. This is live DOM extraction evidence, not verification against audio or a claim that every video works.

The connected regular Chrome profile also showed a YouTube ad-blocker restriction, and native transcript requests for another video returned HTTP 400. Skim does not bypass site restrictions or change the browser's ad blocker. A third-party transcript extension's output is not evidence that Skim read YouTube's native transcript. The unsigned-in diagnostic records only response status and public error details; it does not inspect the user's session headers.

Before treating a release as fully accepted in your installed profile, load/reload it and verify the real toolbar on a public long page, review/copy/download a screenshot, try provider access with the real Chrome prompt if you want AI, and try a live YouTube video whose native transcript loads. Do not equate the automated suite or CI badge with those checks.

## Privacy of test evidence

Fixtures contain synthetic personal data and test credentials specifically to verify redaction. `test-results/`, temporary profiles and downloaded captures are ignored. Documentation screenshots use only synthetic fixtures.

## Continuous integration

The GitHub Actions workflow is active in `.github/workflows/test.yml`. It runs on Ubuntu with Node 22, installs Chromium, executes the deterministic tests and packages the runtime. Live YouTube remains a separate diagnostic because site availability is outside the deterministic suite.
