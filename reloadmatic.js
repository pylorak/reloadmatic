// Configuration format version
const CONFIG_VERSION = 1

// Conversion factor from seconds to minutes
const TIME_FACTOR = 1.0 / 60.0

// true if we can use session APIs from FF 57.0
const session57Available = (typeof browser.sessions.setTabValue === "function")

// true if we can use menu APIs from FF 60.0
const menu60Available = (typeof browser.menus.refresh === "function")

// Here we store all our data about tabs
var state = new Map()

// Here we store all pages for the "Remember" feature
var urlMemory = new Map();

// ID of the currently focused window
var CurrentWindowId = 0

// Here we store all user settings for the plugin
var Settings;

function objKey(tabId) {
    return `tab-${tabId}-alarm`;
}

// Returns a default-initialized instance of the object
// that describes all add-on related properties of a
// browser tab.
function newTabProps(tabId) {
    let ret = {
        // User Settings
        // ******************************
        randomize: false,           // whether "Randomize" is enabled
        loadError: false,           // whether there was an error in loading the page
        smart: false,                // whether "Smart timing" is enabled
        onlyOnError: false,         // whether "Only if unsuccessful" is enabled
        stickyReload: false,        // whether to keep reloading after page changes
        nocache: false,             // whether "Disable cache" is enabled
        remember: false,            // whether settings for this URL will be remembered
        period: -1,                 // canonical autoreload interval

        // Internal State
        // ******************************
        alarmName: objKey(tabId),   // name of the alarm and key in collections
        keepRefreshing: false,      // true if periodic refresh should not be disabled
        freezeUntil: 0,             // time until we are not allowed to reload
        tabId: tabId,               // id of the tab we belong to
        reqMethod: "GET",           // HTTP method the page was retrieved with
        postConfirmed: false,       // true if user wants to resend POST data
        scrollX: undefined,         // Horizontal scroll position of page
        scrollY: undefined,         // Vertical scroll position of page
        url: "",                    // Current or currently loading URL of tab,
        reloadByAddon: false        // true if the current reload was initiated by us
    };

    // Apply default user options
    Object.keys(Settings.defaults).forEach(function (key, index) {
        ret[key] = Settings.defaults[key];
    });

    return ret;
}

function getTabProps(tabId) {
    let alarm_name = objKey(tabId)
    if (state.has(alarm_name)) {
        return state.get(alarm_name)
    } else {
        let obj = newTabProps(tabId)
        state.set(alarm_name, obj)
        return obj
    }
}

// Free up resources we don't need anymore
browser.tabs.onRemoved.addListener((tabId, removeInfo) => {
    let key = objKey(tabId)
    browser.alarms.clear(key)
    state.delete(key)
})

async function restartAlarm(obj) {
    // If period is negative we are deleting the alarm
    browser.alarms.clear(obj.alarmName)
    if (obj.period < 0) {
        obj.postConfirmed = false;
        return browser.tabs.sendMessage(obj.tabId, {event: "timer-disabled"});
    }

    // Create new alarm
    let period = obj.period
    if (obj.randomize) {
        let min = period * 0.5
        let max = period * 1.5
        period = Math.random() * (max - min + 1) + min
    }
    browser.alarms.create(obj.alarmName, { delayInMinutes: period * TIME_FACTOR });
    return browser.tabs.sendMessage(obj.tabId, {event: "timer-enabled"});
}

async function applyTabProps(obj) {
    let promises = [];
    promises.push(refreshMenu());
    promises.push(restartAlarm(obj));
    if (session57Available) {
        promises.push(browser.sessions.setTabValue(obj.tabId, "reloadmatic", obj));
    }
    return Promise.all(promises);
}

async function setTabPeriod(obj, period) {

    // Determine if the tab is still open, and do not continue if closed
    try {
        await browser.tabs.get(obj.tabId);
    }
    catch (err) {
        // Tab already closed.
        return;
    }

    // If this page was requested using POST, make sure the user
    // knows the risks and really wants to refresh
    if ((obj.reqMethod != "GET") && (period != -1) && !obj.postConfirmed && !Settings.neverConfirmPost) {
        let popupURL = browser.extension.getURL("pages/post-confirm.html");
        let createData = {
            type: "popup",
            url: `${popupURL}?tabId=${obj.tabId}&period=${period}`,
            width: 800,
            height: 247
        };
        let win = await browser.windows.create(createData);
        return browser.windows.update(win.id, { drawAttention: true });
    }

    // Custom interval
    if (period == -2) {
        let popupURL = browser.extension.getURL("pages/custom-interval.html");
        let createData = {
            type: "popup",
            url: `${popupURL}?tabId=${obj.tabId}`,
            width: 400,
            height: 247
        };
        let win = await browser.windows.create(createData);
        return browser.windows.update(win.id, { drawAttention: true });
    }

    // Set period truely
    obj.period = period;
    return Promise.all([applyTabProps(obj), rememberSet(obj)]);
}

