var background = browser.extension.getBackgroundPage();
var chkDefRandomize;
var chkDefOnlyUnsuccessful;
var chkDefSmartTiming;
var chkDefStickyReload;
var chkDefDisableCache;
var chkPinningSetsRemember;
var txtSmartTimingActivityDelay;
var radSmartTimingTextDisable;
var radSmartTimingTextDelay;
var chkNotifUnconfirmedPost;
var chkNotifNavigateAway;
var chkNotifTextInput;

function isEmpty(str) {
    return (!str || (0 === str.length));
}

function isInt(str) {
    let n = Number(str);
    return !isEmpty(str) && !isNaN(str) && (Math.floor(n) == n);
}

function storeSettings(evt) {
    let s = background.Settings;
    s.defaults.randomize = chkDefRandomize.checked;
    s.defaults.onlyOnError = chkDefOnlyUnsuccessful.checked;
    s.defaults.smart = chkDefSmartTiming.checked;
    s.defaults.stickyReload = chkDefStickyReload.checked;
    s.defaults.nocache = chkDefDisableCache.checked;
    s.pinSetsRemember = chkPinningSetsRemember.checked;
    s.smartTiming.typeReaction = document.getElementById('SmartTimingTypeReaction').elements['SmartTimingTypeReaction'].value;
    s.notifications.unconfirmedPost = chkNotifUnconfirmedPost.checked;
    s.notifications.navigateAway = chkNotifNavigateAway.checked;
    s.notifications.textInput = chkNotifTextInput.checked;

    // Only save input if valid
    if (isInt(txtSmartTimingActivityDelay.value)) {
        s.smartTiming.delaySecs = Number(txtSmartTimingActivityDelay.value);
    }

    browser.storage.local.set({ settings: background.Settings });
}

document.addEventListener("DOMContentLoaded", (event) => {
    chkDefRandomize = document.getElementById("defRandomize");
    chkDefOnlyUnsuccessful = document.getElementById("defOnlyUnsuccessful");
    chkDefSmartTiming = document.getElementById("defSmartTiming");
    chkDefStickyReload = document.getElementById("defStickyReload");
    chkDefDisableCache = document.getElementById("defDisableCache");
    chkPinningSetsRemember = document.getElementById("chkPinningSetsRemember");
    radSmartTimingTextDisable = document.getElementById('radSmartTimingTextDisable');
    radSmartTimingTextDelay = document.getElementById('radSmartTimingTextDelay');
    txtSmartTimingActivityDelay = document.getElementById("txtSmartTimingActivityDelay");
    chkNotifUnconfirmedPost = document.getElementById("chkNotifUnconfirmedPost");
    chkNotifNavigateAway = document.getElementById("chkNotifNavigateAway");
    chkNotifTextInput = document.getElementById("chkNotifTextInput");

    // Connect input events to all input elements
    // TODO: use selector instead of array
    let inputs = [
        chkDefRandomize,
        chkDefOnlyUnsuccessful,
        chkDefSmartTiming,
        chkDefStickyReload,
        chkDefDisableCache,
        chkPinningSetsRemember,
        radSmartTimingTextDelay,
        radSmartTimingTextDisable,
        txtSmartTimingActivityDelay,
        chkNotifUnconfirmedPost,
        chkNotifNavigateAway,
        chkNotifTextInput
    ];
    for (let i = 0; i < inputs.length; i++) {
        inputs[i].addEventListener('input', storeSettings);
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
        txtSmartTimingActivityDelay.value = settings.smartTiming.delaySecs;
        document.getElementById(settings.smartTiming.typeReaction).checked = true;
        chkNotifUnconfirmedPost.checked = settings.notifications.unconfirmedPost;
        chkNotifNavigateAway.checked = settings.notifications.navigateAway;
        chkNotifTextInput.checked = settings.notifications.textInput;
    });
});
