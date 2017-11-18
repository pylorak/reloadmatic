// Configuration format version
const CONFIG_VERSION = 1

// Conversion factor from seconds to minutes
const TIME_FACTOR = 1.0 / 60.0

// true if we can use session APIs from FF 57.0
const session57Available = (typeof browser.sessions.setTabValue === "function")

// Here we store all our data about tabs
var state = new Map()

// ID of the currently focused window
var CurrentWindowId = 0

function objKey(tabId) {
    return `tab-${tabId}-alarm`;
}

// Returns a default-initialized instance of the object
// that describes all add-on related properties of a
// browser tab.
function newTabProps(tabId) {
    return {
        alarmName: objKey(tabId),   // name of the alarm and key in collections
        randomize: false,           // whether "Randomize" is enabled
        loadError: false,           // whether there was an error in loading the page
        keepRefreshing: false,      // true if periodic refresh should not be disabled
        onlyOnError: false,         // whether "Only if unsuccessful" is enabled
        smart: true,                // whether "Smart timing" is enabled
        stickyReload: false,        // whether to keep reloading after page changes
        nocache: false,             // whether "Disable cache" is enabled
        period: -1,                 // canonical autoreload interval
        freezeUntil: 0,             // time until we are not allowed to reload
        tabId: tabId,               // id of the tab we belong to
        reqMethod: "GET",           // HTTP method the page was retrieved with
        postConfirmed: false        // true if user wants to resend POST data
    }
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

function restartAlarm(obj) {
    // If period is negative we are deleting the alarm
    browser.alarms.clear(obj.alarmName)
    if (obj.period < 0) {
        obj.postConfirmed = false;
        return;
    }

    // Create new alarm
    let period = obj.period
    if (obj.randomize) {
        let min = period * 0.5
        let max = period * 1.5
        period = Math.random() * (max - min + 1) + min
    }
    browser.alarms.create(obj.alarmName, { delayInMinutes: period * TIME_FACTOR });
}

function setTabPeriod(obj, period) {
    browser.tabs.get(obj.tabId).then((tab) => {   // prevents saving if tab does not exist anymore

        // If this page was requested using POST, make sure the user
        // knows the risks and really wants to refresh
        if ((obj.reqMethod != "GET") && (period != -1) && !obj.postConfirmed) {
            let popupURL = browser.extension.getURL("pages/post-confirm.html");
            let createData = {
                type: "popup",
                url: `${popupURL}?tabId=${obj.tabId}&period=${period}`,
                width: 800,
                height: 247
            };
            browser.windows.create(createData).then((win) => {
                browser.windows.update(win.id, { drawAttention: true })
            });
            return;
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
            browser.windows.create(createData).then((win) => {
                browser.windows.update(win.id, { drawAttention: true })
            });
            return;
        }

        obj.period = period;
        restartAlarm(obj);
        if (session57Available) {
            browser.sessions.setTabValue(obj.tabId, "reloadmatic", obj)
        }
    });
}


// Handle clicking on menu entries
browser.menus.onClicked.addListener(function (info, tab) {
    //    browser.menus.update("reloadmatic-mnu-root", { title: `Tab ID: ${tab.id}` })

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
    } else if (info.menuItemId === 'reloadmatic-mnu-disable-cache') {
        obj.nocache = info.checked
    } else if (info.menuItemId === 'reloadmatic-mnu-smart') {
        obj.smart = info.checked
    } else if (info.menuItemId === 'reloadmatic-mnu-sticky') {
        obj.stickyReload = info.checked
    } else if (info.menuItemId === 'reloadmatic-mnu-unsuccessful') {
        obj.onlyOnError = info.checked
        restartAlarm(obj)
    } else if (info.menuItemId === 'reloadmatic-mnu-reload') {
        browser.tabs.reload(tab.id, { bypassCache: true })
    } else if (info.menuItemId === 'reloadmatic-mnu-reload-all') {
        browser.tabs.query({}).then((tabs) => {
            for (let tab of tabs) {
                browser.tabs.reload(tab.id, { bypassCache: true })
            }
        })
    }

    if (session57Available) {
        browser.sessions.setTabValue(tab.id, "reloadmatic", obj)
    }
});

