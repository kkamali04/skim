# Develop Skim

Use Node 22 or later. Run these commands from the repository root:

```sh
npm ci
npx playwright install chromium
npm test
npm run package
```

Load **`extension/`** with Chrome's **Load unpacked** action. Reload the extension after source edits. There is no runtime build step or package dependency.

| Folder | Contents |
| --- | --- |
| `extension/` | Installable Chrome files and bundled assets. |
| `tests/` | Regression checks and opt-in live-site checks. |
| `scripts/` | Release packaging. |
| `docs/` | User guides, reference pages, and artwork. |

To inspect the layout, run `git ls-tree --name-only HEAD`.

For a bug fix, reproduce the failure before changing code. Add a regression to an existing check, then run the affected tests and full suite.

Keep test boundaries clear. A mocked response, a disposable browser, and a click in the installed toolbar prove different things. See [Testing](docs/testing.md).

For bug reports, include the OS, Chrome version, Skim version, action, expected result, and observed result. Use a public reproduction with synthetic data. Exclude private captures, cookies, credentials, and unsanitized logs.

Follow [Release Skim](docs/releasing.md) for packaging and [Security reporting](SECURITY.md) for vulnerabilities.
