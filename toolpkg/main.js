"use strict";

const ROUTE = "toolpkg:com.xiaoji.catcafe:ui:cafe";

function registerToolPkg() {
  ToolPkg.registerUiRoute({
    id: "cafe",
    route: ROUTE,
    runtime: "compose_dsl",
    screen: "ui/index.ui.js",
    params: {},
    title: { zh: "小机猫咖", en: "Xiaoji Cat Cafe" },
    keepAlive: false
  });
  ToolPkg.registerNavigationEntry({
    id: "cafe_sidebar",
    route: ROUTE,
    surface: "main_sidebar_plugins",
    title: { zh: "小机猫咖", en: "Xiaoji Cat Cafe" },
    icon: "pets",
    order: 41
  });
  return true;
}

exports.registerToolPkg = registerToolPkg;