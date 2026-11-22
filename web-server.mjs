import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { isIPv4 } from 'node:net';
import { parseArgs } from 'node:util';
import { execute, GameError, saveSprite, snapshot, sprite } from './game.mjs';
import { products, shop } from './catalog.mjs';

const { values } = parseArgs({
  options: { host: { type: 'string', default: '127.0.0.1' }, port: { type: 'string', default: '8765' } },
});
const port = Number(values.port);
if (!isIPv4(values.host) || values.host === '0.0.0.0' || !Number.isInteger(port) || port < 0 || port > 65535) {
  console.error('请指定 Mac 的 IPv4 地址和有效端口。');
  process.exit(1);
}

const files = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/dialogue.js': ['dialogue.js', 'text/javascript; charset=utf-8'],
  '/visitors.js': ['visitors.js', 'text/javascript; charset=utf-8'],
};
const assetRoute = /^\/assets\/[a-z-]+\.png$/;
const customRoute = /^\/assets\/custom\/([0-9a-f-]{36})$/;
const headers = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
};

function respond(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { ...headers, 'Content-Type': type });
  res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
}

async function readBytes(req, limit) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new GameError('文件或请求内容太大。');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readBody(req) {
  const bytes = await readBytes(req, 4096);
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new GameError('无效的 JSON 请求');
  }
}

function imageType(bytes) {
  if (bytes.length < 12) return null;
  if (bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (['GIF87a', 'GIF89a'].includes(bytes.toString('ascii', 0, 6))) return 'image/gif';
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

const server = createServer(async (req, res) => {
  const actualPort = server.address().port;
  const suffix = actualPort === 80 ? '' : `:${actualPort}`;
  const allowedHosts = [values.host + suffix];
  if (values.host === '127.0.0.1') allowedHosts.push('localhost' + suffix);
  if (!allowedHosts.includes(req.headers.host)) return respond(res, 403, { error: '请使用启动时显示的地址' });
  const [route, query] = req.url.split('?');
  const fromWeb = req.headers['x-cat-cafe'] === 'web' && req.headers.origin === `http://${req.headers.host}`;

  try {
    if (req.method === 'GET' && route === '/api/state') return respond(res, 200, snapshot());
    if (req.method === 'GET' && route === '/api/catalog') return respond(res, 200, { products, shop });
    if (req.method === 'POST' && route === '/api/action') {
      if (!fromWeb || req.headers['content-type'] !== 'application/json') {
        return respond(res, 403, { error: '请从猫咖网页操作' });
      }
      const body = await readBody(req);
      return respond(res, 200, execute(body?.name, body?.args));
    }
    if (route === '/api/sprites' && ['PUT', 'DELETE'].includes(req.method)) {
      if (!fromWeb) return respond(res, 403, { error: '请从猫咖网页操作' });
      const params = new URLSearchParams(query);
      const image = req.method === 'PUT' ? await readBytes(req, 2 * 1024 * 1024) : null;
      const type = image && imageType(image);
      if (image && !type) throw new GameError('请选择 PNG、JPEG、GIF 或 WebP 图片。');
      return respond(res, 200, saveSprite(params.get('target'), params.get('cat_id'), image, type));
    }
    if (req.method === 'GET') {
      const custom = route.match(customRoute);
      if (custom) {
        const asset = sprite(custom[1]);
        return asset ? respond(res, 200, asset.image, asset.type) : respond(res, 404, { error: '素材不存在' });
      }
      const file = Object.hasOwn(files, route)
        ? files[route]
        : assetRoute.test(route) && [route.slice(1), 'image/png'];
      if (file) {
        const [name, type] = file;
        return respond(res, 200, await readFile(new URL('./web/' + name, import.meta.url)), type);
      }
    }
    respond(res, 404, { error: '页面不存在' });
  } catch (error) {
    if (error instanceof GameError) return respond(res, 400, { error: error.message });
    if (error.code === 'ENOENT') return respond(res, 404, { error: '文件不存在' });
    console.error(error);
    respond(res, 500, { error: '猫咖存档暂时不可用，请查看终端输出' });
  }
});

server.on('error', (error) => {
  console.error(error.code === 'EADDRINUSE' ? '端口已被占用，请用 --port 指定其他端口。' : error.message);
  process.exitCode = 1;
});
server.listen(port, values.host, () => console.log(`猫咖网页：http://${values.host}:${server.address().port}`));
