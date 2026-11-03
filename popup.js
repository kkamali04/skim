/* ── Globals ─────────────────────────────────────────────── */
var currentTab    = null;
var currentMode   = 'text';  // 'text' | 'screenshot'
var prevPanel     = null;
var settings      = {};

var DEFAULTS = {
  theme:          'dark',
  defaultAction:  'text',
  // 'text' = agent-handoff snapshot | 'code' = vibe-code markdown block
  // (META/HTML/CSS/COMPUTED/ASSETS) for pasting to an AI that will
  // recreate or modify the page's UI.
  copyMode:       'text',
  captureDelay:   300,
  historyEnabled: false,
  historyLimit:   20,
  autoRedact:     true,
  youtubeTranscript: true,
  // Text-extraction enhancers — all on by default. Toggle off if a page
  // produces noisy output and you want to isolate the bare CONTENT.
  includeButtons:   true,  // [BUTTON] entries in FORM section
  extractIframes:   true,  // == IFRAMES == section (cross-origin too)
  extractShadowDom: true,  // pierce open shadow roots for text + form controls
  probeDropdowns:   true,  // open closed react-select menus to capture options
  // AI summarization — opt-in. Compresses raw snapshot via a cheap model
  // so pasting into Claude/GPT is token-efficient. Key stored locally
  // (chrome.storage.local, never synced to other devices).
  summaryEnabled:  false,
  summaryProvider: 'zai',   // 'zai' | 'moonshot' | 'openrouter' | 'custom'
  summaryBaseUrl:  'https://api.z.ai/api/coding/paas/v4',
  summaryModel:    'glm-5.1',
  summaryKey:      '',
  openrouterKey:   '',      // legacy (pre-provider builds); migrated on load
};

// Editable presets. Availability and billing depend on your provider account.
var PROVIDER_PRESETS = {
  zai:        { baseUrl: 'https://api.z.ai/api/coding/paas/v4', model: 'glm-5.1',
                hint: 'glm-5.1 · coding endpoint · thinking auto-disabled' },
  moonshot:   { baseUrl: 'https://api.moonshot.cn/v1', model: 'kimi-k2.6',
                hint: 'kimi-k2.6 · verify model availability with your provider' },
  openrouter: { baseUrl: 'https://openrouter.ai/api/v1', model: 'z-ai/glm-4.6',
                hint: 'any OpenRouter model id (cheap = z-ai, qwen, deepseek)' },
  custom:     { baseUrl: '', model: '',
                hint: 'any OpenAI-compatible endpoint (must allow extension CORS)' },
};

/* ── Tiny helpers ────────────────────────────────────────── */
function $(id) { return document.getElementById(id); }

function trimUrl(url) {
  try {
    var u = new URL(url);
    return u.hostname + (u.pathname.length > 1 ? u.pathname.slice(0, 30) : '');
  } catch(e) { return url.slice(0, 35); }
}

function getHostname(url) {
  try { return new URL(url).hostname; } catch(e) { return url; }
}

function formatAge(ms) {
  var s = Math.floor(ms / 1000);
  if (s < 60)  return s + 's ago';
  var m = Math.floor(s / 60);
  if (m < 60)  return m + 'm ago';
  return Math.floor(m / 60) + 'h ago';
}

function formatNum(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return Math.round(n / 1e3) + 'k';
  return String(n);
}

/* Static, locally bundled Lucide icons. */
function makeIcon(name) {
  var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('aria-hidden', 'true');
  var use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', 'assets/icons.svg#' + name); svg.appendChild(use);
  return svg;
}
function makeTextSvg() { return makeIcon('file-text'); }
function makeShotSvg() { return makeIcon('camera'); }

/* ── Theme ───────────────────────────────────────────────── */
function applyTheme(theme) {
  var t = theme === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : theme;
  document.documentElement.setAttribute('data-theme', t || 'dark');
}

/* ── Settings ────────────────────────────────────────────── */
function loadSettings(cb) {
  chrome.storage.local.get('skim_settings', function(res) {
    var stored = res.skim_settings || {};
    settings = Object.assign({}, DEFAULTS, stored);
    // The previous release saved captures by default. Require a fresh opt-in for retention.
    if (stored.historyConsentVersion !== 1) {
      settings.historyEnabled=false;
      saveSettings();
    }
    // Migration: pre-provider builds stored one OpenRouter-only key. Keep
    // those users on OpenRouter with their key + model intact; fresh
    // installs get the zai preset from DEFAULTS.
    if (settings.openrouterKey && !settings.summaryKey) {
      settings.summaryKey = settings.openrouterKey;
      if (!stored.summaryProvider) {
        settings.summaryProvider = 'openrouter';
        settings.summaryBaseUrl  = PROVIDER_PRESETS.openrouter.baseUrl;
        // keep their summaryModel (it's an OpenRouter id like z-ai/glm-4.6)
        if (!stored.summaryModel) settings.summaryModel = PROVIDER_PRESETS.openrouter.model;
      }
      settings.openrouterKey = '';
      saveSettings();
    }
    applyTheme(settings.theme);
    updatePrivacyState();
    cb(settings);
  });
}

