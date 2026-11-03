# Clipboard and Form Capture Implementation Plan

> For agentic workers: execute these steps inline, one confirmed issue at a time, using the existing systematic-debugging workflow. No delegation or new dependency is needed.

**Goal:** Capture this proposal form accurately and make screenshots copy automatically without saving captures by default.

**Architecture:** Reuse `page.js` extraction, `api.js` native clipboard/canvas handling, `popup.js` review/export and local history, and the existing service worker. Preserve the complete screenshot's part coordinates when combining it for one PNG clipboard item. Keep screenshot previews in popup memory only. Optional text history uses a 14-day TTL and Chrome's local alarm cleanup.

**Tech stack:** Plain JavaScript, MV3 Chrome APIs, existing Playwright checks.

## 1. Proposal form extraction

- [x] Add a failing browser fixture in `verify-privacy.cjs`: two `div[role=combobox][aria-controls]` controls without `aria-haspopup`, with options created on ArrowDown; a textarea identified only by `aria-labelledby` containing more than 120 characters; and a sensitive textarea label.
- [x] In `page.js`, probe `[role="combobox"]`, include legacy keyboard key codes, associate options with the control's listbox, and report unavailable options. Preserve current values, menu state, focus and scroll position. Include `aria-labelledby` in textarea identity and sensitive-field labels. Capture textarea text up to 12,000 characters with an explicit truncation marker.
- [x] Run `node verify-privacy.cjs`; repeat the same checks through the native extension clipboard in `verify-e2e.cjs`.

## 2. Complete automatic screenshot copy

- [x] In `api.js`, return existing screenshot part bounds as the capture callback's second argument. Add a shared PNG combiner for those bounds; reject invalid layouts or images beyond a 32M-pixel/32767-dimension budget before writing any partial clipboard image.
- [x] In `popup.js`, retain those bounds with the preview bitmaps. Reuse the opaque-mask renderer and complete ZIP export loop to copy the complete image automatically after capture. Provide explicit full-image recopy and individual-part copy, and leave preview/export available if automatic copying fails.
- [x] In `popup.html`, describe automatic copying and manual recopy after edits. No automatic file download or screenshot storage.
- [x] Extend `verify-e2e.cjs` to read PNG clipboard dimensions/pixels immediately after capture, including a real 9,000px multipart capture, all-part manual masks, horizontal layouts and rejection without overwriting the previous clipboard. Count downloads and inspect capture storage.
- [x] Extend `verify-action.cjs` to verify automatic PNG copy from Chrome's actual native action popup using a disposable manifest with explicitly documented test-only capture permission.

## 3. Clipboard-only default and optional expiring text history

- [x] Make history default off in `popup.js`. Migrate the former default-on policy once, clearing only Skim's cached capture history and preserving settings/provider keys. Turning history off also clears cached entries.
- [x] Keep the existing opt-in text history limited to 20 entries and 14 days. Prune on read and use an hourly `chrome.alarms` cleanup in `background.js`; add the local scheduling permission to `manifest.json`.
- [x] Test migration/default storage, explicit opt-in, expiration and a real native alarm deleting expired synthetic entries while preserving unexpired entries. Screenshots remain memory-only.

## 4. Delivery

- [ ] Run `npm test`, syntax/diff checks and packaging. Update README, privacy/testing notes and changelog to distinguish image clipboard, optional text history and manual downloads.
- [ ] Back up and mirror only changed runtime files into the original unpacked folder. Push tested source, verify CI and byte-audit the CI ZIP before replacing only the unpublished draft.
- [ ] Report exact findings from the supplied capture, what the browser tests prove, and any remaining installed-profile acceptance. No proposal submission, changed form values, provider spending or stable publication.