async function rememberSet(obj) {

    // We need the tab's URL
    let tab;
    try {
        tab = await browser.tabs.get(obj.tabId);
    } catch (err) {
        // Tab already closed. Ignore.
        return;
    }

    // Don't store anything on the computer in incognito mode
    if (tab.incognito) {
        return;
    }

    // We use only portions of the URL to generalize it to a certain page
    // without protocol or query parameters
    let url = parseUri(tab.url);
    url = url.authority + url.path;

    // Store (or delete)
    if (obj.remember) {
        urlMemory.set(url, clone(obj));
    } else {
        urlMemory.delete(url);
    }

    return browser.storage.local.set({
        // We can only serialize Map objects "unpacked"
        urlMemory: [...urlMemory]
    });
}

function migratePropObj(newObj, oldObj) {
    let tmp = clone(oldObj);
    tmp.tabId = newObj.tabId;
    tmp.alarmName = newObj.alarmName;
    Object.keys(newObj).forEach(function (key, index) {
        if (tmp.hasOwnProperty(key)) {
            newObj[key] = tmp[key];
        }
    });
}

async function rememberGet(obj) {
    // Reconstruct the URL as we did while saving
    let tab = await browser.tabs.get(obj.tabId);
    let url = parseUri(tab.url);
    url = url.authority + url.path;

    if (urlMemory.has(url)) {
        // Load stored settings
        migratePropObj(obj, urlMemory.get(url));
        return true;
    } else {
        return false;
    }
}

function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

async function reloadTab(obj, forceNocache = false) {
    obj.reloadByAddon = true;

    if ((obj.reqMethod != "GET") && (obj.postConfirmed || Settings.neverConfirmPost)) {
        // Delete old URL from history because our refresh
        // will create a new history entry.
        let items = await browser.history.search({ text: obj.url, maxResults: 1 });
        if (items.length > 0) {
            let visitTime = items[0].lastVisitTime
            await browser.history.deleteRange({
                startTime: visitTime-1,
                endTime: visitTime+1
            });
        }

        obj.keepRefreshing = true;
        let msg = {
            event: "reload",
            postData: obj.formData
        };
        return browser.tabs.sendMessage(obj.tabId, msg);
    } else {
        return browser.tabs.reload(obj.tabId, { bypassCache: forceNocache || obj.nocache });
    }
}

async function reloadAllTabs() {
    let tabs = await browser.tabs.query({windowId: CurrentWindowId});
    let promises = [];
    for (let tab of tabs) {
        let obj = getTabProps(tab.id);
        promises.push(reloadTab(obj));
    }

    return Promise.all(promises);
}