if (session57Available) {
    browser.tabs.onCreated.addListener((tab) => {
        let tabId = tab.id
        let obj = getTabProps(tabId)
        browser.sessions.getTabValue(tabId, "reloadmatic").then((obj) => {
            if (obj) {
                // Handle restoring settings for an old tab.
                // Tab ID might have changed, so correct for that.
                let alarm_name = objKey(tabId)
                obj.tabId = tabId
                obj.alarmName = alarm_name
                obj.keepRefreshing = true
                state.set(alarm_name, obj)
                refreshMenu(undefined)
                restartAlarm(obj)
                browser.sessions.setTabValue(tabId, "reloadmatic", obj)
            }
        })
    })
}

browser.webRequest.onBeforeRequest.addListener((details) => {
    let obj = state.get(objKey(details.tabId))
    obj.reqMethod = details.method;
    if (details.requestBody) {
        obj.formData = details.requestBody.formData;
    } else {
        obj.formData = null;
    }
},
    { urls: ["<all_urls>"], types: ["main_frame"] },
    ["requestBody"]
);

browser.alarms.onAlarm.addListener((alarm) => {
    let obj = state.get(alarm.name)

    if (!obj.onlyOnError || obj.loadError) {    // handling "Only if unsuccessful" feature

        // Delay firing alarm until time is freezeUntil,
        // fire otherwise.
        let now = Date.now()
        if (obj.smart && (obj.freezeUntil > now)) {
            let deltaInSeconds = (obj.freezeUntil - now) / 1000
            browser.alarms.create(obj.alarmName, { delayInMinutes: deltaInSeconds * TIME_FACTOR });
        } else {
            if (obj.reqMethod === "GET") {
                browser.tabs.reload(obj.tabId, { bypassCache: obj.nocache })
            } else {
                // Delete old URL from history because our refresh
                // will create a new history entry.
                browser.tabs.get(obj.tabId).then((tab) => {
                    browser.history.deleteUrl({ url: tab.url }).then(() => {
                        obj.keepRefreshing = true;
                        let msg = {
                            event: "reload",
                            postData: obj.formData
                        };
                        browser.tabs.sendMessage(obj.tabId, msg);
                    });
                });
            }
        }
    }
});

function sendContentTabId(tabId) {
    let msg = {
        event: "set-tab-id",
        tabId: tabId
    }
    browser.tabs.sendMessage(tabId, msg)
}

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (tabId == browser.tabs.TAB_ID_NONE) {
        return
    }

    // Tell content-script what tab it is running in
    sendContentTabId(tabId)

    if ('status' in changeInfo) {
        let obj = getTabProps(tabId)
        if (changeInfo.status === 'complete') {
            // Start reload timer once page is completely loaded
            restartAlarm(obj)
        } else {
            // Don't autoreload while page is being loaded
            browser.alarms.clear(obj.alarmName)
        }
    }
});