function saveSettings() {
  settings.historyConsentVersion=1;
  if (!settings.historyEnabled) chrome.storage.local.remove('skim_history');
  chrome.storage.local.set({ skim_settings: settings });
  updatePrivacyState();
}
function updatePrivacyState() {
  var label = $('privacy-state-text');
  if (label) label.textContent = settings.summaryEnabled && settings.summaryKey
    ? 'AI on · page text sent to ' + getHostname(settings.summaryBaseUrl || '')
    : 'Local capture · AI off';
}


function requestSiteAccess(base) {
  try {
    var url = new URL(base);
    if (url.username || url.password || (url.protocol !== 'https:' && url.origin !== 'http://127.0.0.1:8766'))
      return Promise.reject(new Error('Use an HTTPS provider URL'));
    return chrome.permissions.request({origins:[url.origin+'/*']});
  } catch(e) { return Promise.reject(e); }
}

/* ── Profile (one-paste JSON config) ─────────────────────── */
// Apply a JSON config to settings in one paste. Lets an AI hand the user
// a single blob ("paste this into Skim, then click the icon") instead of
// dictating which toggles to flip. _profile / _intent are metadata fields
// shown in the UI but ignored by the extraction code.
function applyProfileJson(jsonStr, statusEl) {
  jsonStr = (jsonStr || '').trim();
  if (!jsonStr) {
    if (statusEl) { statusEl.style.color = 'var(--err-fg)'; statusEl.textContent = 'Error: Empty'; }
    return;
  }
  var parsed;
  try { parsed = JSON.parse(jsonStr); }
  catch (e) {
    if (statusEl) { statusEl.style.color = 'var(--err-fg)'; statusEl.textContent = 'Error: Invalid JSON: ' + e.message.slice(0, 60); }
    return;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    if (statusEl) { statusEl.style.color = 'var(--err-fg)'; statusEl.textContent = 'Error: Expected a JSON object'; }
    return;
  }
  var validKeys = Object.keys(DEFAULTS);
  var previousProvider = settings.summaryProvider;
  var previousBase = String(settings.summaryBaseUrl || DEFAULTS.summaryBaseUrl).replace(/\/+$/, '');
  var applied = [];
  var rejected = [];
  Object.keys(parsed).forEach(function(k) {
    if (k === '_profile') { settings._activeProfile = String(parsed[k]).slice(0, 40); return; }
    if (k === '_intent')  { settings._activeIntent  = String(parsed[k]).slice(0, 200); return; }
    if (k.charAt(0) === '_') return;  // ignore other metadata
    if (validKeys.indexOf(k) >= 0 && typeof parsed[k] === typeof DEFAULTS[k] &&
        (typeof parsed[k] !== 'number' || Number.isFinite(parsed[k]) && parsed[k] > 0)) {
      settings[k] = parsed[k]; applied.push(k);
    }
    else rejected.push(k);
  });
  if (settings.summaryProvider !== previousProvider ||
      String(settings.summaryBaseUrl || DEFAULTS.summaryBaseUrl).replace(/\/+$/, '') !== previousBase) {
    settings.summaryKey = '';
    settings.openrouterKey = '';
    settings.summaryEnabled = false;
  }
  saveSettings();
  syncSettingsUI();
  updateProfileStatus();
  if (statusEl) {
    statusEl.style.color = 'var(--ok-fg)';
    var msg = 'Applied ' + applied.length + ' setting' + (applied.length === 1 ? '' : 's');
    if (rejected.length) msg += ' · ignored invalid/unknown: ' + rejected.slice(0, 3).join(', ');
    statusEl.textContent = msg;
  }
}

function resetProfile(statusEl) {
  // Preserve the whole AI-provider config across reset — keys are
  // expensive to re-paste and the provider/base/model trio belongs with
  // the key it was tested against.
  var keep = {
    summaryKey:      settings.summaryKey,
    summaryProvider: settings.summaryProvider,
    summaryBaseUrl:  settings.summaryBaseUrl,
    summaryModel:    settings.summaryModel,
    openrouterKey:   settings.openrouterKey,  // legacy
  };
  settings = Object.assign({}, DEFAULTS, keep);
  delete settings._activeProfile;
  delete settings._activeIntent;
  saveSettings();
  syncSettingsUI();
  updateProfileStatus();
  if (statusEl) { statusEl.style.color = 'var(--ok-fg)'; statusEl.textContent = 'Reset to defaults'; }
}

function updateProfileStatus() {
  var label = $('profile-active-label');
  if (label) label.textContent = settings._activeProfile || 'Default';
}

