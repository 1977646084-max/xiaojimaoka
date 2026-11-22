import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('已领养的猫每满一个现实小时扣除饱食度和清洁度', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'cat-care-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  process.env.CAT_CAFE_DATA_DIR = dir;
  await writeFile(join(dir, 'save.json'), JSON.stringify({
    version: 1, shop_name: '猫咖', assistant: { name: '小机' }, coins: 50,
    candidates: [], cats: [{ id: 'cat', name: '布丁', hunger: 0.5, mood: 70, bond: 0 }],
    inventory: { 'paw-food': 1 },
  }));
  const { execute, snapshot } = await import('../game.mjs');
  const start = 1730000000000;
  const hour = 3600000;
  const cat = (time) => snapshot(time).state.cats[0];

  assert.equal(cat(start).hunger, 0.5);
  assert.equal(cat(start).careUpdatedAt, start);
  assert.equal(cat(start + hour - 1).hunger, 0.5);
  assert.equal(cat(start + hour).hunger, 0);
  assert.equal(cat(start + hour).cleanliness, 69.5);
  assert.equal(cat(start + 3.5 * hour).cleanliness, 68.5);
  const empty = cat(start + 141.5 * hour);
  assert.equal(empty.hunger, 0);
  assert.equal(empty.cleanliness, 0);
  assert.equal(empty.mood, 70);
  const now = start + 141.5 * hour;
  assert.equal(execute('cat_feed', {}, now).result.cat.hunger, 25);
  assert.equal(execute('cat_clean', {}, now).result.cat.cleanliness, 25);
  assert.equal(cat(start + 142 * hour).hunger, 24.5);
  assert.equal(cat(start + 142 * hour).cleanliness, 24.5);
});
