# Contributing

Use Node 22 or later. Install development tools with `npm ci`, then `npx playwright install chromium`. Run `npm test` before proposing changes and `npm run package` to create an unpacked-extension ZIP in `dist/`.

The extension has no build step or runtime package dependencies. Load the repository root through Chrome's **Load unpacked** action. Reload the extension after editing source files.

For bug fixes, reproduce the failure and add a focused regression check to the existing scripts. Keep automatic privacy checks and human review separate. Do not replace native Chrome API tests with mocks and describe them as installed-toolbar verification.

Report the OS, Chrome version, Skim version, action used, expected result and observed result. Prefer a minimal public reproduction page with synthetic data. Never attach private captures, credentials, cookies, account pages or unsanitized logs.

See [testing evidence and limitations](TESTING.md) and [security reporting](SECURITY.md).
