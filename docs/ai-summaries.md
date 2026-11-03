# Use optional AI summaries

Leave AI off to copy page context locally and paste it into any agent yourself.

To shorten page text before copying:

1. Open **Settings → AI summarization**.
2. Choose a provider or enter an HTTPS OpenAI-compatible base URL.
3. Enter a model and API key.
4. Enable summarization and approve access to the selected provider origin.

**Test provider** sends a small prompt. The test and later summaries may incur provider charges.

Moonshot, Z.ai, and OpenRouter are editable presets. Model availability depends on your provider account.

Only page-text summarization sends captured content to the provider. Screenshots, page code, and YouTube transcripts do not use this path. If a summary fails, Skim copies the raw captured text and shows a warning.

Changing the provider or base URL clears the saved key and turns AI off. Turning AI off stops automatic requests but does not revoke an existing Chrome permission. Remove that access in Chrome's extension settings.

Summaries can omit details. Use local capture when you need the captured wording. Read [Privacy](privacy.md) before sending sensitive pages.