browser.webNavigation.onCommitted.addListener((details) => {
    // Remove alarm if tab navigated due to a user action
    if (details.frameId == 0) {
        let tabId = details.tabId
        let obj = getTabProps(tabId)
        let type = details.transitionType
        let cancelTimer = (type != "auto_subframe") && (type != "reload") && !obj.keepRefreshing && !obj.stickyReload
        if (cancelTimer) {
            // On a user-initiated navigation,
            // we cancel the timer but leave other settings alone
            obj.period = -1
            refreshMenu(undefined)
            restartAlarm(obj)
            if (session57Available) {
                browser.sessions.setTabValue(tabId, "reloadmatic", obj)
            }
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
        // If there is some activity in the tab, delay a potential pending reload
        freezeReload(message.tabId, 3000)
    } else if (message.event == "set-tab-interval") {
        setTabPeriod(getTabProps(message.tabId), message.period);
    }
})

browser.tabs.onActivated.addListener((info) => {
    // Delay reload on activity
    freezeReload(info.tabId, 5000)

    // Update menu for newly activated tab
    refreshMenu(info.tabId)
})

browser.windows.onFocusChanged.addListener((windowId) => {
    CurrentWindowId = windowId

    browser.tabs.query({ windowId: CurrentWindowId, active: true }).then((tabs) => {
        for (let tab of tabs) {
            freezeReload(tab.id, 5000)
            refreshMenu(tab.id)
        }
    })
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

function disablePeriodMenus() {
    for (let i = 0; i < num_periods / 2; i++) {
        browser.menus.update(
            `reloadmatic-mnu-period-${reload_periods[i * 2]}`,
            {
                checked: false,
                title: reload_periods[i * 2 + 1]
            }
        )
    }
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

function menuSetActiveTab(tabId) {
    let obj = getTabProps(tabId)
    disablePeriodMenus()

    // Iterate through available presets to see if our setting
    // corresponds to one of them or maybe it's a custom interval.
    let custom = true
    for (let i = 0; i < num_periods / 2; i++) {
        if (reload_periods[i * 2] === obj.period) {
            custom = false
            break;
        }
    }
    if (custom) {
        browser.menus.update(`reloadmatic-mnu-period--2`, { checked: true, title: `Custom:${formatInterval(obj.period)}` })
    } else {
        browser.menus.update(`reloadmatic-mnu-period-${obj.period}`, { checked: true })
    }

    browser.menus.update("reloadmatic-mnu-randomize", { checked: obj.randomize })
    browser.menus.update("reloadmatic-mnu-unsuccessful", { checked: obj.onlyOnError })
    browser.menus.update("reloadmatic-mnu-smart", { checked: obj.smart })
    browser.menus.update("reloadmatic-mnu-sticky", { checked: obj.stickyReload })
    browser.menus.update("reloadmatic-mnu-disable-cache", { checked: obj.nocache })
}

function refreshMenu(tabId) {
    if (Number.isInteger(tabId)) {
        // More efficient code path for known tab id
        browser.tabs.get(tabId).then((tab) => {
            if (tab.windowId == CurrentWindowId) {
                menuSetActiveTab(tab.id)
            }
        })
    } else {
        // We take this path if we don't know the current tab id
        browser.tabs.query({ currentWindow: true, active: true }).then((tabs) => {
            for (let tab of tabs) {
                CurrentWindowId = tab.windowId
                menuSetActiveTab(tab.id)
            }
        })
    }
}

browser.runtime.onUpdateAvailable.addListener((details) => {
    browser.storage.local.set({
        version: CONFIG_VERSION,
        props: state
    }).then(() => {
        browser.runtime.reload();
    });
});

function on_addon_load() {
    // Our content-script is only automatically loaded to new pages.
    // This means we need to load our content script at add-on load time
    // manually to all already open tabs. Do that now.

    browser.storage.local.get().then((results) => {

        let loadDefaults = true;

        // Try to load previous settings
        try {
            if (results && results.version && results.props) {
                if (results.version <= CONFIG_VERSION) {
                    // Restore settings after an upgrade
                    state = results.props

                    // Reapply timers
                    for (var [key, obj] of state) {
                        setTabPeriod(obj, obj.period);
                    }

                    loadDefaults = false;
                }
            }
        }
        catch (err) { }

        if (loadDefaults) {
            browser.tabs.query({}).then((tabs) => {
                for (let tab of tabs) {
                    browser.tabs.executeScript(tab.id, { file: "/content-script.js" }).then((result) => {
                        sendContentTabId(tab.id)
                    })

                    // Already loaded tabs might be using POST *sigh*
                    // We'll just assume they do to prevent the browser
                    // for asking for confirmation.
                    let obj = getTabProps(tab.id);
                    obj.reqMethod = "POST";
                    obj.postConfirmed = true;
                }
            });
        }

        // For now the storage area is only used to support upgrades.
        // Hence we clear it after loading the plugin because we won't
        // need it anymore.
        browser.storage.local.clear()

        // Update menu to show status of active tab in current window
        refreshMenu(undefined)
    });
}

on_addon_load()
