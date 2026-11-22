import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { DatabaseSync } from 'node:sqlite';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));

async function saveDirectory(t) {
  const dir = await mkdtemp(join(tmpdir(), 'cat-cafe-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test('计时、工作互动、百次成就与跨日状态', async (t) => {
  process.env.CAT_CAFE_DATA_DIR = await saveDirectory(t);
  delete process.env.CAT_CAFE_ORDER_SECONDS;
  const { execute, snapshot } = await import('../game.mjs');
  let now = 100;
  const act = (name, args = {}) => execute(name, args, now);
  act('cafe_create', { shop_name: '猫咖', assistant_name: '小机' });
  const candidate = act('cat_candidates').result[0];
  const adopted = act('cat_adopt', { cat_id: candidate.id, name: '布丁' });
  const id = adopted.business.orders[0].id;
  const started = act('accept_order', { order_id: id });
  const poke = () => act('interact_with_robot', { action: 'poke' });
  assert.throws(() => act('accept_order', { order_id: id }), /已经交给/);
  assert.equal(started.business.work.remainingMs, 20000);
  const moods = new Set();
  for (let index = 1; index <= 99; index += 1) {
    const effect = poke();
    moods.add(effect.result.mood);
    assert.equal(effect.business.resigning, false);
  }
  assert.deepEqual([...moods], ['curious', 'protest', 'helpless', 'angry']);
  const unlock = act('interact_with_robot', { action: 'stick', item: 'paw' });
  assert.equal(unlock.result.unlocked, true);
  assert.equal(unlock.business.resigning, true);
  assert.deepEqual(unlock.state.robot.stickers, ['paw']);
  assert.equal(act('interact_with_robot', { action: 'feed', item: 'coffee' }).result.resignation, undefined);
  assert.match(act('interact_with_robot', { action: 'chat', message: '咖啡' }).result.line, /咖啡/);
  now += 19999;
  const cooking = act('process_order', { order_id: id });
  assert.equal(cooking.result.status, 'serving');
  assert.equal(cooking.result.remainingMs, 1);
  assert.equal(cooking.business.time, adopted.business.time);
  assert.equal(cooking.state.coins, adopted.state.coins);
  now += 1;
  const close = act('process_order', { order_id: id });
  assert.equal(close.result.status, 'served');
  assert.equal(close.business.served, 1);
  assert.ok(close.state.coins > adopted.state.coins);
  assert.equal(act('process_order', { order_id: id }).state.coins, close.state.coins);
  assert.equal(snapshot(now).business.resigning, true);
  assert.equal(act('business_close').business.resigning, false);
  const tomorrow = act('business_open');
  assert.equal(tomorrow.business.resigning, false);
  assert.equal(tomorrow.state.robot.achievement.day, 1);
  const next = tomorrow.business.orders[0].id;
  act('accept_order', { order_id: next });
  act('business_close');
  now += 20000;
  assert.equal(act('process_order', { order_id: next }).result.status, 'cancelled');
  assert.equal(snapshot(now).state.coins, close.state.coins);
  assert.deepEqual(act('interact_with_robot', { action: 'remove_sticker', item: 'paw' }).state.robot.stickers, []);
});

function daemon(t, script, args, env) {
  const child = spawn(process.execPath, [join(root, script), ...args], { env, stdio: ['pipe', 'pipe', 'inherit'] });
  t.after(() => { if (child.exitCode === null) child.kill(); });
  return child;
}

function mcp(t, env) {
  const child = daemon(t, 'server.mjs', [], env);
  const replies = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
  let id = 0;
  async function request(method, params) {
    const requestId = ++id;
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: requestId, method, params }) + '\n');
    const { value } = await replies.next();
    const result = JSON.parse(value);
    assert.equal(result.id, requestId);
    return result.result;
  }
  return {
    request,
    async tool(name, args = {}, expectedError) {
      const reply = await request('tools/call', { name, arguments: args });
      if (expectedError) {
        assert.equal(reply.isError, true);
        assert.match(reply.content[0].text, expectedError);
        return null;
      }
      assert.ok(!reply.isError, reply.content[0].text);
      return JSON.parse(reply.content[0].text);
    },
  };
}

test('网页与两个真实 stdio 进程共享订单、猫咪、权限和后台结算', { timeout: 15000 }, async (t) => {
  const dir = await saveDirectory(t);
  const env = { ...process.env, CAT_CAFE_DATA_DIR: dir, CAT_CAFE_ORDER_SECONDS: '2', CAT_CAFE_MCP_MODE: 'play' };
  const child = daemon(t, 'web-server.mjs', ['--port', '0'], env);
  const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
  const url = (await lines.next()).value.match(/http:\/\/127\.0\.0\.1:\d+/)[0];
  const state = () => fetch(url + '/api/state').then((res) => res.json());
  async function web(name, args = {}) {
    const response = await fetch(url + '/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: url, 'X-Cat-Cafe': 'web' },
      body: JSON.stringify({ name, args }),
    });
    assert.equal(response.ok, true);
    return response.json();
  }
  await web('cafe_create', { shop_name: '猫咖', assistant_name: '小机' });
  const { result: [cat] } = await web('cat_candidates');
  await web('cat_adopt', { cat_id: cat.id, name: '布丁' });
  await web('shop_buy', { item_id: 'paw-food' });
  const client = mcp(t, env);
  const reader = mcp(t, { ...env, CAT_CAFE_MCP_MODE: 'read-only' });
  const hello = await client.request('initialize', { protocolVersion: '2025-11-25' });
  assert.equal(hello.serverInfo.version, '0.5.0');
  assert.equal((await reader.request('tools/list')).tools.some(({ name }) => name === 'accept_order'), false);
  assert.equal((await reader.tool('get_cats')).cats[0].name, '布丁');
  await reader.tool('care_for_cat', { action: 'feed' }, /无权/);
  await client.tool('care_for_cat', { action: 'feed', cat_id: cat.id });
  assert.equal((await state()).state.cats[0].hunger, 95);
  const { orders } = await client.tool('get_orders');
  const order = orders.find(({ status }) => status === 'waiting');
  const orderArgs = { order_id: order.id };
  const [mcpAccept, webAccept] = await Promise.all([
    client.request('tools/call', { name: 'accept_order', arguments: orderArgs }),
    fetch(url + '/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: url, 'X-Cat-Cafe': 'web' },
      body: JSON.stringify({ name: 'business_assign_order', args: orderArgs }),
    }),
  ]);
  assert.equal(Number(!mcpAccept.isError) + Number(webAccept.ok), 1);
  await webAccept.json();
  assert.equal((await state()).business.work.orderId, order.id);
  await client.tool('accept_order', { order_id: order.id }, /已经交给/);
  await client.tool('interact_with_robot', { action: 'stick', item: 'bow' });
  assert.deepEqual((await state()).state.robot.stickers, ['bow']);
  const db = new DatabaseSync(join(dir, 'save.sqlite'), { readOnly: true });
  try {
    const query = db.prepare('SELECT state FROM cafe WHERE id = 1');
    let count = 0;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      count = JSON.parse(query.get().state).business.day.cursor;
      if (count > 0) break;
      await delay(100);
    }
    assert.ok(count > 0, '无人刷新时也应完成制作');
  } finally {
    db.close();
  }
  assert.equal((await client.tool('process_order', { order_id: order.id })).status, 'served');
  await web('business_close');
  assert.equal((await client.tool('get_shop_status')).phase, 'closed');
  assert.ok((await client.tool('get_business_summary')).revenue > 0);
});
