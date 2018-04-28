var background = browser.extension.getBackgroundPage()
var targetTabId = Number(new URL(window.location.href).searchParams.get("tabId"))
var urlText;

function isEmpty(str) {
    return (!str || (0 === str.length));
}

function submitEvent(ev) {
    ev.preventDefault();

    // Validation and parsing
    let valid = true;
    let url = urlText.value.trim();
    if (isEmpty(url)) {
        alert("The URL field cannot be empty!");
        valid = false;
    }

    if (!url.startsWith("http://") && !url.startsWith("https://")) {
        url = "http://" + url;
    }

    // Commit
    if (valid) {
        browser.runtime.sendMessage({
            event: "set-fixed-url",
            tabId: targetTabId,
            url: url
        })
        browser.windows.remove(browser.windows.WINDOW_ID_CURRENT)
    }
};

function cancelEvent(ev) {
    browser.windows.remove(browser.windows.WINDOW_ID_CURRENT)
};

document.addEventListener("DOMContentLoaded", (event) => {
    urlText = document.getElementById("url");

    document.getElementById("form-id").addEventListener('submit', submitEvent, false);
    document.getElementById("cancel").addEventListener('click', cancelEvent, false);

    browser.windows.getCurrent((win) => {
        // Calculate needed window size
        var content = document.getElementById("content-id")
        var heightOffset = window.outerHeight - window.innerHeight;
        var widthOffset = window.outerWidth - window.innerWidth;
        var height = content.clientHeight + heightOffset;
        var width = content.clientWidth + widthOffset;
        var settings = { height: height + 20, width: width + 20 };
        return browser.windows.update(win.id, settings).then(() => {
            // Set focus to text input field
            urlText.focus();
            return;
        });
    })
});

// Escape key is same as Cancel
document.addEventListener('keydown', function (ev) {
    if ((ev.keyCode) == 27) {
        cancelEvent();
    }
}, true);
