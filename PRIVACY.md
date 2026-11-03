# Privacy

Skim has no analytics, hosted backend or automatic upload service. Fonts and SVG icons ship with the extension.

## Local capture

Opening Skim starts the configured capture on the active page. Text/code and screenshots copy automatically to your clipboard. Screenshots use the current automatic-redaction setting and remain in popup memory for optional manual masks. Add masks and copy again to replace the clipboard with the edited image. Closing the popup discards the preview. There is no persistent screenshot cache or automatic download. Your OS or clipboard manager may retain copied content.

Text history is off by default. If explicitly enabled, it is stored in `chrome.storage.local`: 20 entries by default, a 14-day lifetime, and a 100,000-character cap per entry with an explicit truncation warning when re-copied. Expired entries are removed on read and by an hourly local Chrome alarm, including after Chrome resumes from sleep. Turning history off clears cached text. This update resets the old default-on policy and clears old cached captures; provider keys/settings remain. Current text preview/download is independent of the history cap. Manually downloaded files are user exports and are not deleted by the history cleanup.

## Redaction

Automatic redaction is best effort. It recognizes common credential and personal-data patterns and masks screenshot input fields and recognized text. It does not perform OCR or understand every secret. Images, closed shadow roots and inaccessible frames can contain material it cannot inspect. Review screenshots, add opaque masks and inspect text before sharing. Disabling redaction can expose page content in exports and local history.

## Optional AI summarization

AI is off by default. Enabling it requests access to the selected provider origin. In text mode, with a key configured, Skim sends captured text to that HTTPS endpoint for summarization. The redaction setting applies before sending; if disabled, text is sent without Skim's redaction. Provider retention, pricing and model availability depend on your account and provider. Summaries may omit information. Screenshots, code captures and YouTube transcript captures do not use this summarization path.

The provider Test button sends a small test prompt and may incur API charges. Switching provider/base URL clears saved credentials and turns summarization off. Provider failures fall back to raw captured text with an explicit warning. Turning AI off stops automatic provider calls; it does not revoke Chrome's previously granted host permission. You can remove that access in Chrome's extension settings.

API keys are stored locally, without application-level encryption; they are not synced. Do not paste them into public issues or profile examples. The optional local vault button contacts a separately configured service at `http://127.0.0.1:8766` after a permission request. Skim does not install or secure that service.

## Permissions

| Permission | Purpose |
| --- | --- |
| `activeTab`, `scripting` | Read/capture the page you invoke Skim on. Restricted Chrome pages cannot be captured. |
| `clipboardWrite` | Copy text or a reviewed PNG. Production does not request clipboard read access. |
| `storage`, `unlimitedStorage` | Local settings and optional capture history. |
| `alarms` | Local hourly deletion of expired optional text history; no website access. |
| Optional HTTPS host access | Selected AI provider only when requested; not a blanket grant on install. |
| Optional localhost access | User-invoked external vault bridge. |

The manifest's optional HTTPS wildcard allows a custom provider origin to be requested. Skim requests the chosen origin at runtime, not every HTTPS website. Capture coverage reports inaccessible frames rather than treating them as successfully read.