// Handle clicking on menu entries
browser.menus.onClicked.addListener(function (info, tab) {

    if (info.menuItemId === 'reloadmatic-mnu-settings') {
        browser.runtime.openOptionsPage();
    } else if (info.menuItemId === 'reloadmatic-mnu-faq') {
        browser.tabs.create({
            active: true,
            url: browser.extension.getURL("pages/faq.html")
        });
    } else if (info.menuItemId === 'reloadmatic-mnu-amo') {
        browser.tabs.create({
            active: true,
            url: "https://addons.mozilla.org/en-US/firefox/addon/reloadmatic/"
        });
    } else if (info.menuItemId === 'reloadmatic-mnu-support') {
        browser.tabs.create({
            active: true,
            url: "https://github.com/pylorak/reloadmatic/issues"
        });
    }

    if (tab.id == browser.tabs.TAB_ID_NONE) {
        return
    }
    let obj = getTabProps(tab.id)

    if (info.menuItemId === 'reloadmatic-mnu-period--1') {
        setTabPeriod(obj, -1);
    } else if (info.menuItemId === 'reloadmatic-mnu-period--2') {
        setTabPeriod(obj, -2);
    } else if (info.menuItemId.startsWith("reloadmatic-mnu-period")) {
        setTabPeriod(obj, Number(info.menuItemId.split("-")[3]));
    } else if (info.menuItemId === 'reloadmatic-mnu-randomize') {
        obj.randomize = info.checked
        rememberSet(obj);
    } else if (info.menuItemId === 'reloadmatic-mnu-remember') {
        obj.remember = info.checked
        rememberSet(obj);
    } else if (info.menuItemId === 'reloadmatic-mnu-disable-cache') {
        obj.nocache = info.checked
        rememberSet(obj);
    } else if (info.menuItemId === 'reloadmatic-mnu-smart') {
        obj.smart = info.checked
        rememberSet(obj);
    } else if (info.menuItemId === 'reloadmatic-mnu-sticky') {
        obj.stickyReload = info.checked
        rememberSet(obj);
    } else if (info.menuItemId === 'reloadmatic-mnu-unsuccessful') {
        obj.onlyOnError = info.checked
        rememberSet(obj);
        restartAlarm(obj)
    } else if (info.menuItemId === 'reloadmatic-mnu-reload') {
        reloadTab(obj, true);
    } else if (info.menuItemId === 'reloadmatic-mnu-reload-all') {
        reloadAllTabs();
    } else if (info.menuItemId === 'reloadmatic-mnu-enable-all') {
        browser.tabs.query({}).then((tabs) => {
            for (let tab of tabs) {
                let other = getTabProps(tab.id);
                let oldOther = clone(other);
                migratePropObj(other, obj);
                other.postConfirmed = oldOther.postConfirmed;
                setTabPeriod(other, other.period);
            }
            return;
        })
        .catch(console.log.bind(console));
    } else if (info.menuItemId === 'reloadmatic-mnu-disable-all') {
        browser.tabs.query({}).then((tabs) => {
            for (let tab of tabs) {
                let obj = getTabProps(tab.id);
                setTabPeriod(obj, -1);
            }
            return;
        })
        .catch(console.log.bind(console));
    }

    if (session57Available) {
        browser.sessions.setTabValue(tab.id, "reloadmatic", obj)
    }
});

if (session57Available) {
    browser.tabs.onCreated.addListener(async function(tab) {
        let tabId = tab.id;
        let obj = await browser.sessions.getTabValue(tabId, "reloadmatic");
        if (obj) {
            // Handle restoring settings for an old tab.
            // Tab ID might have changed, so correct for that.
            let alarm_name = objKey(tabId);
            obj.tabId = tabId;
            obj.alarmName = alarm_name;
            obj.keepRefreshing = true;
            state.set(alarm_name, obj);
            return applyTabProps(obj);
        }
    });
}

browser.webRequest.onBeforeRequest.addListener((details) => {
    let obj = getTabProps(details.tabId);
    obj.reqMethod = details.method;
    if ((obj.reqMethod != "GET") && details.requestBody) {
        obj.formData = clone(details.requestBody.formData);
    } else {
        obj.formData = null;
    }

    if ((obj.reqMethod != "GET") && !obj.postConfirmed && !Settings.neverConfirmPost) {
        // We just issued a POST-request,
        // and the user didn't yet confirm this.
        // So disable autoreloads.
        if (obj.period != -1) {
            obj.period = -1
            if (Settings.notifications.unconfirmedPost) {
                browser.notifications.create(
                    "clickActivateTab-" + details.tabId,
                    {
                        "type": "basic",
                        "iconUrl": browser.extension.getURL("icon.svg"),
                        "title": "Timer disabled - POST page",
                        "message":
                        "Please reset timer in the affected\r\n"+
                        "tab and confirm if asked."
                    }
                );
            }
        }
        applyTabProps(obj)
    }
},
    { urls: ["<all_urls>"], types: ["main_frame"] },
    ["requestBody"]
);

browser.alarms.onAlarm.addListener((alarm) => {
    let obj = state.get(alarm.name);

    if (!obj.onlyOnError || obj.loadError) {    // handling "Only if unsuccessful" feature

        // Delay firing alarm until time is freezeUntil,
        // fire otherwise.
        let now = Date.now();
        if (obj.smart && (obj.freezeUntil > now)) {
            let deltaInSeconds = (obj.freezeUntil - now) / 1000;
            browser.alarms.create(obj.alarmName, { delayInMinutes: deltaInSeconds * TIME_FACTOR });
        } else {
            reloadTab(obj);
        }   // smart
    }   // if onlyOnError ...
});

