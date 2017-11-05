var tabId = null

function toBackground(event) {
    if (tabId !== null) {   // don't send anything unless we know who we are
        browser.runtime.sendMessage({
            event: event,
            tabId: tabId
        })
    }
}

browser.runtime.onMessage.addListener((message) => {
    tabId = message.tabId
})

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
