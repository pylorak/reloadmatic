var tabId = null        // our current tabId
var bRefreshing = null  // true if a reload timer is active on this page

function toBackground(event, param1 = undefined, param2 = undefined) {
    if (tabId !== null) {   // don't send anything unless we know who we are
        browser.runtime.sendMessage({
            event: event,
            tabId: tabId,
            arg1: param1,
            arg2: param2,
        })
    }
}

function doPostRequest(url, postData) {
    // Create form element
    let form = document.createElement("form");
    form.action = "";
    form.method = "post";
    form.target = "_top";
    form.style.display = "none";

    // Pass each value-pair to the form as hidden fields
    if (postData) {
        Object.keys(postData).forEach(function (key, index) {
            let node = document.createElement("input");
            node.type = "hidden";
            node.name = key;
            node.value = postData[key];
            form.appendChild(node);
        });
    }

    // Send form, but first it needs to be attached to the main document
    document.body.appendChild(form);
    form.submit();
}

browser.runtime.onMessage.addListener((message) => {
    if (message.event == "set-tab-id") {
        tabId = message.tabId
    } else if (message.event == "reload-post") {
        let loc = window.location.protocol + '//' + window.location.host + window.location.pathname + window.location.search + window.location.hash;
        doPostRequest(loc, message.postData)
    } else if (message.event == "reload-get") {
        if (message.bypassCache) {
            // TODO: implement force reload
        }
        window.location = message.url;
    } else if (message.event == "timer-enabled") {
        setTimerBadge(true, false);
    } else if (message.event == "timer-disabled") {
        setTimerBadge(false, false);
    } else if (message.event == "scroll") {
        window.scrollTo(message.scrollX, message.scrollY);
    }})

window.addEventListener("mousedown", evt => {
    if (evt.button === 2) {
        toBackground("contextMenu")
    } else {
        toBackground("activity")
    }
}, true)

window.addEventListener("keydown", evt => {
    if (evt.shiftKey && evt.key === "F10" || evt.key === "ContextMenu") {
        toBackground("contextMenu")
    } else {

        // Determine if this was a keypress we want to ignore
        const ignoredKeys = [
            "Alt",
            "Control",
            "Fn",
            "FnLock",
            "Hyper",
            "Meta",
            "ScrollLock",
            "Super",
            "OS"
        ];
        if (ignoredKeys.includes(evt.key)) {
            return;
        }

        // Determine if the user was typing into a text field
        let bTextInput = false;
        const textTypes = [
            "text",
            "textarea",
            "search",
            "email",
            "password"
        ];
        try {
            bTextInput = textTypes.includes(evt.target.type);
        } catch (ex) { }

        // Let the background script know about the user activity
        if (bTextInput) {
            toBackground("typing-activity")
        } else {
            toBackground("activity")
        }
    }
}, true)

window.addEventListener("mousemove", evt => {
    toBackground("activity")
}, true)

window.addEventListener("scroll", evt => {
    toBackground("activity")
}, true)


// ---------------------------------
//     Scroll events
// ---------------------------------

var last_known_scrollX_position = 0;
var last_known_scrollY_position = 0;
var scrollReportingBlocked = false

window.addEventListener("scroll", evt => {
    last_known_scrollX_position = window.scrollX;
    last_known_scrollY_position = window.scrollY;

    if (!scrollReportingBlocked) {

        window.requestAnimationFrame(function () {
            toBackground(
                "scroll",
                last_known_scrollX_position,
                last_known_scrollY_position
            );
            scrollReportingBlocked = false;
        });

        scrollReportingBlocked = true;
    }
});


// ---------------------------------
//     Timer badge handling
// ---------------------------------

function setTimerBadge(bEnable, bThrottle) {

    const TIMER_BADGE = "↻ ";

    bRefreshing = bEnable;

    let noBadgeTitle = document.title.replace(TIMER_BADGE, '');
    let newTitle = null;
    if (bEnable) {
        newTitle = TIMER_BADGE + noBadgeTitle;
    } else {
        newTitle = noBadgeTitle;
    }

    if (document.title != newTitle) {
        // Note to other addon authors:
        // If an addon other than ReloadMatic also tries to alter the title,
        // the client can get into an infinite loop and beside eating up
        // a lot of CPU, this can also make the browser unresponsive.
        // To prevent this, please set the title using a small delay
        // whenever it is changing not as a direct result of a user action.
        // The loop and possible graphical glitches will still be there,
        // but at least the CPU-use will be kept within limits.
        if (!bThrottle) {
            document.title = newTitle;
        } else {
            setTimeout(function(){ document.title = newTitle; }, 100);
        }
    }
}

document.addEventListener("DOMContentLoaded", function(event) {
    // the observer instance watches for changes in the <title element>
    var observer = new MutationObserver(function(mutations) {
        setTimerBadge(bRefreshing, true);
    });

    var obsConfig = { subtree: true, characterData: true, childList: true };
    var obsTarget = document.querySelector("head > title");
    observer.observe(obsTarget, obsConfig);
});
