import readline from 'node:readline';
import { execute, GameError, tools, watchOrderClock } from './game.mjs';

const protocols = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const send = (message) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\n');
const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
const mode = process.env.CAT_CAFE_MCP_MODE ?? 'play';
if (!['play', 'read-only'].includes(mode)) throw new Error('CAT_CAFE_MCP_MODE 必须是 play 或 read-only。');
const available = mode === 'read-only' ? tools.filter((tool) => tool.annotations.readOnlyHint) : tools;
const allowed = new Set(available.map((tool) => tool.name));
watchOrderClock();

function callTool(params) {
  try {
    if (!allowed.has(params?.name)) throw new GameError('此客户端无权调用该工具，或工具不存在。');
    const { result } = execute(params?.name, params?.arguments);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (error) {
    if (!(error instanceof GameError)) console.error(error);
    return {
      isError: true,
      content: [{ type: 'text', text: error instanceof GameError ? error.message : '无法打开或写入猫咖存档，请检查本地 MCP 日志。' }],
    };
  }
}

input.on('line', (line) => {
  let request;
  try {
    request = JSON.parse(line);
  } catch {
    send({ id: null, error: { code: -32700, message: 'Parse error' } });
    return;
  }
  if (request?.jsonrpc !== '2.0' || typeof request.method !== 'string') {
    send({ id: request?.id ?? null, error: { code: -32600, message: 'Invalid request' } });
    return;
  }
  const { id, method, params } = request;
  if (id === undefined) return;

  let result;
  switch (method) {
    case 'initialize':
      result = {
        protocolVersion: protocols.includes(params?.protocolVersion) ? params.protocolVersion : protocols[0],
        capabilities: { tools: {} },
        serverInfo: { name: 'xiaoji-cat-cafe', version: '0.5.0' },
        instructions: '先查 get_shop_status 和 get_orders。accept_order 启动制作，process_order 检查进度，不会跳过倒计时。喂猫可用 care_for_cat 的 feed；缺猫粮时请告知店长。',
      };
      break;
    case 'ping':
      result = {};
      break;
    case 'tools/list':
      result = { tools: available };
      break;
    case 'tools/call':
      result = callTool(params);
      break;
    default:
      send({ id, error: { code: -32601, message: 'Method not found' } });
      return;
  }
  send({ id, result });
});
