'use strict';

const { shop, products } = require('./catalog.js');
const { advanceBusiness, assignOrder, businessView, closeBusiness, needsAdvance, openBusiness } = require('./business.js');
const { interactWithRobot } = require('./robot.js');

const breeds = ['橘猫', '奶牛猫', '狸花猫', '三花猫', '黑猫', '白猫', '灰猫'];
const personalities = ['黏人', '傲娇', '贪玩', '慢热', '贪吃', '爱睡觉'];
const eyes = ['琥珀色', '绿色', '蓝色', '金色'];
const pick = (items) => items[Math.floor(Math.random() * items.length)];
const cap = (value) => Math.min(100, value);

class GameError extends Error {}

function text(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new GameError('请填写' + label);
  return value.trim();
}

function findCat(state, id) {
  if (!id && state.cats.length === 1) return state.cats[0];
  if (!id && state.cats.length > 1) throw new GameError('有多只猫，请先用 get_cats 查看并指定要照顾的猫咪');
  const cat = state.cats.find((item) => item.id === id);
  if (!cat) throw new GameError(state.cats.length ? '找不到猫咪' : '请先领养一只猫咪');
  return cat;
}

function newCafe(args) {
  return {
    version: 1,
    shop_name: text(args.shop_name, '店名'),
    owner_role: '店长',
    assistant: { name: text(args.assistant_name, '小机名字'), role: args.assistant_role?.trim() || '副店长' },
    coins: 50,
    cats: [],
    candidates: [],
  };
}

const readTools = new Set([
  'cafe_status', 'shop_catalog', 'business_orders', 'business_summary',
  'get_shop_status', 'get_orders', 'get_cats', 'get_business_summary',
]);

function present({ state, revision }, now) {
  const business = businessView(state, now);
  if (!state) return { state: null, revision, business, observedAt: now };
  const { business: internalBusiness, ...cafe } = state;
  return { state: cafe, revision, business, observedAt: now };
}

const hourMs = 60 * 60 * 1000;

function careDue(cat, now) {
  return !Number.isFinite(cat.careUpdatedAt) || now - cat.careUpdatedAt >= hourMs;
}

function gameDue(state, now) {
  return needsAdvance(state, now) || state.cats.some((cat) => careDue(cat, now));
}

function advanceGame(state, now) {
  let changed = advanceBusiness(state, now);
  for (const cat of state.cats) {
    if (!careDue(cat, now)) continue;
    if (!Number.isFinite(cat.careUpdatedAt)) {
      cat.careUpdatedAt = now;
    } else {
      const hours = Math.floor((now - cat.careUpdatedAt) / hourMs);
      cat.hunger = Math.max(0, cat.hunger - hours * 15);
      cat.cleanliness = Math.max(0, (cat.cleanliness ?? 70) - hours * 15);
      cat.mood = Math.max(0, (cat.mood ?? 70) - hours * 15);
      cat.careUpdatedAt += hours * hourMs;
    }
    changed = true;
  }
  return changed;
}

function validateArgs(name, args, tools) {
  if (name === 'snapshot') return;
  const schema = tools.find((tool) => tool.name === name)?.inputSchema;
  if (!schema) throw new GameError('未知工具：' + name);
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new GameError('参数必须是对象');
  for (const key of Object.keys(args)) {
    if (!Object.prototype.hasOwnProperty.call(schema.properties, key)) continue;
    if (typeof args[key] !== 'string') throw new GameError('参数无效：' + key);
  }
  for (const key of schema.required) {
    if (!Object.prototype.hasOwnProperty.call(args, key)) throw new GameError('缺少参数：' + key);
  }
}

let candidateSequence = 0;

function candidateId() {
  candidateSequence += 1;
  return [Date.now().toString(36), candidateSequence.toString(36), Math.random().toString(36).slice(2)].join('-');
}

