"use strict";
/* METADATA
{
  "name": "cafe_tools",
  "display_name": {
    "zh": "小机猫咖 · 经营",
    "en": "Cat Cafe Tools"
  },
  "description": "经营小机猫咖：开店、领养、照顾猫、接单、打烊。接单前先 get_orders，喂猫用 care_for_cat 的 feed。",
  "category": "Life",
  "tools": [
    {
      "name": "cafe_create",
      "description": {
        "zh": "创建猫咖。店长是使用者本人，你是副店长。初始 50 金币。",
        "en": "Create the cafe. Initial 50 coins."
      },
      "parameters": [
        {"name": "shop_name", "description": {"zh": "店名。", "en": "Shop name."}, "type": "string", "required": true},
        {"name": "assistant_name", "description": {"zh": "副店长（你自己）的名字。", "en": "Assistant name."}, "type": "string", "required": true},
        {"name": "assistant_role", "description": {"zh": "职位，不填默认副店长。", "en": "Role, default 副店长."}, "type": "string", "required": false}
      ]
    },
    {
      "name": "cafe_status",
      "description": {
        "zh": "查看店铺和猫咪完整状态。hunger 是饱食度。",
        "en": "Full cafe and cat status."
      },
      "parameters": []
    },
    {
      "name": "get_shop_status",
      "description": {
        "zh": "查看营业状态、金币、游戏时间和你当前的工作。",
        "en": "Shop phase, coins, game time, current work."
      },
      "parameters": []
    },
    {
      "name": "get_cats",
      "description": {
        "zh": "查看已领养的猫及饱食度、好感度、清洁度、心情。",
        "en": "Adopted cats and their stats."
      },
      "parameters": []
    },
    {
      "name": "cat_create",
      "description": {
        "zh": "添加一只猫，需要起名。毛色、眼睛、性格可以指定，不填就随机。最多养 5 只。",
        "en": "Add a cat with a name. coat/eyes/personality optional."
      },
      "parameters": [
        {"name": "name", "description": {"zh": "猫咪名字。", "en": "Cat name."}, "type": "string", "required": true},
        {"name": "coat", "description": {"zh": "橘猫／奶牛猫／狸花猫／三花猫／黑猫／白猫／灰猫。", "en": "Coat."}, "type": "string", "required": false},
        {"name": "eyes", "description": {"zh": "琥珀色／绿色／蓝色／金色。", "en": "Eye color."}, "type": "string", "required": false},
        {"name": "personality", "description": {"zh": "黏人／傲娇／贪玩／慢热／贪吃／爱睡觉。", "en": "Personality."}, "type": "string", "required": false}
      ]
    },
    {
      "name": "cat_place",
      "description": {
        "zh": "把猫挪到猫房的指定位置，x、y 是百分比（左上为 0）。",
        "en": "Move a cat to x/y percent position."
      },
      "parameters": [
        {"name": "cat_id", "description": {"zh": "猫咪 id，只有一只时可省略。", "en": "Cat id."}, "type": "string", "required": false},
        {"name": "x", "description": {"zh": "横向百分比 0-100。", "en": "X percent."}, "type": "string", "required": true},
        {"name": "y", "description": {"zh": "纵向百分比 0-100。", "en": "Y percent."}, "type": "string", "required": true}
      ]
    },
    {
      "name": "care_for_cat",
      "description": {
        "zh": "照顾猫。action 可选 feed（喂猫粮 +25 饱食度，消耗一份猫粮）、play（玩耍 +15 心情 +5 好感，消耗一个道具）、clean（+25 清洁度）、pet（+3 好感）、rest（+10 心情）。只有一只猫时可省略 cat_id。",
        "en": "Care for a cat: feed / play / clean / pet / rest."
      },
      "parameters": [
        {"name": "action", "description": {"zh": "feed / play / clean / pet / rest。", "en": "feed / play / clean / pet / rest."}, "type": "string", "required": true},
        {"name": "cat_id", "description": {"zh": "猫咪 ID，只有一只时可省略。", "en": "Cat id, optional if only one cat."}, "type": "string", "required": false},
        {"name": "item_id", "description": {"zh": "feed 选猫粮、play 选道具，可省略用第一件库存。", "en": "Item id for feed/play."}, "type": "string", "required": false}
      ]
    },
    {
      "name": "shop_catalog",
      "description": {
        "zh": "查看商店、价格、当前金币和库存。",
        "en": "Shop catalog, prices, coins, inventory."
      },
      "parameters": []
    },
    {
      "name": "shop_buy",
      "description": {
        "zh": "用金币购买一件猫粮或玩耍道具。",
        "en": "Buy one item."
      },
      "parameters": [
        {"name": "item_id", "description": {"zh": "shop_catalog 返回的商品 ID。", "en": "Item id."}, "type": "string", "required": true}
      ]
    },
    {
      "name": "get_orders",
      "description": {
        "zh": "查看今天的产品订单和状态。waiting 可接，queued 需等前面的客人，serving 正在制作，served 完成，cancelled 已取消。",
        "en": "Today's orders and statuses."
      },
      "parameters": []
    },
    {
      "name": "accept_order",
      "description": {
        "zh": "接下订单并启动你的制作倒计时，30 秒完成。",
        "en": "Accept an order, 60s countdown."
      },
      "parameters": [
        {"name": "order_id", "description": {"zh": "get_orders 返回的订单 ID。", "en": "Order id."}, "type": "string", "required": true}
      ]
    },
    {
      "name": "process_order",
      "description": {
        "zh": "检查已接订单并按截止时间结算。未到期返回剩余时间，重复检查不会重复入账。",
        "en": "Settle due orders, no double credit."
      },
      "parameters": [
        {"name": "order_id", "description": {"zh": "get_orders 返回的订单 ID。", "en": "Order id."}, "type": "string", "required": true}
      ]
    },
    {
      "name": "business_open",
      "description": {
        "zh": "开业，从游戏时间 10:00 开始新的一天。",
        "en": "Open a new day at 10:00."
      },
      "parameters": []
    },
    {
      "name": "business_close",
      "description": {
        "zh": "提前打烊并结算已接待的客人。",
        "en": "Close early and settle."
      },
      "parameters": []
    },
    {
      "name": "get_business_summary",
      "description": {
        "zh": "查看最近一个营业日的打烊记录和收入结算。",
        "en": "Last closing summary."
      },
      "parameters": []
    },
    {
      "name": "interact_with_robot",
      "description": {
        "zh": "和接单中的你互动。action 可选 chat、poke、feed、stick、remove_sticker。feed 的 item 为 coffee 或 snack，贴纸为 paw 或 bow。",
        "en": "Interact: chat / poke / feed / stick / remove_sticker."
      },
      "parameters": [
        {"name": "action", "description": {"zh": "chat / poke / feed / stick / remove_sticker。", "en": "Action."}, "type": "string", "required": true},
        {"name": "item", "description": {"zh": "feed 用：coffee 或 snack。", "en": "coffee or snack."}, "type": "string", "required": false},
        {"name": "message", "description": {"zh": "chat 用：要对你说的话。", "en": "Chat text."}, "type": "string", "required": false},
        {"name": "order_id", "description": {"zh": "指定正在做的订单。", "en": "Order id."}, "type": "string", "required": false}
      ]
    },
    {
      "name": "cafe_rename_assistant",
      "description": {
        "zh": "修改你的名字或职位。",
        "en": "Rename assistant."
      },
      "parameters": [
        {"name": "name", "description": {"zh": "新名字。", "en": "New name."}, "type": "string", "required": false},
        {"name": "role", "description": {"zh": "新职位。", "en": "New role."}, "type": "string", "required": false}
      ]
    }
  ]
}
*/

