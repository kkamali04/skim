// Native action popups preserve activeTab grants and avoid a setPopup/openPopup race.
chrome.runtime.onInstalled.addListener(function() {
    chrome.action.setPopup({popup:'popup.html'});
});
chrome.runtime.onStartup.addListener(function() {
    chrome.action.setPopup({popup:'popup.html'});
});

async function pruneCaptureHistory() {
    var state=await chrome.storage.local.get(['skim_settings','skim_history']);
    if (!state.skim_history) return;
    if (!state.skim_settings || state.skim_settings.historyEnabled !== true || state.skim_settings.historyConsentVersion !== 1) {
        await chrome.storage.local.remove('skim_history');return;
    }
    var history=Array.isArray(state.skim_history)?state.skim_history:[];
    var now=Date.now(),cutoff=now-14*86400000;
    var fresh=history.filter(function(entry){return Number.isFinite(entry.ts) && entry.ts>cutoff && entry.ts<=now;});
    // ponytail: this is a best-effort cache; serialize writers here if durable concurrent history is needed.
    if(fresh.length!==history.length) await chrome.storage.local.set({skim_history:fresh});
}
chrome.alarms.onAlarm.addListener(function(alarm) {
    if(alarm.name==='skim-history-expiry')pruneCaptureHistory().catch(function(e){console.error('[Skim] History cleanup failed:',e.message);});
});
(async function() {
    if(!await chrome.alarms.get('skim-history-expiry'))await chrome.alarms.create('skim-history-expiry',{periodInMinutes:60});
    await pruneCaptureHistory();
})().catch(function(e){console.error('[Skim] History cleanup setup failed:',e.message);});