async function sendContentTabId(tabId) {
    let msg = {
        event: "set-tab-id",
        tabId: tabId
    }
    return browser.tabs.sendMessage(tabId, msg)
}

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (tabId == browser.tabs.TAB_ID_NONE) {
        return;
    }

    let obj = getTabProps(tabId)

    // Tell content-script what tab it is running in
    sendContentTabId(tabId)

    // Start or stop alarm based on page loading progress
    if ('status' in changeInfo) {
        if (changeInfo.status === 'complete') {
            // Scroll page to same position as before reload
            if (obj.reloadByAddon && (obj.scrollX != undefined)) {
                let msg = {
                    event: "scroll",
                    scrollX: obj.scrollX,
                    scrollY: obj.scrollY
                }
                browser.tabs.sendMessage(tabId, msg)
            }

            obj.reloadByAddon = false;

            // Start reload timer once page is completely loaded
            restartAlarm(obj)
        } else {
            // Don't autoreload while page is being loaded
            browser.alarms.clear(obj.alarmName)
        }
    }

    // "Pinning sets Remember" option
    if (Settings.pinSetsRemember && ('pinned' in changeInfo)) {
        obj.remember = changeInfo.pinned;
        rememberSet(obj);
        refreshMenu();
    }
});

browser.webNavigation.onCommitted.addListener(async function (details) {
    // Remove alarm if tab navigated due to a user action
    if (details.frameId == 0) {
        let tabId = details.tabId
        let obj = getTabProps(tabId)
        let type = details.transitionType
        let reloading = !((type != "auto_subframe") && (type != "reload"))
        let cancelTimer = !reloading && !obj.keepRefreshing && !obj.stickyReload
        if (!reloading) {
            obj.remember = false;
        }
        if (cancelTimer) {
            // On a user-initiated navigation,
            // we cancel the timer but leave other settings alone
            obj.period = -1;
            await rememberGet(obj);
            applyTabProps(obj);

            if (Settings.notifications.navigateAway) {
                browser.notifications.create(
                    "clickActivateTab-" + details.tabId,
                    {
                        "type": "basic",
                        "iconUrl": browser.extension.getURL("icon.svg"),
                        "title": "Timer disabled - you left the page",
                        "message":
                        "If you don't want this to happen again,\r\n"+
                        "enable the Sticky Reload option in the\r\n"+
                        "tab or make it default in the addon settings."
                    }
                );
            }

        } else {
            await rememberGet(obj);
            applyTabProps(obj);
        }

        // If the URL changed, forget scroll position in tab
        if (obj.url != details.url) {
            obj.scrollX = undefined;
            obj.scrollY = undefined;
            obj.url = details.url;
        }
    }
});

browser.webNavigation.onCompleted.addListener((details) => {
    // Remove alarm if tab navigated due to a user action
    if (details.frameId == 0) {
        let tabId = details.tabId
        let obj = getTabProps(tabId)
        obj.keepRefreshing = false
    }
});

function freezeReload(tabId, duration) {
    let obj = getTabProps(tabId)
    obj.freezeUntil = Date.now() + duration
}

browser.runtime.onMessage.addListener((message) => {
    if (message.event == "activity") {
        // Delay a pending reload if there is activity
        freezeReload(message.tabId, Settings.smartTiming.delaySecs*1000)
    } else if (message.event == "typing-activity") {
        // Delay a pending reload if there is activity, or cancel timer
        // (based on settings)
        if (Settings.smartTiming.typeReaction == "radSmartTimingTextDelay") {
            freezeReload(message.tabId, Settings.smartTiming.delaySecs*1000)
        } else {
            let obj = getTabProps(message.tabId)
            if (obj.period != -1)
            {
                setTabPeriod(obj, -1);
                if (Settings.notifications.textInput) {
                    browser.notifications.create(
                        "clickActivateTab-" + message.tabId,
                        {
                            "type": "basic",
                            "iconUrl": browser.extension.getURL("icon.svg"),
                            "title": "Timer disabled - you are typing",
                            "message":
                            "If you wish to keep the timer enabled,\r\n"+
                            "disable Smart Timing or change its options\r\n"+
                            "in the addon settings."
                        }
                    );
                }
            }
        }
    } else if (message.event == "set-tab-interval") {
        setTabPeriod(getTabProps(message.tabId), message.period);
    } else if (message.event == "scroll") {
        // A page is telling us its scroll position
        let obj = getTabProps(message.tabId)
        obj.scrollX = message.arg1;
        obj.scrollY = message.arg2;
    }
})

browser.tabs.onActivated.addListener((info) => {
    // Delay reload on activity
    freezeReload(info.tabId, Settings.smartTiming.delaySecs*1000)

    // If we are using FF60, we update the menu in its onShown().
    // Otherwise we update it here.
    if (!menu60Available) {
        // Update menu for newly activated tab
        updateMenuForTab(info.tabId);
    }
})