function syncSettingsUI() {
  $('set-youtube-transcript').checked = settings.youtubeTranscript !== false;
  updateYouTubeUI();
  $('set-theme').value             = settings.theme;
  $('set-default-action').value    = settings.defaultAction;
  if ($('set-copy-mode'))           $('set-copy-mode').value = settings.copyMode || 'text';
  // Map legacy values (100ms, 200ms) that no longer exist in the select to safe default
  var delayStr = String(settings.captureDelay);
  var delayEl  = $('set-capture-delay');
  delayEl.value = (delayEl.querySelector('option[value="' + delayStr + '"]')) ? delayStr : '300';
  $('set-history-enabled').checked = !!settings.historyEnabled;
  $('set-autoredact').checked      = settings.autoRedact !== false;
  if ($('set-include-buttons'))   $('set-include-buttons').checked   = settings.includeButtons   !== false;
  if ($('set-extract-iframes'))   $('set-extract-iframes').checked   = settings.extractIframes   !== false;
  if ($('set-extract-shadow'))    $('set-extract-shadow').checked    = settings.extractShadowDom !== false;
  if ($('set-probe-dropdowns'))   $('set-probe-dropdowns').checked   = settings.probeDropdowns   !== false;
  if ($('set-summary-enabled'))   $('set-summary-enabled').checked   = !!settings.summaryEnabled;
  if ($('set-summary-provider'))  $('set-summary-provider').value    = settings.summaryProvider || 'zai';
  if ($('set-summary-base'))      $('set-summary-base').value        = settings.summaryBaseUrl || PROVIDER_PRESETS.zai.baseUrl;
  if ($('set-summary-model'))     $('set-summary-model').value       = settings.summaryModel || PROVIDER_PRESETS.zai.model;
  if ($('set-summary-key'))       $('set-summary-key').value         = settings.summaryKey || '';
  updateProviderHint();
  updateProfileStatus();
  updatePrivacyState();
}

function updateProviderHint() {
  var hint = $('summary-provider-hint');
  if (!hint) return;
  var preset = PROVIDER_PRESETS[settings.summaryProvider] || PROVIDER_PRESETS.custom;
  hint.textContent = preset.hint;
}

/* ── History ─────────────────────────────────────────────── */
function loadHistory(cb) {
  chrome.storage.local.get('skim_history', function(res) {
    var history=Array.isArray(res.skim_history)?res.skim_history:[];
    var cutoff=Date.now()-14*86400000;
    var fresh=history.filter(function(entry){return Number.isFinite(entry.ts) && entry.ts>cutoff && entry.ts<=Date.now();});
    if (fresh.length!==history.length) chrome.storage.local.set({skim_history:fresh});
    cb(fresh);
  });
}

function addToHistory(entry) {
  if (!settings.historyEnabled) return;
  loadHistory(function(hist) {
    hist.unshift(entry);
    var limit = settings.historyLimit || 20;
    if (hist.length > limit) hist = hist.slice(0, limit);
    chrome.storage.local.set({ skim_history: hist });
  });
}

function makeHistoryItem(entry) {
  var isText = entry.type === 'text';

  var item = document.createElement(isText && entry.text ? 'button' : 'div');
  if (item.tagName === 'BUTTON') item.type = 'button';
  item.className = 'h-item';

  var icon = document.createElement('div');
  icon.className = 'h-icon ' + (isText ? 'text' : 'shot');
  icon.appendChild(isText ? makeTextSvg() : makeShotSvg());
  item.appendChild(icon);

  var meta = document.createElement('div');
  meta.className = 'h-meta';

  var urlEl = document.createElement('div');
  urlEl.className = 'h-url';
  urlEl.textContent = entry.hostname || getHostname(entry.url || '');
  meta.appendChild(urlEl);

  var infoEl = document.createElement('div');
  infoEl.className = 'h-info';
  infoEl.textContent = isText
    ? formatNum(entry.size || 0) + ' chars'
    : Math.round((entry.size || 0) / 1024) + ' KB';
  meta.appendChild(infoEl);
  item.appendChild(meta);

  var ago = document.createElement('div');
  ago.className = 'h-ago';
  ago.textContent = formatAge(Date.now() - (entry.ts || 0));
  item.appendChild(ago);

  if (isText && entry.text) {
    item.title = 'Copy saved text';
    item.setAttribute('aria-label', 'Copy saved capture from ' + (entry.hostname || getHostname(entry.url || '')));
    item.addEventListener('click', function() {
      var text=settings.autoRedact !== false ? SkimPrivacy.redactText(entry.text) : entry.text;
      if(entry.truncated)text+='\nCAPTURE WARNING: this saved history entry was truncated.';
      CaptureAPI.copyTextToClipboard(text).then(function() {
        setBadge('done', 'Copied');
      }).catch(function() {setBadge('err','Copy failed');});
    });
  }

  return item;
}

