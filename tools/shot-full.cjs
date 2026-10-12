// 整页截图：普通截图只能拍到首屏，长页面（如「设置」）看不到下半部分。
// 这里用 CDP 的 captureBeyondViewport 拍完整页。
//
// 用法：node tools/shot-full.cjs <视图> [主题]
//   node tools/shot-full.cjs settings light
// 前提：先 npm run build + node tools/serve.cjs <端口>
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const PORT = Number(process.env.SHOTS_PORT || 4180);
const view = process.argv[2] || 'settings';
const theme = process.argv[3] || 'dark';
const CDP_PORT = 9334;
const OUT = path.join(__dirname, '..', '.shots', `full-${theme}-${view}.png`);

const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => fs.existsSync(p));
if (!EDGE) { console.error('找不到 Edge'); process.exit(1); }

// profile 放系统临时目录，用完即删 —— 别留在仓库里（单个几百 MB）
const { tempProfile, cleanupOnExit } = require('./cdp-profile.cjs');
const profile = tempProfile('shot-full');
cleanupOnExit(profile);

const edge = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars',
  `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--window-size=1440,1000',
  'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getTarget() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
      const list = await r.json();
      if (list.length) return list.find((t) => t.type === 'page') || list[0];
    } catch { /* 还没起来 */ }
    await sleep(250);
  }
  throw new Error('CDP 没起来');
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const { resolve: res, reject: rej } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) rej(new Error(JSON.stringify(msg.error)));
        else res(msg.result);
      }
    });
    ws.addEventListener('error', reject);
    ws.addEventListener('open', () => resolve({
      send(method, params = {}) {
        const myId = ++id;
        return new Promise((res, rej) => {
          pending.set(myId, { resolve: res, reject: rej });
          ws.send(JSON.stringify({ id: myId, method, params }));
        });
      },
      close: () => ws.close(),
    }));
  });
}

(async () => {
  const target = await getTarget();
  const cdp = await connect(target.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/#/${view}?theme=${theme}` });
  await sleep(2500);

  // 量出主内容区的真实高度
  const { result } = await cdp.send('Runtime.evaluate', {
    expression: `JSON.stringify({
      h: Math.max(document.querySelector('main')?.scrollHeight || 0, document.body.scrollHeight),
      w: 1440,
    })`,
    returnByValue: true,
  });
  const { h } = JSON.parse(result.value);

  // 只截「主内容区」：把窗口高度设成内容高度，让整页一次呈现
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: Math.min(Math.max(h + 80, 1000), 6000),
    deviceScaleFactor: 1,
    mobile: false,
  });
  await sleep(700);

  const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  fs.writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
  console.log(`已截图 ${OUT}（内容高度 ${h}px）`);

  cdp.close();
  edge.kill();
  process.exit(0);
})().catch((e) => {
  console.error('失败：', e.message);
  try { edge.kill(); } catch { /* ignore */ }
  process.exit(1);
});
