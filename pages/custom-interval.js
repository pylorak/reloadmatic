var background = browser.extension.getBackgroundPage()
var tooltip = document.getElementById("tabTitle")
var intervalText = document.getElementById("interval");
var targetTabId = Number(new URL(window.location.href).searchParams.get("tabId"))

function isEmpty(str) {
    return (!str || (0 === str.length));
}

function isInt(str) {
    let n = Number(str);
    return !isEmpty(str) && !isNaN(str) && (Math.floor(n) == n);
}

function parseInterval(str) {
    // Try to parse input
    let valid = false;
    let days = 0, hours = 0, minutes = 0, seconds = 0;
    let pat = /^\s*(\d+)\s*(days|day|d)\s*/gi;
    let m = pat.exec(str)
    if (m) {
        days = Number(m[1]);
        str = str.replace(m[0], "");
        valid = true;
    }
    pat = /^\s*(\d+)\s*(hours|hour|h)\s*/gi;
    m = pat.exec(str)
    if (m) {
        hours = Number(m[1]);
        str = str.replace(m[0], "");
        valid = true;
    }
    pat = /^\s*(\d+)\s*(minutes|minute|mins|min|m)\s*/gi;
    m = pat.exec(str)
    if (m) {
        minutes = Number(m[1]);
        str = str.replace(m[0], "");
        valid = true;
    }
    pat = /^\s*(\d+)\s*(seconds|second|secs|sec|s)?\s*/gi;
    m = pat.exec(str)
    if (m) {
        seconds = Number(m[1]);
        str = str.replace(m[0], "");
        valid = true;
    }

    if (valid && isEmpty(str)) {
        let total = days*3600*24 + hours*3600 + minutes*60 + seconds;
        return total;
    } else {
        return undefined
    }
}

function submitEvent(ev) {
    ev.preventDefault();

    // Validation and parsing
    let valid = true;
    let seconds = parseInterval(intervalText.value);
    if (!seconds) {
        alert("Invalid timer interval.");
        valid = false;
    } else if (seconds < 1) {
        alert("The smallest interval you may use is 1 second.")
        valid = false;
    }

    // Commit
    if (valid) {
        browser.runtime.sendMessage({
            event: "set-tab-interval",
            tabId: targetTabId,
            period: seconds
        })
        browser.windows.remove(browser.windows.WINDOW_ID_CURRENT)
    }
};

function cancelEvent(ev) {
    browser.windows.remove(browser.windows.WINDOW_ID_CURRENT)
};

function updateTitleTooltip() {
    browser.tabs.get(targetTabId).then((tab) => {
        tooltip.textContent = tab.title
    })
}

document.addEventListener("DOMContentLoaded", (event) => {
    document.getElementById("form-id").addEventListener('submit', submitEvent, false)
    document.getElementById("cancel").addEventListener('click', cancelEvent, false)

    updateTitleTooltip()

    browser.windows.getCurrent((win) => {
        // Calculate needed window size
        var content = document.getElementById("content-id")
        var heightOffset = window.outerHeight - window.innerHeight;
        var widthOffset = window.outerWidth - window.innerWidth;
        var height = content.clientHeight + heightOffset;
        var width = content.clientWidth + widthOffset;
        var settings = { height: height + 20, width: width + 20 }
        browser.windows.update(win.id, settings).then(() => {
            // Set focus to text input field
            intervalText.focus()
        })
    })
});

// Escape key is same as Cancel
document.addEventListener('keydown', function (ev) {
    if ((ev.keyCode) == 27) {
        cancelEvent()
    }
}, true);

// If the tab's title in the background changes,
// make it reflect in the tooltip
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (tabId == targetTabId) {
        if ('title' in changeInfo) {
            updateTitleTooltip()
        }
    }
});
