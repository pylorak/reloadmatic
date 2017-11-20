var background = browser.extension.getBackgroundPage();
var chkDefRandomize;
var chkDefOnlyUnsuccessful;
var chkDefSmartTiming;
var chkDefStickyReload;
var chkDefDisableCache;

function storeSettings(evt) {
    let defs = {
        randomize: chkDefRandomize.checked,
        onlyOnError: chkDefOnlyUnsuccessful.checked,
        smart: chkDefSmartTiming.checked,
        stickyReload: chkDefStickyReload.checked,
        nocache: chkDefDisableCache.checked
    };
    browser.storage.local.set({
        defaults: defs
    })
    .then(() => {
        return background.LoadDefaultsAsync();
    });
}

document.addEventListener("DOMContentLoaded", (event) => {
    chkDefRandomize = document.getElementById("defRandomize");
    chkDefOnlyUnsuccessful = document.getElementById("defOnlyUnsuccessful");
    chkDefSmartTiming =  document.getElementById("defSmartTiming");
    chkDefStickyReload = document.getElementById("defStickyReload");
    chkDefDisableCache = document.getElementById("defDisableCache");
    let inputs = [
        chkDefRandomize,
        chkDefOnlyUnsuccessful,
        chkDefSmartTiming,
        chkDefStickyReload,
        chkDefDisableCache
    ];

    for(let i=0; i<inputs.length; i++) {
        inputs[i].addEventListener('change', storeSettings);
    }

    document.getElementById("btnClearRememberedPages").addEventListener('click', () => {
        browser.storage.local.remove(["urlMemory"]).then(() => {
            background.urlMemory = new Map();
            alert("Remembered pages have been cleared.")
        });
    });

    background.LoadDefaultsAsync().then((defaults) => {
        chkDefRandomize.checked = defaults.randomize;
        chkDefOnlyUnsuccessful.checked = defaults.onlyOnError;
        chkDefSmartTiming.checked = defaults.smart;
        chkDefStickyReload.checked = defaults.stickyReload;
        chkDefDisableCache.checked = defaults.nocache;
    });
});
