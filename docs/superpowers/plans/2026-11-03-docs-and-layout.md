# Skim docs and repository layout implementation plan

> **For agentic workers:** Execute these steps inline. Use the linked technical-writing and unslop standards. Preserve runtime behavior and keep the stable release unpublished while installed acceptance is pending.

**Goal:** Explain why to give an AI page context, add one workflow infographic, and separate installable files from development files.

**Architecture:** `extension/` contains the unchanged Chrome runtime and its assets. `tests/` contains the existing checks, `scripts/` contains packaging, and `docs/` contains task guides and reference pages. The release ZIP retains its existing root manifest and runtime paths.

**Tech stack:** Chrome MV3, Node, Playwright, Markdown, built-in image generation.

## Steps

- [x] Create `docs/images/skim-workflow.png` with built-in image generation. Inspect text and the click-then-paste workflow. Save the exact prompt in `docs/brand/infographic-prompt.txt`.
- [x] Move the runtime and bundled assets into `extension/`, existing checks into `tests/`, source icon SVGs into `docs/brand/`, and detailed reference docs into `docs/`. Update test source paths, output paths, npm commands, and `scripts/package.cjs`. Leave extension-internal paths unchanged.
- [x] Rewrite `README.md` as a short explanation with a hook, the infographic, practical uses, install and guide links, and truthful release status. Rewrite usage, coverage, privacy, testing, release, contribution, and notice pages using short sentences. Preserve license text and historical facts.
- [x] Run `npm test` and `npm run package`. Verify every ZIP entry against the previous runtime and check Markdown links and image paths. Render the README for wide and narrow browser inspection. Run `npm run test:sites-live` against the new folder paths.
- [ ] Scan the staged diff for secrets, commit and push the scoped changes, and require passing CI. Audit the new CI ZIP and refresh only the private release draft. Record source-layout changes in the handoff. Do not treat source moves or passing automation as installed acceptance.

## Checks

`npm test` must retain native popup, permission-denial, clipboard, stitching, mask, transcript, and export assertions. `npm run test:sites-live` must still write ignored results to the project-level `test-results/live-sites/`. The package must contain the same runtime files as before, with `manifest.json` at the ZIP root and no docs, tests, or generated infographic.
