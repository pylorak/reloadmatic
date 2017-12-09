var background = browser.extension.getBackgroundPage();
var chkDefRandomize;
var chkDefOnlyUnsuccessful;
var chkDefSmartTiming;
var chkDefStickyReload;
var chkDefDisableCache;
var chkPinningSetsRemember;

function storeSettings(evt) {
    let s = background.Settings;
    s.defaults.randomize = chkDefRandomize.checked;
    s.defaults.onlyOnError = chkDefOnlyUnsuccessful.checked;
    s.defaults.smart = chkDefSmartTiming.checked;
    s.defaults.stickyReload = chkDefStickyReload.checked;
    s.defaults.nocache = chkDefDisableCache.checked;
    s.pinSetsRemember = chkPinningSetsRemember.checked;
    browser.storage.local.set({ settings: background.Settings });
}

document.addEventListener("DOMContentLoaded", (event) => {
    chkDefRandomize = document.getElementById("defRandomize");
    chkDefOnlyUnsuccessful = document.getElementById("defOnlyUnsuccessful");
    chkDefSmartTiming = document.getElementById("defSmartTiming");
    chkDefStickyReload = document.getElementById("defStickyReload");
    chkDefDisableCache = document.getElementById("defDisableCache");
    chkPinningSetsRemember = document.getElementById("chkPinningSetsRemember");
    let inputs = [
        chkDefRandomize,
        chkDefOnlyUnsuccessful,
        chkDefSmartTiming,
        chkDefStickyReload,
        chkDefDisableCache,
        chkPinningSetsRemember
    ];

    for (let i = 0; i < inputs.length; i++) {
        inputs[i].addEventListener('change', storeSettings);
    }

    document.getElementById("btnClearRememberedPages").addEventListener('click', () => {
        browser.storage.local.remove(["urlMemory"]).then(() => {
            background.urlMemory = new Map();
            browser.notifications.create({
                "type": "basic",
                "iconUrl": browser.extension.getURL("icon.svg"),
                "title": "ReloadMatic",
                "message": "Remembered pages have been cleared."
            });
        });
    });

    background.LoadSettingsAsync().then((settings) => {
        chkDefRandomize.checked = settings.defaults.randomize;
        chkDefOnlyUnsuccessful.checked = settings.defaults.onlyOnError;
        chkDefSmartTiming.checked = settings.defaults.smart;
        chkDefStickyReload.checked = settings.defaults.stickyReload;
        chkDefDisableCache.checked = settings.defaults.nocache;
        chkPinningSetsRemember.checked = settings.pinSetsRemember;
    });
});
