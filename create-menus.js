// This file is only used to create the menu entries

const reload_periods = [
    -1, "Don't reload",
    5, "Every 5 secs",
    15, "Every 15 secs",
    60, "Every minute",
    300, "Every 5 minutes",
    900, "Every 15 minutes",
    3600, "Every hour",
    14400, "Every 4 hours",
    -2, "Custom interval"
]
const num_periods = reload_periods.length

browser.menus.create({
    id: "reloadmatic-mnu-root",
    title: "Reload",
    contexts: ["all"]
});

for (let i = 0; i < num_periods/2; i++) {
    browser.menus.create({
        id: `reloadmatic-mnu-period-${reload_periods[i*2]}`,
        title: reload_periods[i*2+1],
        type: "radio",
        parentId: "reloadmatic-mnu-root"
    });
}

browser.menus.create({
    id: "reloadmatic-mnu-separator-1",
    type: "separator",
    parentId: "reloadmatic-mnu-root"
});

/*********************************/
/*           OPTIONS             */
/*********************************/


browser.menus.create({
    id: "reloadmatic-mnu-remember",
    title: "Remember page",
    type: "checkbox",
    parentId: "reloadmatic-mnu-root"
});

browser.menus.create({
    id: "reloadmatic-mnu-randomize",
    title: "Randomize",
    type: "checkbox",
    parentId: "reloadmatic-mnu-root"
});

browser.menus.create({
    id: "reloadmatic-mnu-unsuccessful",
    title: "Only if unsuccessful",
    type: "checkbox",
    parentId: "reloadmatic-mnu-root"
});

browser.menus.create({
    id: "reloadmatic-mnu-smart",
    title: "Smart timing",
    type: "checkbox",
    parentId: "reloadmatic-mnu-root"
});

browser.menus.create({
    id: "reloadmatic-mnu-sticky",
    title: "Sticky reload",
    type: "checkbox",
    parentId: "reloadmatic-mnu-root"
});

browser.menus.create({
    id: "reloadmatic-mnu-disable-cache",
    title: "Disable cache",
    type: "checkbox",
    parentId: "reloadmatic-mnu-root"
});

browser.menus.create({
    id: "reloadmatic-mnu-separator-2",
    type: "separator",
    parentId: "reloadmatic-mnu-root"
});

browser.menus.create({
    id: "reloadmatic-mnu-reload",
    title: "Reload now",
    parentId: "reloadmatic-mnu-root"
});

/*********************************/
/*           ALL TABS            */
/*********************************/

browser.menus.create({
    id: "reloadmatic-mnu-alltabs",
    title: "All tabs",
    parentId: "reloadmatic-mnu-root"
});

browser.menus.create({
    id: "reloadmatic-mnu-enable-all",
    title: "Set to all",
    parentId: "reloadmatic-mnu-alltabs"
});

browser.menus.create({
    id: "reloadmatic-mnu-disable-all",
    title: "Disable on all",
    parentId: "reloadmatic-mnu-alltabs"
});

browser.menus.create({
    id: "reloadmatic-mnu-reload-all",
    title: "Reload all now",
    parentId: "reloadmatic-mnu-alltabs"
});

/*********************************/
/*             ABOUT             */
/*********************************/

browser.menus.create({
    id: "reloadmatic-mnu-about",
    title: "About",
    parentId: "reloadmatic-mnu-root"
});

browser.menus.create({
    id: "reloadmatic-mnu-settings",
    title: "Settings",
    parentId: "reloadmatic-mnu-about"
});

browser.menus.create({
    id: "reloadmatic-mnu-faq",
    title: "F.A.Q.",
    parentId: "reloadmatic-mnu-about"
});

browser.menus.create({
    id: "reloadmatic-mnu-amo",
    title: "AMO Site",
    parentId: "reloadmatic-mnu-about"
});

browser.menus.create({
    id: "reloadmatic-mnu-support",
    title: "Issues and requests",
    parentId: "reloadmatic-mnu-about"
});