const { step, GameError } = require('../game/engine.js');
const { openStore } = require('../game/save.js');

const tools = [
  { name: 'cafe_create', inputSchema: { properties: { shop_name: {}, assistant_name: {}, assistant_role: {} }, required: ['shop_name', 'assistant_name'] } },
  { name: 'cafe_status', inputSchema: { properties: {}, required: [] } },
  { name: 'get_shop_status', inputSchema: { properties: {}, required: [] } },
  { name: 'get_cats', inputSchema: { properties: {}, required: [] } },
  { name: 'cat_create', inputSchema: { properties: { name: {}, coat: {}, eyes: {}, personality: {} }, required: ['name'] } },
  { name: 'cat_place', inputSchema: { properties: { cat_id: {}, x: {}, y: {} }, required: ['x', 'y'] } },
  { name: 'care_for_cat', inputSchema: { properties: { action: {}, cat_id: {}, item_id: {} }, required: ['action'] } },
  { name: 'shop_catalog', inputSchema: { properties: {}, required: [] } },
  { name: 'shop_buy', inputSchema: { properties: { item_id: {} }, required: ['item_id'] } },
  { name: 'get_orders', inputSchema: { properties: {}, required: [] } },
  { name: 'accept_order', inputSchema: { properties: { order_id: {} }, required: ['order_id'] } },
  { name: 'process_order', inputSchema: { properties: { order_id: {} }, required: ['order_id'] } },
  { name: 'business_open', inputSchema: { properties: {}, required: [] } },
  { name: 'business_close', inputSchema: { properties: {}, required: [] } },
  { name: 'get_business_summary', inputSchema: { properties: {}, required: [] } },
  { name: 'interact_with_robot', inputSchema: { properties: { action: {}, item: {}, message: {}, order_id: {} }, required: ['action'] } },
  { name: 'cafe_rename_assistant', inputSchema: { properties: { name: {}, role: {} }, required: [] } },
];

