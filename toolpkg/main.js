"use strict";
const ROUTE = "toolpkg:com.xiaoji.catcafe:ui:cafe";

ToolPkg.ipc.on("cafe.ai", async function (payload) {
  try {
    const r = await toolCall("call_chat_model", { function_type: "CHAT", turns: (payload && payload.turns) || [] });
    return { text: String((r && r.text) || "") };
  } catch (e) {
    return { text: "", error: String((e && e.message) || e) };
  }
});


function registerToolPkg() {
  ToolPkg.registerUiRoute({
    id: "cafe",
    route: ROUTE,
    runtime: "compose_dsl",
    screen: "ui/index.ui.js",
    params: {},
    title: { zh: "cat-coffee", en: "cat-coffee" },
    keepAlive: false
  });
  ToolPkg.registerNavigationEntry({
    id: "cafe_sidebar",
    route: ROUTE,
    surface: "main_sidebar_plugins",
    title: { zh: "cat-coffee", en: "cat-coffee" },
    icon: "pets",
    order: 41
  });
  return true;
}

exports.registerToolPkg = registerToolPkg;