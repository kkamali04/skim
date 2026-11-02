# Releasing Skim

1. Reproduce confirmed bugs with a failing regression before fixing them. Keep production runtime changes small.
2. Run `npm ci`, `npx playwright install chromium` and `npm test`. Inspect the browser evidence and require a passing GitHub Actions run for the candidate commit.
3. Check the exact production manifest separately from the privileged disposable E2E fixture. A real installed-toolbar click must successfully capture text and review/copy/paste a screenshot before promoting a candidate to stable. Loading/reloading the extension alone is insufficient evidence.
4. Run the separate live transcript diagnostic when changing YouTube extraction. Site restrictions are not a reason to bypass access controls or silently substitute page text.
5. Update manifest/package versions and the lockfile together. Chrome requires a numeric manifest version; retain existing published versions and tags.
6. Run `npm run package`. Inspect the ZIP's runtime-file list, asset licenses and secret scan. Exclude private captures, profiles, credentials, local notes and development dependencies.
7. Publish a preview or draft while acceptance remains incomplete. Publish stable only after its required checks pass. Download the public asset and compare its SHA256 with the tested local ZIP.

The deterministic provider suite uses synthetic responses and native permission-denial checks. It needs no paid provider account or real key; it does not certify provider pricing, models or account entitlement. Real display hardware and site-specific restrictions can differ from emulated browser fixtures. Record those limits honestly in release notes.
