
window.CaptureAPI = (function() {

    var MAX_PRIMARY_DIMENSION = 8192,
        MAX_SECONDARY_DIMENSION = 4096,
        MAX_AREA = MAX_PRIMARY_DIMENSION * MAX_SECONDARY_DIMENSION;


    //
    // URL Matching test - to verify we can talk to this URL
    //

    var matches = ['http://*/*', 'https://*/*', 'ftp://*/*', 'file://*/*'],
        noMatches = [/^https?:\/\/chrome.google.com\/.*$/];

    function isValidUrl(url) {
        // couldn't find a better way to tell if executeScript
        // wouldn't work -- so just testing against known urls
        // for now...
        var r, i;
        for (i = noMatches.length - 1; i >= 0; i--) {
            if (noMatches[i].test(url)) {
                return false;
            }
        }
        for (i = matches.length - 1; i >= 0; i--) {
            r = new RegExp('^' + matches[i].replace(/\*/g, '.*') + '$');
            if (r.test(url)) {
                return true;
            }
        }
        return false;
    }


    function initiateCapture(tab, captureDelay, autoRedact, callback) {
        chrome.tabs.sendMessage(tab.id, {
            msg: 'scrollPage',
            captureDelay: captureDelay || 200,
            autoRedact: autoRedact !== false
        }, function(result) {
            callback(result, chrome.runtime.lastError && chrome.runtime.lastError.message);
        });
    }


    function capture(data, windowId, screenshots, sendResponse, splitnotifier, _retry) {
        _retry = _retry || 0;
        chrome.tabs.captureVisibleTab(
            windowId, {format: 'png'}, function(dataURI) {
                if (chrome.runtime.lastError) {
                    var msg = chrome.runtime.lastError.message || '';
                    // Chrome rate-limits captureVisibleTab to 2/sec.
                    // Back off and retry rather than failing outright.
                    if (msg.indexOf('MAX_CAPTURE') !== -1 && _retry < 6) {
                        var backoff = 500 + _retry * 250; // 500, 750, 1000, 1250, 1500, 1750ms
                        window.setTimeout(function() {
                            capture(data, windowId, screenshots, sendResponse, splitnotifier, _retry + 1);
                        }, backoff);
                        return;
                    }
                    console.error('[Skim] captureVisibleTab error:', msg);
                    sendResponse(null);
                    return;
                }
                if (!dataURI) {
                    console.error('[Skim] captureVisibleTab returned no data');
                    sendResponse(null);
                    return;
                }
                var image = new Image();
                image.onload = function() {
                    try {
                        var scale = image.width / data.windowWidth;
                        var crop = data.crop || {left:0, top:0, width:data.windowWidth, height:image.height/scale};
                        var tile = document.createElement('canvas');
                        tile.width = Math.round(crop.width * scale);
                        tile.height = Math.round(crop.height * scale);
                        var ctx = tile.getContext('2d');
                        ctx.drawImage(image, crop.left * scale, crop.top * scale,
                            tile.width, tile.height, 0, 0, tile.width, tile.height);
                        // Mask the source tile BEFORE stitching so overlap cannot reveal an earlier mask.
                        ctx.fillStyle = '#000';
                        (data.redactZones || []).forEach(function(z) {
                            ctx.fillRect(Math.floor((z.left-crop.left)*scale), Math.floor((z.top-crop.top)*scale),
                                Math.ceil(z.width*scale), Math.ceil(z.height*scale));
                        });
                        if (!screenshots.length) {
                            Array.prototype.push.apply(screenshots,
                                _initScreenshots(Math.ceil(data.totalWidth*scale), Math.ceil(data.totalHeight*scale)));
                            if (screenshots.length > 1 && splitnotifier) splitnotifier();
                        }
                        var x = Math.round(data.x*scale), y = Math.round(data.y*scale);
                        _filterScreenshots(x,y,tile.width,tile.height,screenshots).forEach(function(sc) {
                            sc.ctx.drawImage(tile, x-sc.left, y-sc.top);
                        });
                        sendResponse({ok:true});
                    } catch (e) { sendResponse({error:e.message || String(e)}); }
                };
                image.onerror = function() { sendResponse({error:'Screenshot image could not be decoded'}); };
                image.src = dataURI;
            });
    }


    function _initScreenshots(totalWidth, totalHeight) {
        // Create and return an array of screenshot objects based
        // on the `totalWidth` and `totalHeight` of the final image.
        // We have to account for multiple canvases if too large,
        // because Chrome won't generate an image otherwise.
        //
        var badSize = (totalHeight > MAX_PRIMARY_DIMENSION ||
                       totalWidth > MAX_PRIMARY_DIMENSION ||
                       totalHeight * totalWidth > MAX_AREA),
            biggerWidth = totalWidth > totalHeight,
            maxWidth = (!badSize ? totalWidth :
                        (biggerWidth ? MAX_PRIMARY_DIMENSION : MAX_SECONDARY_DIMENSION)),
            maxHeight = (!badSize ? totalHeight :
                         (biggerWidth ? MAX_SECONDARY_DIMENSION : MAX_PRIMARY_DIMENSION)),
            numCols = Math.ceil(totalWidth / maxWidth),
            numRows = Math.ceil(totalHeight / maxHeight),
            row, col, canvas, left, top;

        var canvasIndex = 0;
        var result = [];

        for (row = 0; row < numRows; row++) {
            for (col = 0; col < numCols; col++) {
                canvas = document.createElement('canvas');
                canvas.width = (col == numCols - 1 ? totalWidth % maxWidth || maxWidth :
                                maxWidth);
                canvas.height = (row == numRows - 1 ? totalHeight % maxHeight || maxHeight :
                                 maxHeight);

                left = col * maxWidth;
                top = row * maxHeight;

                result.push({
                    canvas: canvas,
                    ctx: canvas.getContext('2d'),
                    index: canvasIndex,
                    left: left,
                    right: left + canvas.width,
                    top: top,
                    bottom: top + canvas.height
                });

                canvasIndex++;
            }
        }

        return result;
    }


    function _filterScreenshots(imgLeft, imgTop, imgWidth, imgHeight, screenshots) {
        // Filter down the screenshots to ones that match the location
        // of the given image.
        //
        var imgRight = imgLeft + imgWidth,
            imgBottom = imgTop + imgHeight;
        return screenshots.filter(function(screenshot) {
            return (imgLeft < screenshot.right &&
                    imgRight > screenshot.left &&
                    imgTop < screenshot.bottom &&
                    imgBottom > screenshot.top);
        });
    }


    function getBlobs(screenshots) {
        return screenshots.map(function(screenshot) {
            var dataURI = screenshot.canvas.toDataURL();

            // convert base64 to raw binary data held in a string
            // doesn't handle URLEncoded DataURIs
            var byteString = atob(dataURI.split(',')[1]);

            // separate out the mime component
            var mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];

            // write the bytes of the string to an ArrayBuffer
            var ab = new ArrayBuffer(byteString.length);
            var ia = new Uint8Array(ab);
            for (var i = 0; i < byteString.length; i++) {
                ia[i] = byteString.charCodeAt(i);
            }

            // create a blob for writing to a file
            var blob = new Blob([ab], {type: mimeString});
            return blob;
        });
    }


    function saveBlob(blob, filename, index, callback, errback) {
        filename = _addFilenameSuffix(filename, index);

        function onwriteend() {
            // open the file that now contains the blob - calling
            // `openPage` again if we had to split up the image
            var urlName = ('filesystem:chrome-extension://' +
                           chrome.i18n.getMessage('@@extension_id') +
                           '/temporary/' + filename);

            callback(urlName);
        }

        // come up with file-system size with a little buffer
        var size = blob.size + (1024 / 2);

        // create a blob for writing to a file
        var reqFileSystem = window.requestFileSystem || window.webkitRequestFileSystem;
        reqFileSystem(window.TEMPORARY, size, function(fs){
            fs.root.getFile(filename, {create: true}, function(fileEntry) {
                fileEntry.createWriter(function(fileWriter) {
                    fileWriter.onwriteend = onwriteend;
                    fileWriter.write(blob);
                }, errback); // TODO - standardize error callbacks?
            }, errback);
        }, errback);
    }


    function _addFilenameSuffix(filename, index) {
        if (!index) {
            return filename;
        }
        var sp = filename.split('.');
        var ext = sp.pop();
        return sp.join('.') + '-' + (index + 1) + '.' + ext;
    }


    function captureToBlobs(tab, callback, errback, progress, splitnotifier, captureDelay, autoRedact) {
        var loaded = false,
            screenshots = [],
            timeout = 3000,
            timedOut = false,
            done = false,       // guard: ensure cleanup runs exactly once
            windowId = tab.windowId,
            noop = function() {};

        callback = callback || noop;
        errback = errback || noop;
        progress = progress || noop;

        if (!isValidUrl(tab.url)) {
            errback('invalid url');
            return;
        }

        // Named listener so we can remove it exactly once when done.
        // The old anonymous listener was NEVER removed, so every capture
        // attempt stacked another live listener → doubled captureVisibleTab
        // calls per frame → guaranteed MAX_CAPTURE_VISIBLE_TAB quota errors.
        function onCaptureMsg(request, sender, sendResponse) {
            if (!sender.tab || sender.tab.id !== tab.id || sender.frameId !== 0 || done) return false;
            if (request.msg === 'capture') {
                progress(request.complete);
                chrome.tabs.query({active:true, windowId:windowId}, function(tabs) {
                    if (!tabs[0] || tabs[0].id !== tab.id) { sendResponse({error:'Active tab changed; capture stopped.'}); return; }
                    capture(request, windowId, screenshots, sendResponse, splitnotifier);
                });
                return true; // keep channel open for async sendResponse
            } else {
                console.error('[Skim] Unexpected msg from content script: ' + request.msg);
                finish(null, 'internal error');
                return false;
            }
        }

        function finish(blobs, err) {
            if (done) return;
            done = true;
            chrome.runtime.onMessage.removeListener(onCaptureMsg);
            if (err) { errback(err); } else {
                callback(blobs, screenshots.map(function(s) { return {x:s.left,y:s.top,width:s.canvas.width,height:s.canvas.height}; }));
            }
        }

        chrome.runtime.onMessage.addListener(onCaptureMsg);

        chrome.scripting.executeScript(
            {target: {tabId: tab.id}, files: ['privacy.js', 'page.js']},
            function() {
                if (chrome.runtime.lastError) {
                    finish(null, 'Script injection failed: ' + chrome.runtime.lastError.message);
                    return;
                }
                if (timedOut) {
                    finish(null, 'execute timeout');
                } else {
                    loaded = true;
                    progress(0);
                    initiateCapture(tab, captureDelay, autoRedact, function(result, error) {
                        if (error || !result || !result.ok) {
                            finish(null, error || result && result.error || 'Capture did not complete');
                            return;
                        }
                        try { finish(getBlobs(screenshots), null); }
                        catch (e) { finish(null, e.message); }
                    });
                }
            }
        );

        window.setTimeout(function() {
            if (!loaded) {
                timedOut = true;
                finish(null, 'execute timeout');
            }
        }, timeout);
    }


    function captureToFiles(tab, filename, callback, errback, progress, splitnotifier, captureDelay, autoRedact) {
        captureToBlobs(tab, function(blobs) {
            var i = 0,
                len = blobs.length,
                filenames = [];

            (function doNext() {
                saveBlob(blobs[i], filename, i, function(filename) {
                    i++;
                    filenames.push(filename);
                    i >= len ? callback(filenames) : doNext();
                }, errback);
            })();
        }, errback, progress, splitnotifier, captureDelay, autoRedact);
    }


    function copyBlobToClipboard(blob) {
        return new Promise(function(resolve, reject) {
            var clipboardItem = {};
            clipboardItem['image/png'] = blob;

            if (navigator.clipboard && navigator.clipboard.write) {
                navigator.clipboard.write([
                    new ClipboardItem(clipboardItem)
                ]).then(function() {
                    resolve(blob);
                }).catch(function(error) {
                    reject(error);
                });
            } else {
                reject(new Error('Clipboard API not supported'));
            }
        });
    }


    async function combineScreenshotBlobs(blobs, layout) {
        if (!blobs || !blobs.length) throw new Error('No screenshot parts generated');
        if (blobs.length === 1) return blobs[0];
        if (!layout || layout.length !== blobs.length || layout.some(function(p) {
            return !p || ![p.x,p.y,p.width,p.height].every(Number.isSafeInteger) || p.x < 0 || p.y < 0 || p.width < 1 || p.height < 1;
        })) throw new Error('Screenshot part layout is unavailable. Copy individual parts or save the ZIP.');
        var width = Math.max.apply(null,layout.map(function(p){return p.x+p.width;}));
        var height = Math.max.apply(null,layout.map(function(p){return p.y+p.height;}));
        // ponytail: bound the combined canvas to 32M pixels; larger captures retain per-part copy/ZIP.
        if (width > 32767 || height > 32767 || width*height > MAX_AREA)
            throw new Error('Full screenshot exceeds the clipboard image size limit. Copy individual parts or save the ZIP.');
        var canvas = document.createElement('canvas'); canvas.width=width;canvas.height=height;
        try {
            var ctx=canvas.getContext('2d');
            if (!ctx) throw new Error('Cannot allocate the full screenshot image');
            for (var i=0;i<blobs.length;i++) {
                var image=await createImageBitmap(blobs[i]);
                try {
                    if(image.width!==layout[i].width || image.height!==layout[i].height) throw new Error('Screenshot part dimensions changed');
                    ctx.drawImage(image,layout[i].x,layout[i].y);
                } finally {image.close();}
            }
            return await new Promise(function(resolve,reject){canvas.toBlob(function(blob){blob?resolve(blob):reject(new Error('Full screenshot PNG encoding failed'));},'image/png');});
        } finally {canvas.width=0;canvas.height=0;}
    }

    function captureToClipboard(tab, callback, errback, progress, splitnotifier, captureDelay, autoRedact) {
        captureToBlobs(tab, async function(blobs, layout) {
            try {
                var fullBlob=await combineScreenshotBlobs(blobs,layout);
                try { await copyBlobToClipboard(fullBlob); }
                catch(error) {
                    var ok=await new Promise(function(resolve){_writeImageBlobToTabClipboard(tab,fullBlob,resolve);});
                    if(!ok)throw error;
                }
                callback(blobs,layout);
            } catch(error) {errback('Clipboard copy failed: '+error.message);}
        }, errback, progress, splitnotifier, captureDelay, autoRedact);
    }

    // Write an image blob to the system clipboard via the tab context.
    // Returns cb(true) on success, cb(false) on failure.
    function _writeImageBlobToTabClipboard(tab, blob, cb) {
        // Read the blob as a data URL so we can pass it across contexts
        var reader = new FileReader();
        reader.onload = function() {
            var dataURL = reader.result;
            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: function(dataUrl) {
                    // Convert data URL back to blob, then write to clipboard
                    return new Promise(function(resolve) {
                        var parts = dataUrl.split(',');
                        var mime = parts[0].split(':')[1].split(';')[0];
                        var bin = atob(parts[1]);
                        var arr = new Uint8Array(bin.length);
                        for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
                        var blob = new Blob([arr], { type: mime });
                        var item = {};
                        item[mime] = blob;
                        navigator.clipboard.write([
                            new ClipboardItem(item)
                        ]).then(function() {
                            resolve({ ok: true });
                        }).catch(function(e) {
                            resolve({ ok: false, err: String(e && e.message || e) });
                        });
                    });
                },
                args: [dataURL],
            }, function(results) {
                var r = results && results[0] && results[0].result;
                if (r && r.ok) { cb(true); return; }
                console.warn('[Skim] Tab-context clipboard write failed:', r && r.err);
                cb(false);
            });
        };
        reader.onerror = function() {
            console.warn('[Skim] Failed to read blob as data URL');
            cb(false);
        };
        reader.readAsDataURL(blob);
    }


    // Inline extractor that runs in EVERY frame (top + cross-origin
    // iframes). Returns null from the top frame so the top-level page.js
    // result remains the authoritative top-frame snapshot. Cross-origin
    // frames return a slim {url, title, text, forms, buttons, links}
    // payload that the top frame assembles into the CROSS-FRAME section.
    function _extractFrame(autoRedact) {
        if (window.top === window.self) return null;
        try {
            var doc = document;
            var url = window.location.href;
            var title = doc.title || '';
            var body = doc.body || doc.documentElement;
            var text = ((body && body.innerText) || '').replace(/\s+/g, ' ').trim();
            var forms = [];
            doc.querySelectorAll('input, select, textarea').forEach(function(el) {
                var t = (el.type || el.tagName).toLowerCase();
                if (t === 'hidden' || t === 'password') return;
                forms.push({
                    tag: el.tagName.toLowerCase(),
                    type: el.type || '',
                    label: (el.getAttribute('aria-label') || el.placeholder || el.name || el.id || ''),
                    value: autoRedact !== false && /password|secret|token|api.?key|credit.?card|cc-number|ssn/i.test([el.name,el.id,el.autocomplete,el.getAttribute('aria-label'),Array.from(el.labels || []).map(function(label){return label.textContent;}).join(' ')].join(' ')) ? '[REDACTED]' : String(el.value || ''),
                    checked: !!el.checked,
                });
            });
            var buttons = [];
            doc.querySelectorAll('button, [role="button"]').forEach(function(b) {
                var t = ((b.innerText || '') + ' ' + (b.getAttribute('aria-label') || '') + ' ' + (b.title || '')).replace(/\s+/g, ' ').trim();
                if (t) buttons.push(t);
            });
            var links = [];
            doc.querySelectorAll('a[href]').forEach(function(a) {
                if (!/^(https?:|mailto:|tel:)/i.test(a.href || '')) return;
                links.push({
                    text: [a.innerText, a.getAttribute('aria-label'), a.title, a.textContent]
                        .map(function(s) { return (s || '').replace(/\s+/g, ' ').trim(); })
                        .find(function(s) { return !!s; }) || '[no label]',
                    href: a.href,
                });
            });
            return { url: url, title: title, text: text, forms: forms, buttons: buttons, links: links };
        } catch (e) {
            return { url: window.location.href || '(unknown)', error: String(e) };
        }
    }

    function _formatFrame(f, i, autoRedact) {
        function clean(value, limit) {
            value = String(value || '');
            return (autoRedact !== false ? SkimPrivacy.redactText(value) : value).slice(0, limit);
        }
        var L = ['── Frame ' + (i + 1) + (f.title ? ' · ' + f.title : '') + ' ──'];
        L.push('  URL: ' + f.url);
        if (f.error) L.push('  ERROR: ' + f.error);
        if (f.text) L.push('  TEXT: ' + clean(f.text, 3000));
        L.push('  COVERAGE: rendered frame only; body text limited to 3000 chars, field values to 80, button list to 20.');
        if (f.forms && f.forms.length) {
            L.push('  FORMS (' + f.forms.length + '):');
            f.forms.forEach(function(c) {
                var chk = (c.type === 'checkbox' || c.type === 'radio') ? (c.checked ? ' [✓]' : ' [ ]') : '';
                var val = c.value ? ' value="' + clean(c.value, 80) + '"' : '';
                L.push('    [' + (c.tag + (c.type ? ' ' + c.type : '')).toUpperCase() + chk + '] "' + clean(c.label, 60) + '"' + val);
            });
        }
        if (f.buttons && f.buttons.length) {
            L.push('  BUTTONS: ' + f.buttons.slice(0, 20).map(function(b){return clean(b,60);}).join(' | '));
        }
        if (f.links && f.links.length) {
            L.push('  LINKS (' + f.links.length + '):');
            f.links.forEach(function(l) {
                L.push('    ' + (l.text || '(no label)') + ' → ' + l.href);
            });
        }
        return L.join('\n');
    }

    // Default system prompt for AI compression. Designed for handoff to a
    // bigger model — strip framework noise, keep the page state an agent
    // needs to act on the page.
    var DEFAULT_SUMMARY_SYSTEM =
        "You compress browser-page snapshots for AI agent handoff. Preserve: " +
        "the URL, page purpose, every form field with its current value, " +
        "every dropdown option, every visible button label, embedded iframe " +
        "summaries, and any error or status text. Drop: framework boilerplate, " +
        "CSS class names, repeated navigation items, and decorative text. " +
        "Output ONLY the compressed snapshot in plain text with the same " +
        "section headers as the input (URL / TITLE / HANDOFF / CONTENT / FORM " +
        "/ DROPDOWN OPTIONS / LINKS / CROSS-FRAME). No commentary, no " +
        "explanations, no apologies.";

    // ── Provider-aware summarization ─────────────────────────
    // OpenAI-compatible chat/completions endpoints. Presets are editable;
    // availability and billing depend on the provider account.
    var SUMMARY_TIMEOUT_MS = 60000;  // big pages take a while
    var TEST_TIMEOUT_MS    = 15000;
    var DEFAULT_SUMMARY_BASE = 'https://api.z.ai/api/coding/paas/v4';

    async function providerFetch(url, options) {
        var u = new URL(url);
        if (u.protocol !== 'https:' || u.username || u.password) throw new Error('Provider must use HTTPS without URL credentials');
        var granted = await chrome.permissions.contains({origins:[u.origin+'/*']});
        if (!granted) throw new Error('Enable provider access in Skim settings first');
        return fetch(url, Object.assign({}, options, {redirect:'error'}));
    }

    // Build URL/headers/body for one chat-completions POST.
    // opts: { key, baseUrl, model }
    function _buildChatRequest(opts, messages, maxTokens) {
        var base = ((opts && opts.baseUrl) || DEFAULT_SUMMARY_BASE).replace(/\/+$/, '');
        var headers = {
            'Authorization': 'Bearer ' + (opts && opts.key || ''),
            'Content-Type':  'application/json',
        };
        if (base.indexOf('openrouter.ai') !== -1) {
            headers['HTTP-Referer'] = 'https://github.com/ZachSaucier/Skim';
            headers['X-Title']      = 'Skim';
        }
        var body = {
            model: (opts && opts.model) || 'glm-5.1',
            messages: messages,
            temperature: 0.2,
            max_tokens: maxTokens,
        };
        // z.ai coding endpoint: disable thinking exactly like ragas-gate
        // does — with it enabled the model burns the token budget on
        // reasoning and the summary comes back empty/slow.
        if (base.indexOf('api.z.ai') !== -1) {
            body.thinking = { type: 'disabled' };
        }
        return { url: base + '/chat/completions', headers: headers, body: body };
    }

    // POST raw extracted text to the configured provider, return summary
    // via cb. cb signature: (summary, error). summary is null on failure.
    // Hard timeout so a hung endpoint never blocks the clipboard write.
    function summarizeViaLLM(rawText, opts, cb) {
        var key = opts && opts.key;
        if (!key) { cb(null, 'No API key set'); return; }
        var system = (opts && opts.systemPrompt) || DEFAULT_SUMMARY_SYSTEM;
        var req = _buildChatRequest(opts, [
            { role: 'system', content: system },
            { role: 'user',   content: rawText },
        ], 4000);
        var ctrl  = new AbortController();
        var timer = setTimeout(function() { ctrl.abort(); }, SUMMARY_TIMEOUT_MS);
        providerFetch(req.url, {
            method: 'POST',
            headers: req.headers,
            body: JSON.stringify(req.body),
            signal: ctrl.signal,
        }).then(function(r) {
            if (!r.ok) {
                clearTimeout(timer);
                cb(null, 'Provider returned HTTP ' + r.status);
                return;
            }
            return r.json().then(function(data) {
                clearTimeout(timer);
                var c = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
                if (!c) { cb(null, 'No content in response'); return; }
                cb(c.trim(), null);
            });
        }).catch(function(err) {
            clearTimeout(timer);
            cb(null, (ctrl.signal.aborted || err && err.name === 'AbortError')
                ? 'Timed out after ' + Math.round(SUMMARY_TIMEOUT_MS / 1000) + 's'
                : ((err && err.message) || String(err)));
        });
    }

    // 1-token ping for the settings "Test" button. Any 2xx counts as OK
    // (a 1-token completion may legitimately have empty content).
    // cb signature: (ok:boolean, detail:string).
    function testSummaryProvider(opts, cb) {
        if (!opts || !opts.key) { cb(false, 'No API key set'); return; }
        var req = _buildChatRequest(opts, [{ role: 'user', content: 'ping' }], 1);
        var ctrl  = new AbortController();
        var timer = setTimeout(function() { ctrl.abort(); }, TEST_TIMEOUT_MS);
        providerFetch(req.url, {
            method: 'POST',
            headers: req.headers,
            body: JSON.stringify(req.body),
            signal: ctrl.signal,
        }).then(function(r) {
            if (r.ok) { clearTimeout(timer); cb(true, 'HTTP ' + r.status); return; }
            return r.text().then(function(t) {
                clearTimeout(timer);
                cb(false, 'HTTP ' + r.status + ': ' + t.slice(0, 120));
            });
        }).catch(function(err) {
            clearTimeout(timer);
            cb(false, (ctrl.signal.aborted || err && err.name === 'AbortError')
                ? 'Timed out after ' + Math.round(TEST_TIMEOUT_MS / 1000) + 's'
                : ((err && err.message) || String(err)));
        });
    }

    async function copyTextToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
        } catch (error) {
            // Chrome's async API rejects unfocused documents, including extension popups.
            // clipboardWrite also permits this synchronous fallback inside our own document.
            var previous = document.activeElement;
            var field = document.createElement('textarea');
            field.value = text;
            field.readOnly = true;
            field.setAttribute('aria-hidden', 'true');
            field.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
            document.body.appendChild(field);
            try {
                field.focus({preventScroll:true});
                field.select();
                if (!document.execCommand('copy')) throw error;
            } finally {
                field.remove();
                if (previous && previous.isConnected) previous.focus({preventScroll:true});
            }
        }
    }

    function capturePageText(tab, callback, errback, autoRedact, opts) {
        opts = opts || {};
        var doIframes = opts.extractIframes !== false;
        // Inject page.js into top frame for the full-fidelity extraction.
        chrome.scripting.executeScript(
            {target: {tabId: tab.id}, files: ['privacy.js', 'page.js']},
            function() {
                if (chrome.runtime.lastError) {
                    errback('Injection failed: ' + chrome.runtime.lastError.message);
                    return;
                }
                chrome.tabs.sendMessage(tab.id, {
                    msg: 'getPageText',
                    autoRedact:       autoRedact !== false,
                    includeButtons:   opts.includeButtons   !== false,
                    extractIframes:   doIframes,
                    extractShadowDom: opts.extractShadowDom !== false,
                    probeDropdowns:   opts.probeDropdowns   !== false,
                }, function(text) {
                    if (chrome.runtime.lastError) {
                        errback('Message error: ' + chrome.runtime.lastError.message);
                        return;
                    }
                    if (!text) {
                        errback('No text found on page');
                        return;
                    }

                    function _writeAndCallback(finalText) {
                        if (autoRedact !== false) finalText = SkimPrivacy.redactText(finalText);
                        copyTextToClipboard(finalText).then(function() {
                            callback(finalText);
                        }).catch(function(err) {
                            errback('Clipboard error: ' + (err.message || 'unknown'));
                        });
                    }

                    // After the (optional) cross-frame pass, maybe summarize
                    // before clipboard write. Both paths converge at
                    // _writeAndCallback so the clipboard fallback
                    // applies regardless.
                    function _maybeSummarize(finalText) {
                        if (autoRedact !== false) finalText = SkimPrivacy.redactText(finalText);
                        var s = opts.summary;
                        if (!s || !s.enabled || !s.key) {
                            _writeAndCallback(finalText);
                            return;
                        }
                        if (typeof opts.onSummaryStart === 'function') opts.onSummaryStart();
                        summarizeViaLLM(finalText, s, function(summary, err) {
                            if (err || !summary) {
                                // Summary failed — ship raw text so the user
                                // isn't blocked. Notify so popup can surface it.
                                if (typeof opts.onSummaryError === 'function') opts.onSummaryError(err || 'unknown');
                                _writeAndCallback(finalText);
                                return;
                            }
                            var header = '[Skim — AI-compressed via ' + (s.model || 'glm-5.1') + ']\n\n';
                            _writeAndCallback(header + summary);
                        });
                    }

                    if (!doIframes) { _maybeSummarize(text); return; }

                    // Chrome only injects into frames covered by granted permissions.
                    chrome.scripting.executeScript({
                        target: { tabId: tab.id, allFrames: true },
                        func: _extractFrame,
                        args: [autoRedact !== false],
                    }, function(results) {
                        if (chrome.runtime.lastError) {
                            // Frame injection failed (rare — usually means tab
                            // closed). Ship top-frame text without iframes.
                            _maybeSummarize(text + '\nCAPTURE WARNING: iframe extraction failed; embedded content may be missing.');
                            return;
                        }
                        var frames = (results || [])
                            .map(function(r) { return r && r.result; })
                            .filter(function(r) { return r; });
                        text += '\nFRAME COVERAGE: ' + frames.length + ' permitted embedded frames returned; inaccessible frames may be missing.';
                        if (!frames.length) { _maybeSummarize(text); return; }
                        var section = '\n══════════════ CROSS-FRAME (' + frames.length + ') ══════════════\n' +
                                      frames.map(function(f, i) { return _formatFrame(f, i, autoRedact); }).join('\n\n') + '\n';
                        _maybeSummarize(text + section);
                    });
                });
            }
        );
    }


    // Vibe-code mode: ask page.js for a single markdown block describing
    // the page's UI (META / HTML / CSS / COMPUTED / ASSETS) and copy it.
    // Same injection and extension clipboard path as capturePageText,
    // without iframe/summarization passes (the code
    // snapshot is top-frame only by design).
    function capturePageCode(tab, callback, errback, autoRedact) {
        chrome.scripting.executeScript(
            {target: {tabId: tab.id}, files: ['privacy.js', 'page.js']},
            function() {
                if (chrome.runtime.lastError) {
                    errback('Injection failed: ' + chrome.runtime.lastError.message);
                    return;
                }
                chrome.tabs.sendMessage(tab.id, {
                    msg: 'getPageCode',
                    autoRedact: autoRedact !== false,
                }, function(text) {
                    if (chrome.runtime.lastError) {
                        errback('Message error: ' + chrome.runtime.lastError.message);
                        return;
                    }
                    if (!text) {
                        errback('No code extracted from page');
                        return;
                    }
                    copyTextToClipboard(text).then(function() {
                        callback(text);
                    }).catch(function(err) {
                        errback('Clipboard error: ' + (err.message || 'unknown'));
                    });
                });
            }
        );
    }


    function captureTranscript(tab, callback, errback, autoRedact) {
        chrome.scripting.executeScript({target:{tabId:tab.id}, files:['youtube.js']}, function() {
            if (chrome.runtime.lastError) {errback(chrome.runtime.lastError.message);return;}
            chrome.scripting.executeScript({target:{tabId:tab.id}, func:async function(){return await skimYouTubeTranscript();}}, function(results) {
                var result=results && results[0] && results[0].result;
                if(chrome.runtime.lastError || !result || result.error) {errback(result && result.error || 'Transcript extraction failed');return;}
                var text=autoRedact !== false ? SkimPrivacy.redactText(result.text) : result.text;
                copyTextToClipboard(text).then(function(){callback(text);}).catch(function(e){errback('Clipboard write failed: '+e.message);});
            });
        });
    }

    return {
        captureTranscript: captureTranscript,
        captureToBlobs: captureToBlobs,
        captureToFiles: captureToFiles,
        captureToClipboard: captureToClipboard,
        capturePageText: capturePageText,
        capturePageCode: capturePageCode,
        copyBlobToClipboard: copyBlobToClipboard,
        combineScreenshotBlobs: combineScreenshotBlobs,
        copyTextToClipboard: copyTextToClipboard,
        writeImageToClipboardInTab: _writeImageBlobToTabClipboard,
        summarizeViaLLM: summarizeViaLLM,
        summarizeViaOpenRouter: summarizeViaLLM,  // legacy alias
        testSummaryProvider: testSummaryProvider,
        DEFAULT_SUMMARY_SYSTEM: DEFAULT_SUMMARY_SYSTEM,
    };

})();