function renderHistory() {
  var list = $('history-list');
  var old  = list.querySelectorAll('.h-item');
  old.forEach(function(el) { el.remove(); });

  loadHistory(function(hist) {
    var empty = $('history-empty');
    if (!hist.length) { empty.style.display = 'block'; return; }
    empty.style.display = 'none';
    var frag = document.createDocumentFragment();
    hist.forEach(function(entry) { frag.appendChild(makeHistoryItem(entry)); });
    list.insertBefore(frag, empty);
  });
}

/* ── Panel management ────────────────────────────────────── */
var ALL_PANELS = ['loading', 'result', 'review', 'history', 'settings', 'error-panel', 'invalid'];
var BADGE_MAP  = {
  'loading':     ['work',  null],   // null = use mode label
  'result':      ['done',  'Done'],
  'review':      ['work',  'Review'],
  'history':     ['cache', 'History'],
  'settings':    ['cache', 'Settings'],
  'error-panel': ['err',   'Error'],
  'invalid':     ['err',   'Error'],
};

function setBadge(type, text) {
  var b = $('state-badge');
  b.className  = 'badge badge-' + type;
  b.textContent = text;
}

function getCurrentPanel() {
  for (var i = 0; i < ALL_PANELS.length; i++) {
    var el = $(ALL_PANELS[i]);
    if (el && el.style.display === 'flex') return ALL_PANELS[i];
  }
  return 'loading';
}

function showPanel(id) {
  ALL_PANELS.forEach(function(p) {
    var el = $(p);
    if (el) el.style.display = (p === id) ? 'flex' : 'none';
  });
  var info = BADGE_MAP[id];
  if (info) setBadge(info[0], info[1] || (currentMode === 'text' ? 'Reading' : 'Capturing'));
  $('btn-nav-history').classList.toggle('active', id === 'history');
  $('btn-nav-settings').classList.toggle('active', id === 'settings');
}

/* ── Progress (screenshots) ──────────────────────────────── */
function progress(complete) {
  var bar = $('bar');
  bar.classList.remove('pulse');
  if (complete === 0) {
    $('progress-label').textContent = 'Capturing full page…';
    bar.style.width = '0%';
  } else {
    bar.style.width = Math.min(99, Math.round(complete * 100)) + '%';
  }
}

function splitnotifier() {
  $('split-image').style.display = 'block';
}

/* ── Error ───────────────────────────────────────────────── */
function errorHandler(reason) {
  $('error-msg').textContent = reason || 'Capture failed.';
  showPanel('error-panel');
  console.error('[Skim]', reason);
}

/* ── Update action2 button ───────────────────────────────── */
function setAction2(mode) {
  // mode = what will happen when clicked ('screenshot' or 'text')
  var icon = $('btn-action2-icon');
  var lbl  = $('btn-action2-text');
  while (icon.firstChild) icon.removeChild(icon.firstChild);
  if (mode === 'screenshot') {
    icon.appendChild(makeShotSvg());
    lbl.textContent = 'Take Screenshot';
  } else {
    icon.appendChild(makeTextSvg());
    lbl.textContent = settings.copyMode === 'code' ? 'Copy Page Code' : 'Copy Page Text';
  }
}

/* ── Result: text ────────────────────────────────────────── */
function onTextSuccess(text) {
  // Store up to ~100 KB per entry so re-copy from history returns the
  // full snapshot, not a tiny 3 KB preview. chrome.storage.local has a
  // 5 MB total budget — 20 entries × 100 KB fits comfortably.
  addToHistory({
    id: Date.now(), url: currentTab.url,
    hostname: getHostname(currentTab.url),
    ts: Date.now(), type: 'text', size: text.length,
    text: text.length > 100000 ? text.slice(0, 100000) : text,
    truncated: text.length > 100000,
  });
  showTextResult(text);
}

var capturedText = '';
function prepareTextExport(text) {
  capturedText = text; $('text-preview').value = text; $('text-status').textContent = '';
}
function exportText(copy) {
  var text = settings.autoRedact !== false ? SkimPrivacy.redactText(capturedText) : capturedText;
  if (copy) return CaptureAPI.copyTextToClipboard(text).then(function() {
    $('text-status').textContent = 'Copied full captured text';
  }).catch(function() { $('text-status').textContent = 'Copy failed. Use Save text.'; });
  SkimExports.download(new Blob([text], {type:'text/plain;charset=utf-8'}), 'skim-capture-' + Date.now() + '.txt');
  $('text-status').textContent = 'Saved full captured text';
}
function showTextResult(text) {
  prepareTextExport(text);
  currentMode = 'text';
  $('result-label').textContent   = 'Text copied';
  $('result-sub').textContent     = trimUrl(currentTab ? currentTab.url : '');
  $('result-meta').textContent    = formatNum(text.length) + ' chars';
  setAction2('screenshot');
  showPanel('result');
}