browser.windows.onFocusChanged.addListener(async function(windowId) {
    CurrentWindowId = windowId

    let tabs = await browser.tabs.query({ windowId: CurrentWindowId, active: true });
    if (tabs.length > 0) {
        let tab = tabs[0];
        freezeReload(tab.id, Settings.smartTiming.delaySecs*1000)
        if (!menu60Available) { // In FF60, the menu's onShown() handles the update
            return updateMenuForTab(tab.id)
        }
    }
})


/***********************************************
* Following functions used for "Only if unsuccessful" feature
***********************************************/

function webRequestError(responseDetails) {
    let tabId = responseDetails.tabId
    let obj = getTabProps(tabId)
    obj.loadError = true
}
function webRequestComplete(responseDetails) {
    let tabId = responseDetails.tabId
    let obj = getTabProps(tabId)
    obj.loadError = (responseDetails.statusCode >= 400)
}
browser.webRequest.onErrorOccurred.addListener(webRequestError, { urls: ["<all_urls>"], types: ["main_frame", "sub_frame"] })
browser.webRequest.onCompleted.addListener(webRequestComplete, { urls: ["<all_urls>"], types: ["main_frame", "sub_frame"] })


/***********************************************
* Following functions are used for updating the menu
***********************************************/

async function disablePeriodMenus() {
    let promises = [];
    for (let i = 0; i < num_periods / 2; i++) {
        promises.push(
            browser.menus.update(
                `reloadmatic-mnu-period-${reload_periods[i * 2]}`,
                {
                    checked: false,
                    title: reload_periods[i * 2 + 1]
                }
            )
        );
    }
    return Promise.all(promises);
}

function formatInterval(total) {
    let ret = ""
    let h = Math.floor(total / 3600)
    total -= h * 3600
    let m = Math.floor(total / 60)
    total -= m * 60
    let s = total

    if (h > 0) {
        ret = `${ret} ${h}h`
    }
    if (m > 0) {
        ret = `${ret} ${m}m`
    }
    if (s > 0) {
        ret = `${ret} ${s}s`
    }

    if ((h != 0) && (m == 0) && (s == 0)) {
        ret = ` ${h} hours`
    } else if ((h == 0) && (m != 0) && (s == 0)) {
        ret = ` ${m} minutes`
    } else if ((h == 0) && (m == 0) && (s != 0)) {
        ret = ` ${s} secs`
    }

    return ret
}

async function updateMenuForTab(tabId) {

    // We only need these later, but we start them early
    // to have the async results ready by the time we need them.
    let tabPromise = browser.tabs.get(tabId);
    let periodResetPromise = disablePeriodMenus();

    let obj = getTabProps(tabId);
    let promises = [];

    promises.push(browser.menus.update("reloadmatic-mnu-randomize", { checked: obj.randomize }));
    promises.push(browser.menus.update("reloadmatic-mnu-unsuccessful", { checked: obj.onlyOnError }));
    promises.push(browser.menus.update("reloadmatic-mnu-smart", { checked: obj.smart }));
    promises.push(browser.menus.update("reloadmatic-mnu-sticky", { checked: obj.stickyReload }));
    promises.push(browser.menus.update("reloadmatic-mnu-disable-cache", { checked: obj.nocache }));

    // Enable/disable "Remember Page" based on incognito mode
    let tab = await tabPromise;
    if (tab.incognito) {
        promises.push(browser.menus.update("reloadmatic-mnu-remember", { checked: false, enabled: false }));
    } else {
        promises.push(browser.menus.update("reloadmatic-mnu-remember", { checked: obj.remember, enabled: true }));
    }

    // Iterate through available presets to see if our setting
    // corresponds to one of them or maybe it's a custom interval.
    let custom = true
    for (let i = 0; i < num_periods / 2; i++) {
        if (reload_periods[i * 2] === obj.period) {
            custom = false
            break;
        }
    }

    // Select the correct timer period menu option
    await periodResetPromise;
    if (custom) {
        promises.push(browser.menus.update(`reloadmatic-mnu-period--2`, { checked: true, title: `Custom:${formatInterval(obj.period)}` }));
    } else {
        promises.push(browser.menus.update(`reloadmatic-mnu-period-${obj.period}`, { checked: true }));
    }

    return Promise.all(promises);
}

