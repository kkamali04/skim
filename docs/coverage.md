# What Skim can read

Skim captures browser-readable context from the current page. A capture is not a crawl of the whole website.

| Context | Included when accessible | Limits |
| --- | --- | --- |
| Page text | Rendered text, links, supported form values, permitted frames, and open shadow roots | Hidden, unloaded, conditional, or virtualized content can be missing. |
| Form choices | Native select options and supported ARIA menu choices | Some menus cannot be opened or read. The export reports unavailable choices. |
| Page code | Markup, accessible styles, computed layout, and asset references | Inaccessible stylesheets and application source code are not recovered. |
| Screenshots | A full page or its main scroll pane | Fixed overlays are hidden. Changing layouts can fail. Large images use parts. |
| YouTube | Native transcript text, timestamps, and links | Some videos or profiles do not provide a readable transcript. |

Chrome blocks capture on internal pages, its Web Store, and some documents. Closed shadow roots, inaccessible frames, and text drawn in images or canvas can be unreadable.

Text exports report coverage and truncation. Labelled textareas retain up to 12,000 redacted characters. Recognized linked records are limited to 200, with the full collected link list retained separately.

Redaction detects common patterns. It has no OCR and cannot identify every secret. Screenshot masks added after automatic copying require a fresh copy.

Ten public-site cases passed on November 3, 2026. That result does not prove universal support or final installed-toolbar acceptance. See [Testing](testing.md).
