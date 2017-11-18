var background = browser.extension.getBackgroundPage()
var targetTabId = Number(new URL(window.location.href).searchParams.get("tabId"))
var period = Number(new URL(window.location.href).searchParams.get("period"))
var tooltip;


function submitEvent(ev) {
    ev.preventDefault();

    // Commit
    obj = background.getTabProps(targetTabId);
    obj.postConfirmed = true;
    browser.runtime.sendMessage({
        event: "set-tab-interval",
        tabId: targetTabId,
        period: period
    });
    browser.windows.remove(browser.windows.WINDOW_ID_CURRENT);
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
    tooltip = document.getElementById("tabTitle")
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
