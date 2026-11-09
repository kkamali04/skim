# Third-party notices

Skim is an independent derivative of Peter Coles' [full-page capture extension](https://github.com/mrcoles/full-page-screen-capture-chrome-extension). The original MIT copyright remains in [LICENSE](../LICENSE).

| Asset | Source and license |
| --- | --- |
| Lucide SVGs | Version 0.468.0. [ISC notice](../extension/assets/LUCIDE-LICENSE) and [Feather MIT notice](../extension/assets/FEATHER-LICENSE). |
| Toolbar artwork | Uses Lucide's scan-text glyph. Editable SVGs are in [brand/](brand/). |
| Manrope | [SIL Open Font License 1.1](../extension/assets/MANROPE-OFL.txt). |
| Workflow infographic | AI-generated illustration. [Generation prompt](brand/infographic-prompt.txt). |

The font and runtime icons are bundled locally. Their pinned source revisions are in [asset sources](../extension/assets/SOURCES.md).

Playwright is a development dependency. Its license ships with the installed package, which is excluded from the extension ZIP.

## Cogent Browser Agent

Product extraction adapts Cogent’s embedded JSON parser, lazy image URL collection, image scoring and DOM extraction patterns. Copyright 2026 Kian and Cognesia Inc.; [MIT license](../extension/assets/Cogent.LICENSE.txt). The browser agent, provider integration and broader permissions are not included.
