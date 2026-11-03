# Release Skim

1. Reproduce each confirmed bug with a failing regression before fixing it.
2. Run `npm ci` and `npx playwright install chromium`.
3. Run `npm test` and inspect its browser evidence.
4. Run `npm run test:sites-live` and investigate each failure.
5. Require a passing CI run for the candidate commit.
6. Test the installed toolbar with the production manifest. Copy text, then paste it into Notepad. Take a screenshot, then paste into Paint without another Copy click. Confirm the page position is restored. Check form choices, manual-mask recopy, and clipboard-only storage. A reload alone is insufficient.
7. Update `extension/manifest.json`, `package.json`, and the lockfile together when changing versions.
8. Run `npm run package`.
9. Inspect the ZIP contents, license files, and secret scan. Compare the packaged runtime with the tested commit. Exclude tests, docs, private captures, profiles, and dependencies.
10. Keep the release as a draft while acceptance is incomplete.
11. After acceptance, publish the release. Download its public ZIP and verify its SHA256 against the tested artifact.

The ZIP has `manifest.json` at its root. A source checkout loads from `extension/`.

When changing transcript extraction, also run `npm run test:youtube-live`. Record site restrictions as failures or limits. Do not bypass them or silently substitute page text.

Real provider tests are optional and may incur charges. Synthetic provider tests do not certify account access, models, pricing, or retention. Keep those claims separate.