async function refreshMenu() {
    // We take this path if we don't know the current tab id
    let tabs = await browser.tabs.query({ currentWindow: true, active: true });
    let tab = tabs[0];
    CurrentWindowId = tab.windowId
    return updateMenuForTab(tab.id);
}

if (menu60Available) {
    browser.menus.onShown.addListener(async function(info, tab) {
        await updateMenuForTab(tab.id);
        return browser.menus.refresh();
    });
}

browser.runtime.onUpdateAvailable.addListener(async function(details) {
    let upgradeInfo = {
        version: CONFIG_VERSION,
        state: [...state]
    };
    await browser.storage.local.set({ upgrade: upgradeInfo });
    return browser.runtime.reload();
});

function GetDefaultSettings() {
    return {
        defaults: {
            randomize: false,
            onlyOnError: false,
            smart: true,
            stickyReload: false,
            nocache: false
        },
        smartTiming: {
            delaySecs: 5,
            typeReaction: "radSmartTimingTextDisable"
        },
        notifications: {
            unconfirmedPost: true,
            navigateAway: false,
            textInput: true
        },
        pinSetsRemember: true,
        neverConfirmPost: false
    };
}

async function LoadSettingsAsync() {

    let results = await browser.storage.local.get("settings");
    if (results && results.settings) {
        let settings = results.settings;

        // If saved settings has missing keys (for example we upgraded
        // and new addon version supports more options), we migrate
        // old settings into the new settings structure here.
        let tmp = GetDefaultSettings();
        Object.keys(tmp).forEach(function (key, index) {
            if (settings.hasOwnProperty(key)) {
                tmp[key] = settings[key];
            }
        });

        // Done.
        Settings = tmp;
    } else {
        // Error. Load defaults.
        Settings = GetDefaultSettings();
    }
    return Settings;
}

function on_notification_clicked(notificationId) {

    let tokens = notificationId.split("-");
    let notifType = tokens[0];
    let tabId = null;
    if (tokens.length > 1) {
        tabId = Number(tokens[1]);
    }
    if (notifType == "clickActivateTab")
    {
        // Activate tab
        browser.tabs.update(tabId, {active: true});

        // Activate the tab's window
        browser.tabs.get(tabId).then((tab) => {
            return browser.windows.update(tab.windowId, { focused: true });
        })
        .catch(console.log.bind(console));
    }
}

async function on_addon_load() {

    browser.notifications.onClicked.addListener(on_notification_clicked);

    await LoadSettingsAsync();

    let upgrading = false;
    try {
        let results = await browser.storage.local.get("upgrade");
        if (results && results.upgrade) {
            if (results.upgrade.version <= CONFIG_VERSION) {

                let newState = new Map(results.upgrade.state)

                for (var [key, obj] of newState) {

                    // Migrate settings from old version
                    let newObj = newTabProps(obj.tabId);
                    migratePropObj(newObj, obj);
                    state.set(newObj.alarmName, newObj);
                }

                upgrading = true;
            }
        }
    }
    catch (err) {
        // Ignore errors from upgrade.
        console.log(err);
    }

    // Remove stuff that we only needed for the upgrade
    browser.storage.local.remove("upgrade");

    // Load data for "Remember Page" function
    let results = await browser.storage.local.get("urlMemory");
    if (results && results.urlMemory) {
        urlMemory = new Map(results.urlMemory);
    }

    let tabs = await browser.tabs.query({});
    let promises = [];
    for (let tab of tabs) {
        promises.push(Promise.resolve().then(async function() {
            let obj = getTabProps(tab.id);
            let rememberGetPromise = rememberGet(obj);

            await browser.tabs.executeScript(tab.id, { file: "/content-script.js" });
            await sendContentTabId(tab.id);
            if (!upgrading) {
                // Already loaded tabs might be using POST *sigh*
                // We can't just use POST in this case
                // because if the page is using GET, POSTing might
                // be completely disallowed. So we'll fall back to
                // browser reload, but say that the user has
                // already confirmed POST. This way the browser
                // might show a popup, but ReloadMatic will then
                // see it was a POST, and at least won't ask a
                // second time by itself.
                obj.reqMethod = "GET";
                obj.postConfirmed = true;
            }
            await rememberGetPromise;
            return applyTabProps(obj);
        }));
    }
    await Promise.all(promises);

    if (!menu60Available) { // In FF60, the menu's onShown() handles the update
       // Update menu to show status of active tab in current window
        refreshMenu();
    }
}

on_addon_load().catch(console.log.bind(console));
