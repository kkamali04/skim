// Native action popups preserve activeTab grants and avoid a setPopup/openPopup race.
chrome.runtime.onInstalled.addListener(function() {
    chrome.action.setPopup({popup:'popup.html'});
});
chrome.runtime.onStartup.addListener(function() {
    chrome.action.setPopup({popup:'popup.html'});
});