function placeCat(state, args) {
  const cat = findCat(state, args.cat_id);
  const x = Number(args.x);
  const y = Number(args.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new GameError('位置无效');
  cat.place = { x: Math.min(100, Math.max(0, x)), y: Math.min(100, Math.max(0, y)) };
  return { cat };
}
function createCat(state, args, now) {
  if (state.cats.length >= 5) throw new GameError('猫咖最多收养 5 只猫');
  const cat = {
    id: candidateId(),
    coat: breeds.includes(args.coat) ? args.coat : pick(breeds),
    eyes: eyes.includes(args.eyes) ? args.eyes : pick(eyes),
    personality: personalities.includes(args.personality) ? args.personality : pick(personalities),
    name: text(args.name, '猫咪名字'),
    hunger: 70, mood: 70, cleanliness: 70, bond: 0,
    careUpdatedAt: now,
  };
  state.cats.push(cat);
  if (state.cats.length === 1 && !state.business?.day) openBusiness(state, now);
  return { message: '领养成功', cat };
}
function itemForUse(state, id, kind) {
  const stocked = shop.filter((item) => item.kind === kind && (state.inventory?.[item.id] ?? 0) > 0);
  const item = id ? stocked.find((candidate) => candidate.id === id) : stocked[0];
  if (!item) throw new GameError(kind === 'food' ? '没有可用猫粮，请先在商店购买。' : '没有可用的玩耍道具，请先在商店购买。');
  state.inventory[item.id] -= 1;
  return item;
}

function feed(state, cat, id) {
  const food = itemForUse(state, id, 'food');
  const previous = cat.hunger;
  cat.hunger = cap(cat.hunger + 25);
  cat.bond = cap(cat.bond + 2);
  cat.feed_count = (cat.feed_count ?? 0) + 1;
  return {
    message: `已用${food.name}喂「${cat.name}」，饱食度 ${previous} → ${cat.hunger}/100。`,
    cat, coins: state.coins,
  };
}

function buy(state, id) {
  const item = shop.find((entry) => entry.id === id);
  if (!item) throw new GameError('找不到这件商品。');
  if (state.coins < item.price) throw new GameError('金币不足。');
  state.inventory ??= {};
  state.coins -= item.price;
  state.inventory[id] = (state.inventory[id] ?? 0) + 1;
  return { item, coins: state.coins, quantity: state.inventory[id], message: `已购入${item.name}。` };
}

function change(state, name, args, now) {
  switch (name) {
    case 'cat_create':
      return createCat(state, args, now);
    case 'cat_place':
      return placeCat(state, args);
    case 'cafe_rename_assistant':
      if (args.name?.trim()) state.assistant.name = args.name.trim();
      if (args.role?.trim()) state.assistant.role = args.role.trim();
      return state.assistant;
    case 'shop_buy':
      return buy(state, args.item_id);
    case 'interact_with_robot': {
      const work = businessView(state, now).work;
      if (args.order_id && work?.orderId !== args.order_id) throw new GameError('这笔订单已结束。');
      const result = interactWithRobot(state, args, now, Boolean(work));
      if (result.error) throw new GameError(result.error);
      return result;
    }
    case 'business_open':
    case 'business_close':
    case 'accept_order':
    case 'business_assign_order': {
      const result = name === 'business_open' ? openBusiness(state, now)
        : name === 'business_close' ? closeBusiness(state) : assignOrder(state, args.order_id, now);
      if (result.error) throw new GameError(result.error);
      return result;
    }
    case 'care_for_cat': {
      if (!['feed', 'play', 'clean', 'pet', 'rest'].includes(args.action)) throw new GameError('不支持这项照顾操作。');
      return change(state, `cat_${args.action}`, args, now);
    }
  }
  const cat = findCat(state, args.cat_id);
  switch (name) {
    case 'cat_feed':
      return feed(state, cat, args.item_id);
    case 'cat_play': {
      const item = itemForUse(state, args.item_id, 'toy');
      const previous = cat.bond;
      cat.mood = cap(cat.mood + 15);
      cat.bond = cap(cat.bond + 5);
      return { cat, item, message: `${cat.name}玩了${item.name}，好感度 ${previous} → ${cat.bond}/100。` };
    }
    case 'cat_clean':
      cat.cleanliness = cap((cat.cleanliness ?? 70) + 25);
      break;
    case 'cat_pet':
      cat.bond = cap(cat.bond + 3);
      break;
    case 'cat_rest':
      cat.mood = cap(cat.mood + 10);
      break;
  }
  return { cat };
}

function readResult(name, args, { state, business }) {
  if (!state && name === 'cafe_status') throw new GameError('请先创建猫咖');
  if (name === 'process_order') {
    const order = business.orderLog.find((item) => item.id === args.order_id);
    if (!order) throw new GameError('找不到今天的这笔订单。');
    const messages = {
      queued: '请先接待前面的客人。', waiting: '请先使用 accept_order 接单。',
      serving: '小机正在制作，到期会自动结算。', served: '订单已经完成并入账。',
      cancelled: '店铺已经打烊，这笔订单未入账。',
    };
    return { ...order, message: messages[order.status] };
  }
  const results = {
    cafe_status: { ...state, business },
    shop_catalog: { items: shop, coins: state?.coins ?? 0, inventory: state?.inventory ?? {} },
    business_orders: { phase: business.phase, time: business.time, orders: business.orders, products },
    business_summary: business.lastSummary,
    get_shop_status: {
      name: state?.shop_name ?? null, phase: business.phase, coins: state?.coins ?? 0,
      day: business.day, gameTime: business.time, ...business.progress,
      work: business.work, resigning: business.resigning, achievement: state?.robot?.achievement ?? null,
    },
    get_orders: { day: business.day, phase: business.phase, orders: business.orderLog },
    get_cats: { cats: state?.cats ?? [] },
    get_business_summary: business.lastSummary,
  };
  return results[name];
}

function step(save, name, args, tools, now) {
  validateArgs(name, args, tools);
  let { state, revision } = save;
  let changed = false;
  if (state && gameDue(state, now)) changed = advanceGame(state, now);

  if (name === 'snapshot' || name === 'process_order' || readTools.has(name)) {
    const view = present({ state, revision: revision + Number(changed) }, now);
    return { state, view, changed, result: name === 'snapshot' ? null : readResult(name, args, view) };
  }

  let result;
  if (name === 'cafe_create') {
    if (state) throw new GameError('已有猫咖存档。');
    state = newCafe(args);
    advanceGame(state, now);
  } else {
    if (!state) throw new GameError('请先创建猫咖。');
    result = change(state, name, args, now);
  }
  const view = present({ state, revision: revision + 1 }, now);
  return { state, view, changed: true, result: name === 'cafe_create' ? view.state : result };
}

module.exports = { step, GameError };
