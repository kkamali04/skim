# Testing evidence

## Automated checks

Run commands from the repository root. Development requires Node 22 or later.

```sh
npm ci
npx playwright install chromium
npm test
npm run package
```

| Check in `tests/` | What it verifies |
| --- | --- |
| `verify-links.cjs` | Complete labels, safe URLs, duplicates, and frame links. |
| `verify-provider.cjs` | Permission denial, HTTPS, timeouts, key clearing, and typed settings. Provider responses are synthetic. |
| `verify-exports.cjs` | ZIP contents, bytes, CRC32, directory records, invalid input, and safe PNG reuse. |
| `verify-privacy.cjs` | Redaction, repeated records, form values, shadow fields, portal cleanup, and clipped masks. |
| `verify-capture.cjs` | Scroll orchestration, no duplicate initial wait, sticky layout, restoration, and tile failures. Tile transport is simulated. |
| `verify-youtube.cjs` | Three native transcript layouts, timestamps, links, scroll restoration and language selection/failures. |
| `verify-products.cjs` | Product graphs, variants, Alibaba field whitelist, malformed data, unsafe URLs and ambiguous listings. |
| `verify-permissions.cjs` | The exact production manifest denies capture before permission. Real alarms expire old history. |
| `verify-action.cjs` | A native popup, fixed 460 × 400 geometry, scroll restoration, unfocused text copy, automatic PNG clipboard readback, screenshot timing, and actions before the image. |
| `verify-e2e.cjs` | Real extension APIs for text, code, stitching, masks, multipart PNGs, ZIP exports, history, and transcript fixtures. |

GitHub Actions runs the deterministic suite and packages the extension. No real provider key is required.

## Live website acceptance

Run the separate public-site suite:

```sh
npm run test:sites-live
```

To select cases, run `node tests/verify-sites.cjs mdn httpbin`. Add `--headed` for a visible test browser.

| Website | Live case |
| --- | --- |
| [Example Domain](https://example.com/) | Multilingual text and image baseline. |
| [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/writeText) | Documentation, code, sticky layout, and positioned fields. |
| [Wikipedia](https://en.wikipedia.org/wiki/Clipboard_(computing)) | Long text, links, references, and multipart PNGs. |
| [Hacker News](https://news.ycombinator.com/news) | Every current story title and destination URL. |
| [Books to Scrape](https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html) | Product details, stock, image, and warning text. |
| [HTTPBin](https://httpbin.org/forms/post) | Synthetic form values, selected groups, and redaction. No submission. |
| [GitHub](https://github.com/microsoft/playwright) | Repository content, README code, and multipart capture. |
| [MUI](https://mui.com/material-ui/react-select/) | React choices and restored menu state. |
| [Shoelace](https://shoelace.style/components/select) | Open shadow roots and the selected display value. |
| [YouTube](https://www.youtube.com/watch?v=UF8uR6Z6KLc) | A native transcript copied through the extension. |

All ten cases passed on November 3, 2026. The YouTube case copied 110 segments, from 0:07 to 15:01, and reached a stable panel end. This does not verify the transcript against audio.

Ordinary-page cases compare clipboard text, sampled passages, field state, and automatic PNGs. An independent browser image supplies the pixel reference. Form masks and changed fixed or sticky regions are explicit exclusions. The form case separately checks opaque mask centers.

Results and source hashes stay in ignored `test-results/live-sites/`. A blocked page or changed layout is not a pass. Live checks stay outside CI because public sites change.

## Evidence boundaries

Browser tests use disposable profiles. Native-popup tests add test-only capture access and clipboard readback. Programmatic `chrome.action.openPopup()` does not grant `activeTab` or prove a physical toolbar click.

The broader E2E fixture opens a separate popup window and redirects its tab lookup. Most fixture cases disable menu probing. The native-popup and live-site checks cover production defaults separately.

Earlier installed tests failed on clipboard focus, scrolling, and sizing. Those repairs have regressions. Final installed-toolbar acceptance is still pending. The required check is in [Release Skim](releasing.md).

Upwork record and proposal fixtures preserve repeated details, menu choices, and labelled textareas. Earlier live inspection was read-only. No proposal was submitted. These checks do not prove hidden or collapsed job content was captured.

Some live YouTube requests return HTTP 400 or encounter profile restrictions. Skim does not bypass them. `npm run test:youtube-live` records public response status in a fresh unsigned-in browser, without user cookies or request headers.

## Test data

Fixtures use synthetic personal data and credentials. Captures, profiles, and `test-results/` are ignored. Documentation screenshots use synthetic pages. The generated workflow infographic is an illustration, not a screenshot.
