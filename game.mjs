import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

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
  ['cat_feed', '帮我喂猫：喂一次花 5 猫猫币，饱食度增加 25（上限 100）。只有一只猫时直接调用，无需 cat_id。有多只猫时先用 cafe_status 按名字查找 cat_id；未指明猫咪时请询问。', ['cat_id'], []],
  ['cat_play', '陪猫咪玩耍', ['cat_id'], ['cat_id']],
  ['cat_clean', '给猫咪清洁，提高清洁度', ['cat_id'], []],
  ['cat_pet', '摸摸猫咪，提高亲密度', ['cat_id'], []],
  ['cat_rest', '让猫咪休息，恢复心情', ['cat_id'], []],
  ['cafe_rename_assistant', '修改小机名字或职位', ['name', 'role'], []],
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
  annotations: { readOnlyHint: name === 'cafe_status', openWorldHint: false, destructiveHint: false },
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

export function snapshot() {
  return load(database());
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

function feed(state, cat) {
  if (state.coins < 5) throw new GameError('猫猫币不足');
  const previous = cat.hunger;
  state.coins -= 5;
  cat.hunger = cap(cat.hunger + 25);
  cat.bond = cap(cat.bond + 2);
  cat.feed_count = (cat.feed_count ?? 0) + 1;
  return {
    message: `已喂食「${cat.name}」，饱食度 ${previous} → ${cat.hunger}/100，剩余 ${state.coins} 猫猫币。`,
    cat, coins: state.coins,
  };
}

function change(state, name, args) {
  switch (name) {
    case 'cat_candidates':
      if (state.cats.length >= 5) throw new GameError('猫咖最多收养 5 只猫');
      state.candidates = createCandidates();
      return state.candidates;
    case 'cat_adopt':
      return adopt(state, args);
    case 'cafe_rename_assistant':
      if (args.name?.trim()) state.assistant.name = args.name.trim();
      if (args.role?.trim()) state.assistant.role = args.role.trim();
      return state.assistant;
  }
  const cat = findCat(state, args.cat_id);
  switch (name) {
    case 'cat_feed':
      return feed(state, cat);
    case 'cat_play':
      cat.mood = cap(cat.mood + 15);
      cat.bond = cap(cat.bond + 5);
      break;
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

export function execute(name, args = {}) {
  validateArgs(name, args);
  if (name === 'cafe_status') {
    const current = snapshot();
    if (!current.state) throw new GameError('请先在网页开店，或调用 cafe_create 创建猫咖');
    return { ...current, result: current.state };
  }

  const connection = database();
  connection.exec('BEGIN IMMEDIATE');
  try {
    let { state, revision } = load(connection);
    let result;
    if (name === 'cafe_create') {
      if (state) throw new GameError('已有存档。可设置 CAT_CAFE_DATA_DIR 使用另一份存档');
      state = newCafe(args);
      result = state;
    } else {
      if (!state) throw new GameError('请先在网页开店，或调用 cafe_create 创建猫咖');
      result = change(state, name, args);
    }
    revision += 1;
    connection.prepare('UPDATE cafe SET revision = ?, state = ? WHERE id = 1').run(revision, JSON.stringify(state));
    connection.exec('COMMIT');
    return { state, revision, result };
  } catch (error) {
    connection.exec('ROLLBACK');
    throw error;
  }
}
