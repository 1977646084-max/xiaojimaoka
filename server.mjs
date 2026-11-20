import readline from 'node:readline';
import { execute, GameError, tools } from './game.mjs';

const protocols = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const send = (message) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\n');
const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

function callTool(params) {
  try {
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
        serverInfo: { name: 'xiaoji-cat-cafe', version: '0.2.0' },
        instructions: '用户说「帮我喂猫」时调用 cat_feed。有且只有一只猫时可省略 cat_id。',
      };
      break;
    case 'ping':
      result = {};
      break;
    case 'tools/list':
      result = { tools };
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
