var background = browser.extension.getBackgroundPage()
var targetTabId = background.tabIdForCustomInterval
var tooltip = document.getElementById("tabTitle")
var intervalText = document.getElementById("interval");

function isEmpty(str) {
    return (!str || 0 === str.length);
}
function isInt(str) {
    let n = Number(str);
    return !isEmpty(str) && !isNaN(str) && (Math.floor(n) == n);
}

function submitEvent(ev) {
    ev.preventDefault();

    // Validation
    let valid = true;
    let period = 0
    if (isInt(intervalText.value)) {
        period = Number(intervalText.value);
        if (period < 5) {
            alert("The smallest interval you may use is 5 seconds.")
            valid = false;
        }
    } else {
        alert("Please enter a positive integer number.")
        valid = false;
    }

    // Commit
    if (valid) {
        browser.runtime.sendMessage({
            event: "set-tab-interval",
            tabId: targetTabId,
            period: period
        })
        window.close();
    }
};

function cancelEvent(ev) {
    window.close();
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
