import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { shop, products } from './catalog.mjs';
import { advanceBusiness, assignOrder, businessView, closeBusiness, needsAdvance, openBusiness } from './business.mjs';

const dataDir = resolve(process.env.CAT_CAFE_DATA_DIR || join(homedir(), '.xiaoji-cat-cafe'));
const breeds = ['橘猫', '奶牛猫', '狸花猫', '三花猫', '黑猫', '白猫', '灰猫'];
const personalities = ['黏人', '傲娇', '贪玩', '慢热', '贪吃', '爱睡觉'];
const eyes = ['琥珀色', '绿色', '蓝色', '金色'];
const pick = (items) => items[Math.floor(Math.random() * items.length)];
const cap = (value) => Math.min(100, value);

export class GameError extends Error {}

function text(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new GameError('请填写' + label);
  return value.trim();
}

function findCat(state, id) {
  if (!id && state.cats.length === 1) return state.cats[0];
  if (!id && state.cats.length > 1) throw new GameError('有多只猫，请先用 cafe_status 查看并指定要照顾的猫咪');
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

const definitions = [
  ['cafe_create', '创建猫咖（主人是店长）', ['shop_name', 'assistant_name', 'assistant_role'], ['shop_name', 'assistant_name']],
  ['cafe_status', '查看店铺和猫咪状态，hunger 表示饱食度', [], []],
  ['cat_candidates', '生成三只可领养的猫咪并保存候选名单', [], []],
  ['cat_adopt', '从候选名单领养一只猫咪', ['cat_id', 'name'], ['cat_id', 'name']],
  ['cat_feed', '帮我喂猫：从库存消耗一份猫粮，增加 25 点饱食度。可用 item_id 选猫粮，只有一只猫时可省略 cat_id。库存空时提示先买猫粮。', ['cat_id', 'item_id'], []],
  ['cat_play', '陪猫咪玩耍：消耗一个库存道具，增加 5 点好感度。可用 item_id 选择道具。', ['cat_id', 'item_id'], []],
  ['cat_clean', '给猫咪清洁，提高清洁度', ['cat_id'], []],
  ['cat_pet', '摸摸猫咪，提高亲密度', ['cat_id'], []],
  ['cat_rest', '让猫咪休息，恢复心情', ['cat_id'], []],
  ['cafe_rename_assistant', '修改小机名字或职位', ['name', 'role'], []],
  ['shop_catalog', '查看商店、价格、当前金币和库存', [], []],
  ['shop_buy', '用金币购买一件猫粮或玩耍道具', ['item_id'], ['item_id']],
  ['business_orders', '查看到店客人的产品订单和营业状态', [], []],
  ['business_assign_order', '把一笔产品订单交给小机制作，制作完成后入账', ['order_id'], ['order_id']],
  ['business_summary', '查看最近一次打烊结算', [], []],
  ['business_open', '开业，从游戏时间 10:00 开始新的一天', [], []],
  ['business_close', '提前打烊并结算已接待的客人', [], []],
];

export const tools = definitions.map(([name, description, keys, required]) => ({
  name,
  description,
  inputSchema: {
    type: 'object',
    properties: Object.fromEntries(keys.map((key) => [key, { type: 'string' }])),
    required,
    additionalProperties: false,
  },
  annotations: {
    readOnlyHint: ['cafe_status', 'shop_catalog', 'business_orders', 'business_summary'].includes(name),
    openWorldHint: false,
    destructiveHint: false,
  },
}));

let db;

function database() {
  if (db) return db;
  mkdirSync(dataDir, { recursive: true });
  const connection = new DatabaseSync(join(dataDir, 'save.sqlite'));
  try {
    connection.exec(`
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS cafe (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        revision INTEGER NOT NULL,
        state TEXT
      );
      CREATE TABLE IF NOT EXISTS sprites (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        image BLOB NOT NULL
      );
    `);
    connection.exec('BEGIN IMMEDIATE');
    if (!connection.prepare('SELECT 1 FROM cafe WHERE id = 1').get()) {
      const state = importLegacySave();
      connection.prepare('INSERT INTO cafe VALUES (1, 0, ?)').run(state);
    }
    connection.exec('COMMIT');
  } catch (error) {
    connection.close();
    throw error;
  }
  db = connection;
  return db;
}

function importLegacySave() {
  let raw;
  try {
    raw = readFileSync(join(dataDir, 'save.json'), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  const state = JSON.parse(raw);
  if (state?.version !== 1 || !Array.isArray(state.cats) || !Array.isArray(state.candidates)
      || !Number.isFinite(state.coins) || typeof state.shop_name !== 'string'
      || typeof state.assistant?.name !== 'string') {
    throw new Error('无法导入 v0.1 的 save.json，存档格式不符');
  }
  return JSON.stringify(state);
}

function load(connection) {
  const row = connection.prepare('SELECT revision, state FROM cafe WHERE id = 1').get();
  return { revision: row.revision, state: JSON.parse(row.state) };
}

function save(connection, state, revision) {
  connection.prepare('UPDATE cafe SET revision = ?, state = ? WHERE id = 1').run(revision, JSON.stringify(state));
}

function transaction(connection, work) {
  connection.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    connection.exec('COMMIT');
    return result;
  } catch (error) {
    connection.exec('ROLLBACK');
    throw error;
  }
}

function present({ state, revision }, now) {
  const business = businessView(state);
  if (!state) return { state: null, revision, business, observedAt: now };
  const { business: internalBusiness, ...cafe } = state;
  return { state: cafe, revision, business, observedAt: now };
}

export function snapshot(now = Date.now()) {
  const connection = database();
  const current = load(connection);
  if (!current.state || !needsAdvance(current.state, now)) return present(current, now);
  return transaction(connection, () => {
    const latest = load(connection);
    if (advanceBusiness(latest.state, now)) {
      latest.revision += 1;
      save(connection, latest.state, latest.revision);
    }
    return present(latest, now);
  });
}

export function sprite(id) {
  return database().prepare('SELECT type, image FROM sprites WHERE id = ?').get(id);
}

export function saveSprite(target, catId, image, type, now = Date.now()) {
  const connection = database();
  return transaction(connection, () => {
    const { state, revision } = load(connection);
    if (!state) throw new GameError('请先开店。');
    const actor = target === 'assistant' ? state.assistant
      : target === 'cat' ? state.cats.find((cat) => cat.id === catId) : null;
    if (!actor) throw new GameError('找不到要更换素材的角色。');
    const previous = actor.sprite;
    if (image) {
      const id = randomUUID();
      connection.prepare('INSERT INTO sprites VALUES (?, ?, ?)').run(id, type, image);
      actor.sprite = id;
    } else {
      delete actor.sprite;
    }
    if (previous) connection.prepare('DELETE FROM sprites WHERE id = ?').run(previous);
    advanceBusiness(state, now);
    save(connection, state, revision + 1);
    return present({ state, revision: revision + 1 }, now);
  });
}

function validateArgs(name, args) {
  const schema = tools.find((tool) => tool.name === name)?.inputSchema;
  if (!schema) throw new GameError('未知工具：' + name);
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new GameError('参数必须是对象');
  for (const key of Object.keys(args)) {
    if (!Object.hasOwn(schema.properties, key) || typeof args[key] !== 'string') {
      throw new GameError('参数无效：' + key);
    }
  }
  for (const key of schema.required) {
    if (!Object.hasOwn(args, key)) throw new GameError('缺少参数：' + key);
  }
}

function createCandidates() {
  return Array.from({ length: 3 }, () => ({
    id: randomUUID(), coat: pick(breeds), eyes: pick(eyes), personality: pick(personalities),
    name: null, hunger: 70, mood: 70, bond: 0,
  }));
}

function adopt(state, args) {
  if (state.cats.length >= 5) throw new GameError('猫咖最多收养 5 只猫');
  const cat = state.candidates.find((item) => item.id === args.cat_id);
  if (!cat) throw new GameError('候选名单已更新，请重新选择');
  cat.name = text(args.name, '猫咪名字');
  state.cats.push(cat);
  state.candidates = [];
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
    case 'cat_candidates':
      if (state.cats.length >= 5) throw new GameError('猫咖最多收养 5 只猫');
      state.candidates = createCandidates();
      return state.candidates;
    case 'cat_adopt': {
      const result = adopt(state, args);
      if (state.cats.length === 1 && !state.business.day) openBusiness(state, now);
      return result;
    }
    case 'cafe_rename_assistant':
      if (args.name?.trim()) state.assistant.name = args.name.trim();
      if (args.role?.trim()) state.assistant.role = args.role.trim();
      return state.assistant;
    case 'shop_buy':
      return buy(state, args.item_id);
    case 'business_open':
    case 'business_close':
    case 'business_assign_order': {
      const result = name === 'business_open' ? openBusiness(state, now)
        : name === 'business_close' ? closeBusiness(state) : assignOrder(state, args.order_id, now);
      if (result.error) throw new GameError(result.error);
      return result;
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

export function execute(name, args = {}, now = Date.now()) {
  validateArgs(name, args);
  if (['cafe_status', 'shop_catalog', 'business_orders', 'business_summary'].includes(name)) {
    const current = snapshot(now);
    const { state, business } = current;
    if (!state && name === 'cafe_status') throw new GameError('请先在网页开店，或调用 cafe_create 创建猫咖');
    const results = {
      cafe_status: { ...state, business },
      shop_catalog: { items: shop, coins: state?.coins ?? 0, inventory: state?.inventory ?? {} },
      business_orders: { phase: business.phase, time: business.time, orders: business.orders, products },
      business_summary: business.lastSummary,
    };
    return { ...current, result: results[name] };
  }

  const connection = database();
  return transaction(connection, () => {
    let { state, revision } = load(connection);
    let result;
    if (name === 'cafe_create') {
      if (state) throw new GameError('已有存档。可设置 CAT_CAFE_DATA_DIR 使用另一份存档');
      state = newCafe(args);
      advanceBusiness(state, now);
      result = state;
    } else {
      if (!state) throw new GameError('请先在网页开店，或调用 cafe_create 创建猫咖');
      advanceBusiness(state, now);
      result = change(state, name, args, now);
    }
    revision += 1;
    save(connection, state, revision);
    const view = present({ state, revision }, now);
    return { ...view, result: name === 'cafe_create' ? view.state : result };
  });
}
