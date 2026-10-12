// 极简静态文件服务器：只用于本地预览 dist/ 与自动化截图，不参与打包。
// 用法：node tools/serve.cjs [端口] [根目录]
//   node tools/serve.cjs 4180          # 默认根目录 = dist/
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[3] || path.join(__dirname, '..', 'dist'));
const port = Number(process.argv[2] || 4180);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';

  // 所有请求限制在 root 之内，避免 ../ 越界
  const filePath = path.join(root, path.normalize(urlPath).replace(/^([/\\])+/, ''));
  if (!filePath.startsWith(root)) {
    res.writeHead(403).end('forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // SPA 回退：找不到文件时一律返回 index.html（hash 路由不会用到，但更稳）
      fs.readFile(path.join(root, 'index.html'), (e2, html) => {
        if (e2) res.writeHead(404).end('not found');
        else {
          res.writeHead(200, { 'Content-Type': MIME['.html'] });
          res.end(html);
        }
      });
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`静态服务器已启动：http://127.0.0.1:${port}/`);
  console.log(`根目录：${root}`);
});
