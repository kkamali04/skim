# Give your agent page context

## Share text and links

1. Open the page you want help with.
2. Expand relevant descriptions or sections.
3. Click Skim and keep its popup open.
4. Inspect the text preview and coverage warnings.
5. Paste into your agent with **Ctrl+V** and add your question.

Opening Skim runs your default action. The initial default copies page text. Captures include supported form controls and menu choices without selecting values.

To save the current text, click **Save text**. The download contains the captured output, including its coverage limits.

## Share a layout

1. Click **Take Screenshot**.
2. Wait for capture to finish. Skim copies the full image automatically.
3. Inspect the preview before sharing it.
4. To hide another area, drag a mask or use the keyboard coordinate controls.
5. After an edit, click **Copy full image**.
6. Paste the image into an app that accepts images.

For a multipart capture, **Copy this part** copies one part. **Save part · PNG** exports one file. **Save all reviewed parts · ZIP** exports every part with its masks.

If the full image exceeds the clipboard limit, use the part controls or ZIP. Skim reports the failure and preserves the previous clipboard.

## Share code or a transcript

To give an agent markup and styles, select **Settings → Copy mode → Code**, then capture the page again.

On a YouTube video, Skim tries the native transcript by default. If the transcript fails, open **Show transcript** on YouTube and retry. **Skim page normally** is an explicit alternative.

**Settings → Transcript language** is optional. Leave it blank for YouTube’s current language, or enter an exact native menu label. If the layout has no language picker, the requested track is unavailable, or it cannot finish loading, Skim stops and preserves your clipboard. It does not translate audio.

## Check capture status

The result shows known capture warnings. **Partial capture** names a detected gap. **Captured · limited** means accessible page content was collected, with hidden or unloaded details still outside its coverage. **Transcript captured** means the panel end was reached; captions are not checked against audio. Failed captures show a reason.

## Save product context

On recognized shopping pages, or pages with product metadata, **Save product details · JSON** downloads available prices, variants, specifications, supplier details, image/video links and visible review candidates alongside the captured page context. Redaction follows your setting. The file includes missing fields and coverage warnings.

This is a partial snapshot of the open product page, not a catalog crawl or a promise of every variant or review. Image files are not downloaded. DOM fallbacks can include related assets; inspect candidate records before using them. Alibaba bootstrap data and standard Product metadata are supported; AliExpress and Temu require readable product data and may block access or require login. Their full-detail exports remain unverified.

## Choose what to retain

Captures are clipboard-only by default. Closing the popup discards its screenshot preview. Files you explicitly save remain on disk.

To retain text captures, enable **Save text history** in Settings. History expires after 14 days. Turning history off clears it.

Optional [AI summaries](ai-summaries.md) shorten text before copying. They are not needed to give an agent context.
