var tabId = null

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
    } else if (message.event == "reload") {
        let loc = window.location.protocol + '//' + window.location.host + window.location.pathname + window.location.search + window.location.hash;
        doPostRequest(loc, message.postData)
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
        toBackground("activity")
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