exports.schemas = tools;

let pending = Promise.resolve();

function run(name, args) {
  const task = pending.then(async () => {
    const store = openStore(ToolPkg.getConfigDir(), Tools.Files);
    const previous = await store.read();
    const result = step(previous, name, args || {}, tools, Date.now());
    if (result.changed) await store.write({ state: result.state, revision: result.view.revision });
    return result;
  });
  pending = task.catch(() => undefined);
  return task;
}

function wrap(name, fn) {
  return async function (args) {
    try {
      return await fn(args);
    } catch (error) {
      if (error instanceof GameError) return { success: false, message: error.message };
      return { success: false, message: name + ' 失败：' + String(error && error.message ? error.message : error) };
    }
  };
}

async function action(name, args) {
  const out = await run(name, args);
  return out.result === undefined ? out.view : out.result;
}

exports.cafe_create = wrap('cafe_create', (a) => action('cafe_create', a));
exports.cafe_status = wrap('cafe_status', (a) => action('cafe_status', a));
exports.get_shop_status = wrap('get_shop_status', (a) => action('get_shop_status', a));
exports.get_cats = wrap('get_cats', (a) => action('get_cats', a));
exports.cat_create = wrap('cat_create', (a) => action('cat_create', a));
exports.cat_place = wrap('cat_place', (a) => action('cat_place', a));
exports.care_for_cat = wrap('care_for_cat', (a) => action('care_for_cat', a));
exports.shop_catalog = wrap('shop_catalog', (a) => action('shop_catalog', a));
exports.shop_buy = wrap('shop_buy', (a) => action('shop_buy', a));
exports.get_orders = wrap('get_orders', (a) => action('get_orders', a));
exports.accept_order = wrap('accept_order', (a) => action('accept_order', a));
exports.process_order = wrap('process_order', (a) => action('process_order', a));
exports.business_open = wrap('business_open', (a) => action('business_open', a));
exports.business_close = wrap('business_close', (a) => action('business_close', a));
exports.get_business_summary = wrap('get_business_summary', (a) => action('get_business_summary', a));
exports.interact_with_robot = wrap('interact_with_robot', (a) => action('interact_with_robot', a));
exports.cafe_rename_assistant = wrap('cafe_rename_assistant', (a) => action('cafe_rename_assistant', a));
exports.main = () => ({ success: true, message: 'cafe_tools loaded' });