/* ── Result: code (vibe-code mode) ───────────────────────── */
function onCodeSuccess(text) {
  // Stored as type 'text' so history re-copy (writeText) works unchanged.
  addToHistory({
    id: Date.now(), url: currentTab.url,
    hostname: getHostname(currentTab.url),
    ts: Date.now(), type: 'text', size: text.length,
    text: text.length > 100000 ? text.slice(0, 100000) : text,
    truncated: text.length > 100000,
  });
  showCodeResult(text);
}

function showCodeResult(text) {
  prepareTextExport(text);
  currentMode = 'text';
  $('result-label').textContent   = 'Page code copied';
  $('result-sub').textContent     = trimUrl(currentTab ? currentTab.url : '');
  $('result-meta').textContent    = formatNum(text.length) + ' chars';
  setAction2('screenshot');
  showPanel('result');
}

/* ── Capture ─────────────────────────────────────────────── */
// Router: the "copy" action runs text extraction or the vibe-code
// extractor depending on settings.copyMode ('text' | 'code').
function startCopy() {
  if (settings.copyMode === 'code') startCodeCopy();
  else startTextCopy();
}

function isYouTubeVideo() {
  try {var u=new URL(currentTab.url);return /(^|\.)youtube\.com$/.test(u.hostname) &&
    (u.pathname==='/watch' && u.searchParams.has('v') || /^\/(shorts|live)\//.test(u.pathname));}
  catch(e){return false;}
}
function updateYouTubeUI() {
  $('youtube-controls').style.display=isYouTubeVideo()?'flex':'none';
  $('btn-youtube-alternate').textContent=settings.youtubeTranscript !== false?'Skim page normally':'Capture transcript';
}
function startNormal() {if(settings.defaultAction==='screenshot')startCapture();else startCopy();}
function startTranscript() {
  currentMode='transcript';
  $('progress-label').textContent='Reading YouTube transcript…';showPanel('loading');
  CaptureAPI.captureTranscript(currentTab,function(text){onTextSuccess(text);currentMode='transcript';$('result-label').textContent='Transcript copied';},errorHandler,settings.autoRedact !== false);
}

function startCodeCopy() {
  currentMode = 'text';
  $('progress-label').textContent = 'Extracting page code…';
  var bar = $('bar'); bar.style.width = '0%'; bar.classList.add('pulse');
  showPanel('loading');
  CaptureAPI.capturePageCode(currentTab, onCodeSuccess, errorHandler, settings.autoRedact !== false);
}

function startTextCopy() {
  var summaryFailed = false;
  currentMode = 'text';
  $('progress-label').textContent = 'Extracting text…';
  var bar = $('bar'); bar.style.width = '0%'; bar.classList.add('pulse');
  showPanel('loading');
  CaptureAPI.capturePageText(
    currentTab, function(text) {
      onTextSuccess(text);
      if (summaryFailed) setBadge('err', 'Summary failed — raw');
    }, errorHandler,
    settings.autoRedact !== false,
    {
      includeButtons:   settings.includeButtons   !== false,
      extractIframes:   settings.extractIframes   !== false,
      extractShadowDom: settings.extractShadowDom !== false,
      probeDropdowns:   settings.probeDropdowns   !== false,
      summary: {
        enabled: !!settings.summaryEnabled && !!settings.summaryKey,
        key:     settings.summaryKey,
        baseUrl: settings.summaryBaseUrl || PROVIDER_PRESETS.zai.baseUrl,
        model:   settings.summaryModel || PROVIDER_PRESETS.zai.model,
      },
      onSummaryStart: function() {
        $('progress-label').textContent = 'Summarizing via ' + (settings.summaryModel || 'glm-5.1') + '…';
      },
      onSummaryError: function(err) {
        summaryFailed = true;
        console.warn('[Skim] Summary failed, shipping raw text:', err);
        setBadge('err', 'Summary failed — raw');
      },
    }
  );
}

function startCapture() {
  currentMode = 'screenshot';
  showPanel('loading');
  $('progress-label').textContent = 'Capturing to clipboard…';
  var bar = $('bar'); bar.classList.remove('pulse'); bar.style.width = '0%';
  CaptureAPI.captureToBlobs(currentTab, openReview, errorHandler,
    progress, splitnotifier, settings.captureDelay, settings.autoRedact !== false);
}

var reviewParts = [], reviewIndex = 0, reviewDrag = null;
async function openReview(blobs, layout) {
  reviewParts.forEach(function(p) { p.image.close(); });
  reviewParts = [];
  try {
    var top=0;
    for (var i=0;i<blobs.length;i++) {
      var image=await createImageBitmap(blobs[i]);
      reviewParts.push({image:image,masks:[],bounds:layout && layout[i] || {x:0,y:top,width:image.width,height:image.height}});
      top+=image.height;
    }
    reviewIndex = 0;
    $('review-part').replaceChildren();
    reviewParts.forEach(function(p,i) { $('review-part').add(new Option((i+1)+' / '+reviewParts.length, i)); });
    showPanel('review');
    renderReview();
  } catch (e) { errorHandler('Preview failed: '+e.message); return; }
  await copyAllReviewed();
}
function renderReview() {
  var part = reviewParts[reviewIndex], canvas = $('review-canvas');
  if (!part) return;
  drawReviewedPart(part, canvas);
  $('mask-x').max = part.image.width - 1; $('mask-y').max = part.image.height - 1;
  $('mask-width').max = part.image.width; $('mask-height').max = part.image.height;
  $('review-all-label').textContent = 'Save all ' + reviewParts.length + ' reviewed parts · ZIP';
  $('review-status').textContent = part.masks.length+' manual masks. Copy the full screenshot again after edits.';
  $('review-copy').style.display=reviewParts.length>1?'flex':'none';
  $('review-undo').disabled = !part.masks.length;
}
function drawReviewedPart(part, canvas) {
  canvas.width = part.image.width; canvas.height = part.image.height;
  var ctx = canvas.getContext('2d');
  ctx.drawImage(part.image,0,0);
  ctx.fillStyle = '#000';
  part.masks.forEach(function(m) {
    var x = Math.floor(m.x), y = Math.floor(m.y);
    ctx.fillRect(x,y,Math.ceil(m.x+m.w)-x,Math.ceil(m.y+m.h)-y);
  });
}
function reviewPoint(e) {
  var c=$('review-canvas'), r=c.getBoundingClientRect();
  return {x:Math.max(0,Math.min(c.width,(e.clientX-r.left)*c.width/r.width)),
    y:Math.max(0,Math.min(c.height,(e.clientY-r.top)*c.height/r.height))};
}
async function exportReview(download) {
  var blob = await new Promise(function(resolve) {$('review-canvas').toBlob(resolve,'image/png');});
  if (!blob) { errorHandler('PNG encoding failed'); return; }
  try {
    if (download) {
      SkimExports.download(blob, 'skim-part-' + (reviewIndex+1) + '-of-' + reviewParts.length + '.png');
      $('review-status').textContent='Downloaded part '+(reviewIndex+1)+' of '+reviewParts.length;
    } else {
      await CaptureAPI.copyBlobToClipboard(blob);
      $('review-status').textContent='Copied part '+(reviewIndex+1)+' of '+reviewParts.length;
      setBadge('done','Copied part');
    }
  } catch(e) { $('review-status').textContent='Export failed: '+e.message; }
}

/* Reuse the same opaque-mask renderer for complete clipboard and ZIP output. */
async function reviewedFiles() {
    var files = [];
    for (var i = 0; i < reviewParts.length; i++) {
      var canvas = document.createElement('canvas'); drawReviewedPart(reviewParts[i], canvas);
      var blob = await new Promise(function(resolve) { canvas.toBlob(resolve, 'image/png'); });
      if (!blob) throw new Error('PNG encoding failed for part ' + (i+1));
      files.push({name:'skim-part-' + (i+1) + '-of-' + reviewParts.length + '.png',blob:blob});
    }
    return files;
}
async function copyAllReviewed() {
  var button=$('review-copy-all');button.disabled=true;
  $('review-status').textContent='Copying the complete screenshot…';
  try {
    var files=await reviewedFiles();
    var blob=await CaptureAPI.combineScreenshotBlobs(files.map(function(f){return f.blob;}),reviewParts.map(function(p){return p.bounds;}));
    await CaptureAPI.copyBlobToClipboard(blob);
    $('review-status').textContent='Copied full screenshot'+(reviewParts.length>1?' · all '+reviewParts.length+' parts':'')+'. Nothing saved automatically.';
    setBadge('done','Copied');
  } catch(e) { $('review-status').textContent='Copy failed: '+e.message;setBadge('err','Copy failed'); }
  finally {button.disabled=false;}
}
async function downloadAllReviewed() {
  var button = $('review-download-all'); button.disabled = true;
  try {
    SkimExports.download(await SkimExports.zip(await reviewedFiles()), 'skim-reviewed-' + Date.now() + '.zip');
    $('review-status').textContent = 'Saved all ' + reviewParts.length + ' reviewed parts';
  } catch (e) { $('review-status').textContent = 'Export failed: ' + e.message; }
  finally { button.disabled = false; }
}

/* ── Init ────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', function() {
  $('set-youtube-transcript').addEventListener('change',function(){settings.youtubeTranscript=this.checked;saveSettings();updateYouTubeUI();});
  $('btn-youtube-alternate').addEventListener('click',function(){if(settings.youtubeTranscript !== false)startNormal();else startTranscript();});
  $('review-part').addEventListener('change',function(){reviewIndex=Number(this.value);renderReview();});
  $('review-undo').addEventListener('click',function(){reviewParts[reviewIndex].masks.pop();renderReview();});
  $('review-copy').addEventListener('click',function(){exportReview(false);});
  $('review-copy-all').addEventListener('click',copyAllReviewed);
  $('review-download').addEventListener('click',function(){exportReview(true);});
  $('review-cancel').addEventListener('click',function(){window.close();});
  $('review-canvas').addEventListener('pointerdown',function(e){reviewDrag=reviewPoint(e);this.setPointerCapture(e.pointerId);});
  $('review-canvas').addEventListener('pointerup',function(e){
    if (!reviewDrag) return;
    var p=reviewPoint(e), a=reviewDrag; reviewDrag=null;
    if(Math.abs(p.x-a.x)>1 && Math.abs(p.y-a.y)>1) reviewParts[reviewIndex].masks.push({x:Math.min(p.x,a.x),y:Math.min(p.y,a.y),w:Math.abs(p.x-a.x),h:Math.abs(p.y-a.y)});
    renderReview();
  });
  $('review-canvas').addEventListener('pointercancel',function(){reviewDrag=null;});

  $('btn-close').addEventListener('click',       function() { window.close(); });
  $('btn-recopy').addEventListener('click', function() { exportText(true); });
  $('btn-download-text').addEventListener('click', function() { exportText(false); });
  $('review-download-all').addEventListener('click', downloadAllReviewed);
  $('mask-form').addEventListener('submit', function(e) {
    e.preventDefault();
    var p = reviewParts[reviewIndex];
    var x = Number($('mask-x').value), y = Number($('mask-y').value);
    var w = Number($('mask-width').value), h = Number($('mask-height').value);
    if (!p || ![x,y,w,h].every(Number.isFinite) || x < 0 || y < 0 || w <= 0 || h <= 0 || x >= p.image.width || y >= p.image.height) return;
    p.masks.push({x:x,y:y,w:Math.min(w,p.image.width-x),h:Math.min(h,p.image.height-y)});
    renderReview();
  });
  $('btn-action2').addEventListener('click',     function() {
    if (currentMode === 'text' || currentMode === 'transcript') startCapture(); else startCopy();
  });

  $('btn-retry').addEventListener('click',       function() {
    if (currentMode === 'screenshot') startCapture(); else if(currentMode==='transcript')startTranscript();else startCopy();
  });
  $('btn-error-close').addEventListener('click',  function() { window.close(); });
  $('btn-invalid-close').addEventListener('click',function() { window.close(); });

  $('btn-nav-history').addEventListener('click', function() {
    if (getCurrentPanel() === 'history') { showPanel(prevPanel || 'result'); }
    else { prevPanel = getCurrentPanel(); renderHistory(); showPanel('history'); }
  });
  $('btn-history-back').addEventListener('click', function() { showPanel(prevPanel || 'result'); });
  $('btn-clear-history').addEventListener('click', function() {
    chrome.storage.local.set({ skim_history: [] }, function() { renderHistory(); });
  });

  $('btn-nav-settings').addEventListener('click', function() {
    if (getCurrentPanel() === 'settings') { showPanel(prevPanel || 'result'); }
    else { prevPanel = getCurrentPanel(); syncSettingsUI(); showPanel('settings'); }
  });
  $('btn-settings-back').addEventListener('click', function() { showPanel(prevPanel || 'result'); });

  $('set-theme').addEventListener('change', function() {
    settings.theme = this.value; applyTheme(settings.theme); saveSettings();
  });
  $('set-default-action').addEventListener('change', function() {
    settings.defaultAction = this.value; saveSettings();
  });
  if ($('set-copy-mode')) $('set-copy-mode').addEventListener('change', function() {
    settings.copyMode = this.value; saveSettings();
  });
  $('set-capture-delay').addEventListener('change', function() {
    settings.captureDelay = parseInt(this.value, 10); saveSettings();
  });
  $('set-history-enabled').addEventListener('change', function() {
    settings.historyEnabled = this.checked; saveSettings();
  });
  $('set-autoredact').addEventListener('change', function() {
    settings.autoRedact = this.checked; saveSettings();
  });
  if ($('set-include-buttons')) $('set-include-buttons').addEventListener('change', function() {
    settings.includeButtons = this.checked; saveSettings();
  });
  if ($('set-extract-iframes')) $('set-extract-iframes').addEventListener('change', function() {
    settings.extractIframes = this.checked; saveSettings();
  });
  if ($('set-extract-shadow')) $('set-extract-shadow').addEventListener('change', function() {
    settings.extractShadowDom = this.checked; saveSettings();
  });
  if ($('set-probe-dropdowns')) $('set-probe-dropdowns').addEventListener('change', function() {
    settings.probeDropdowns = this.checked; saveSettings();
  });
  if ($('set-summary-enabled')) $('set-summary-enabled').addEventListener('change', function() {
    if (!this.checked) {settings.summaryEnabled=false;saveSettings();return;}
    requestSiteAccess(settings.summaryBaseUrl).then(function(ok){
      settings.summaryEnabled=ok;saveSettings();syncSettingsUI();
      $('summary-test-status').textContent=ok?'Provider access enabled. Captured text will be sent when summarizing.':'Permission denied. Summaries remain off.';
    }).catch(function(e){settings.summaryEnabled=false;saveSettings();syncSettingsUI();$('summary-test-status').textContent=e.message;});
  });
  if ($('set-summary-provider')) $('set-summary-provider').addEventListener('change', function() {
    settings.summaryEnabled=false;
    settings.summaryKey='';settings.openrouterKey='';$('set-summary-key').value='';
    $('set-summary-enabled').checked=false;
    settings.summaryProvider = this.value;
    var preset = PROVIDER_PRESETS[this.value];
    if (preset && this.value !== 'custom') {
      settings.summaryBaseUrl = preset.baseUrl;
      settings.summaryModel   = preset.model;
      if ($('set-summary-base'))  $('set-summary-base').value  = preset.baseUrl;
      if ($('set-summary-model')) $('set-summary-model').value = preset.model;
    }
    updateProviderHint();
    saveSettings();
  });
  if ($('set-summary-base')) $('set-summary-base').addEventListener('change', function() {
    settings.summaryEnabled=false; $('set-summary-enabled').checked=false;
    settings.summaryKey='';settings.openrouterKey='';$('set-summary-key').value='';
    settings.summaryBaseUrl = this.value.trim().replace(/\/+$/, ''); saveSettings();
  });
  if ($('set-summary-model')) $('set-summary-model').addEventListener('change', function() {
    settings.summaryModel = this.value.trim(); saveSettings();
  });
  if ($('set-summary-key')) $('set-summary-key').addEventListener('change', function() {
    settings.summaryKey = this.value.trim(); saveSettings();
  });
  if ($('btn-load-crypt')) $('btn-load-crypt').addEventListener('click', function() {
    var status = $('summary-test-status');
    var provider = ($('set-summary-provider') && $('set-summary-provider').value) ||
                   settings.summaryProvider || 'zai';
    var entry = 'skim/' + provider + '-key';   // skim/zai-key, skim/moonshot-key, …
    status.style.color = 'var(--muted)';
    status.textContent = 'Loading ' + entry + ' from crypt…';
    // cogent-rest bridge; endpoint is hard-gated server-side to skim/* entries.
    requestSiteAccess('http://127.0.0.1:8766').then(function(ok) {
      if (!ok) {var denied=new Error('Local bridge permission denied');denied.handled=true;throw denied;}
      return fetch('http://127.0.0.1:8766/agent/vault-get', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: entry })
      });
    }).then(function(res) {
      if (res.ok) return res.json();
      var err = new Error(res.status === 404
        ? 'key not in crypt — run: crypt set ' + entry
        : 'bridge refused (' + res.status + ')');
      err.handled = true;
      throw err;
    }).then(function(data) {
      if (!data || !data.value) {
        var err = new Error('bridge returned no value');
        err.handled = true;
        throw err;
      }
      $('set-summary-key').value = data.value;   // never logged anywhere
      settings.summaryKey = data.value;
      saveSettings();
      status.style.color = 'var(--ok-fg)';
      status.textContent = 'loaded ' + entry + ' from crypt';
    }).catch(function(err) {
      status.style.color = 'var(--err-fg)';
      status.textContent = 'Error: ' + (err && err.handled
        ? err.message
        : 'bridge offline — start cogent-rest on 127.0.0.1:8766');
    });
  });
  if ($('btn-test-summary')) $('btn-test-summary').addEventListener('click', function() {
    var status = $('summary-test-status');
    // Read fields directly so an un-blurred key still gets tested.
    var opts = {
      key:     ($('set-summary-key').value || '').trim(),
      baseUrl: ($('set-summary-base').value || '').trim() || PROVIDER_PRESETS.zai.baseUrl,
      model:   ($('set-summary-model').value || '').trim() || PROVIDER_PRESETS.zai.model,
    };
    status.style.color = 'var(--muted)';
    status.textContent = 'Testing…';
    requestSiteAccess(opts.baseUrl).then(function(granted) {
      if (!granted) {status.textContent='Provider permission denied';return;}
      CaptureAPI.testSummaryProvider(opts, function(ok, detail) {
      status.style.color = ok ? 'var(--ok-fg)' : 'var(--err-fg)';
      status.textContent = ok ? ('' + detail + ' — key works') : ('Error: ' + detail);
      });
    }).catch(function(e){status.textContent=e.message;});
  });
  if ($('btn-apply-profile')) $('btn-apply-profile').addEventListener('click', function() {
    applyProfileJson($('set-profile-json').value, $('profile-status'));
  });
  if ($('btn-reset-profile')) $('btn-reset-profile').addEventListener('click', function() {
    $('set-profile-json').value = '';
    resetProfile($('profile-status'));
  });

  loadSettings(function() {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      currentTab = tabs[0];
      updateYouTubeUI();
      if (isYouTubeVideo() && settings.youtubeTranscript !== false) startTranscript();
      else startNormal();
    });
  });
});
