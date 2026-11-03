# Privacy

Skim has no analytics, hosted backend, or automatic upload service. Fonts and icons ship with the extension.

## Captures stay local by default

Opening Skim starts the configured action. Captured text and screenshots copy to the clipboard. The OS or a clipboard manager may retain that content.

Screenshot previews stay in popup memory until the popup closes. There is no persistent screenshot cache or automatic download. Manual exports remain where you save them.

Text history is off by default. When enabled, `chrome.storage.local` retains 20 entries by default for 14 days. Each entry has a 100,000-character cap with truncation warnings. Current text preview and download do not use that history cap.

Expired entries are removed on read and by an hourly local alarm. Missed cleanup runs when Chrome resumes. Turning history off clears cached text. The migration from the former default-on policy clears old captures while preserving settings and provider keys.

## Redaction has limits

Skim detects common credential and personal-data patterns. Screenshot redaction masks visible fields and recognized text within their clipping bounds.

Redaction has no OCR and cannot identify every secret. Images, closed shadow roots, and inaccessible content can contain private information. New manual masks do not change an image already copied to the clipboard. A fresh copy applies those edits.

Disabling redaction can expose private content in captures, history, exports, and optional AI requests.

## AI sends text only when enabled

AI summaries are off by default. When enabled with a key, text mode sends captured page text to the chosen HTTPS provider. The redaction setting applies before sending.

Screenshots, page code, and YouTube transcripts do not use the summary path. Provider pricing and retention policies apply to summaries. **Test provider** sends a small prompt and may incur charges.

Provider failures copy raw captured text with a warning. Changing the provider or base URL clears the key and turns AI off. Turning AI off stops automatic requests but does not revoke Chrome's existing host permission.

API keys remain local, without application-level encryption or sync. The optional vault button contacts a separately configured service at `http://127.0.0.1:8766` after a permission request. Skim does not install or secure that service.

## Permissions

| Permission | Purpose |
| --- | --- |
| `activeTab`, `scripting` | Capture the page where you invoke Skim. |
| `clipboardWrite` | Copy text and PNGs. Production has no clipboard-read permission. |
| `storage`, `unlimitedStorage` | Store settings and optional text history. |
| `alarms` | Delete expired optional history locally. |
| Optional HTTPS access | Contact the provider origin you approve. |
| Optional localhost access | Contact the external vault bridge you invoke. |

The optional HTTPS wildcard permits custom provider origins. It is not a grant to every HTTPS website on installation. Capture exports report inaccessible frames as a coverage limit.
