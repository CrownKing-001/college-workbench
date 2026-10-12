// 主题/对比度检查器：用 CDP 连上 headless Edge，读取真实计算样式，
// 确认深色与浅色两套主题都真的生效、且文字对比度达标。
//
// 用法：node tools/check-theme.cjs [端口]
// 前提：先 npm run build + node tools/serve.cjs <端口>
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const PORT = Number(process.argv[2] || 4180);
const BASE = `http://127.0.0.1:${PORT}`;
const CDP_PORT = 9333;

const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => fs.existsSync(p));
if (!EDGE) { console.error('找不到 Edge'); process.exit(1); }

const profile = path.join(__dirname, '..', '.shots', '.cdp-profile');
fs.mkdirSync(profile, { recursive: true });

const edge = spawn(EDGE, [
  '--headless=new',
  '--disable-gpu',
  `--remote-debugging-port=${CDP_PORT}`,
  `--user-data-dir=${profile}`,
  '--no-first-run',
  '--no-default-browser-check',
  'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 等 CDP 端口起来，拿一个可用的 target websocket */
async function targets() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
      const list = await r.json();
      if (list.length) return list;
    } catch { /* 还没起来 */ }
    await sleep(250);
  }
  throw new Error('CDP 没起来');
}

/** 极简 CDP 客户端：只需要 Page.navigate + Runtime.evaluate */
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

/** sRGB 相对亮度 → WCAG 对比度 */
function luminance([r, g, b]) {
  const f = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function parseRgb(s) {
  const m = String(s).match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const parts = m[1].split(',').map((x) => parseFloat(x.trim()));
  return { rgb: parts.slice(0, 3), a: parts.length > 3 ? parts[3] : 1 };
}
function contrast(fg, bg) {
  const l1 = luminance(fg), l2 = luminance(bg);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

const PROBE = `(() => {
  const cs = (el) => el ? getComputedStyle(el) : null;
  const root = getComputedStyle(document.documentElement);
  const aside = document.querySelector('aside');
  const header = document.querySelector('header');
  const main = document.querySelector('main');
  const navBtn = aside ? Array.from(aside.querySelectorAll('nav button')).find(b => !b.className.includes('emerald')) || aside.querySelector('nav button') : null;
  const panel = document.querySelector('main section');
  const panelTitle = panel ? panel.querySelector('h2') : null;
  return JSON.stringify({
    theme: document.documentElement.dataset.theme,
    vars: {
      sidebar: root.getPropertyValue('--sidebar').trim(),
      surface0: root.getPropertyValue('--surface-0').trim(),
      surface1: root.getPropertyValue('--surface-1').trim(),
      text1: root.getPropertyValue('--text-1').trim(),
    },
    asideBg: cs(aside)?.backgroundColor ?? null,
    asideColor: cs(aside)?.color ?? null,
    headerBg: cs(header)?.backgroundColor ?? null,
    mainBg: cs(main)?.backgroundColor ?? null,
    bodyBg: cs(document.body).backgroundColor,
    navBtnColor: cs(navBtn)?.color ?? null,
    panelBg: cs(panel)?.backgroundColor ?? null,
    panelTitleColor: cs(panelTitle)?.color ?? null,
  });
})()`;

(async () => {
  const list = await targets();
  const page = list.find((t) => t.type === 'page') || list[0];
  const cdp = await connect(page.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  let failures = 0;

  for (const theme of ['dark', 'light']) {
    // 先跳 about:blank 强制完整重载 —— 只改 hash 不会重新加载页面，
    // 那样测到的还是上一次的主题。
    await cdp.send('Page.navigate', { url: 'about:blank' });
    await sleep(300);
    await cdp.send('Page.navigate', { url: `${BASE}/#/dashboard?theme=${theme}` });
    await sleep(2200);
    const { result } = await cdp.send('Runtime.evaluate', { expression: PROBE, returnByValue: true });
    const d = JSON.parse(result.value);

    console.log(`\n=== ${theme.toUpperCase()} ===`);
    console.log(`  data-theme        : ${d.theme}`);
    console.log(`  --sidebar         : ${d.vars.sidebar}`);
    console.log(`  --surface-0       : ${d.vars.surface0}`);
    console.log(`  --surface-1       : ${d.vars.surface1}`);
    console.log(`  aside 背景        : ${d.asideBg}`);
    console.log(`  header 背景       : ${d.headerBg}`);
    console.log(`  body 背景         : ${d.bodyBg}`);
    console.log(`  panel 背景        : ${d.panelBg}`);

    const checks = [
      ['data-theme 已切换', d.theme === theme],
      ['body 背景跟随主题', theme === 'dark'
        ? parseRgb(d.bodyBg) && luminance(parseRgb(d.bodyBg).rgb) < 0.15
        : parseRgb(d.bodyBg) && luminance(parseRgb(d.bodyBg).rgb) > 0.75],
      ['aside 背景跟随主题', theme === 'dark'
        ? parseRgb(d.asideBg) && luminance(parseRgb(d.asideBg).rgb) < 0.15
        : parseRgb(d.asideBg) && luminance(parseRgb(d.asideBg).rgb) > 0.75],
      ['panel 背景跟随主题', theme === 'dark'
        ? parseRgb(d.panelBg) && luminance(parseRgb(d.panelBg).rgb) < 0.2
        : parseRgb(d.panelBg) && luminance(parseRgb(d.panelBg).rgb) > 0.9],
    ];

    // 正文对比度
    const pairs = [
      ['侧边导航文字', d.navBtnColor, d.asideBg, 4.5],
      ['面板标题', d.panelTitleColor, d.panelBg, 4.5],
    ];
    for (const [name, fg, bg, min] of pairs) {
      const f = parseRgb(fg), b = parseRgb(bg);
      if (!f || !b) { checks.push([`${name} 对比度`, false]); continue; }
      const c = contrast(f.rgb, b.rgb);
      console.log(`  ${name} 对比度   : ${c.toFixed(2)}:1 （要求 ≥ ${min}）`);
      checks.push([`${name} 对比度 ≥ ${min}`, c >= min]);
    }

    for (const [name, ok] of checks) {
      console.log(`  ${ok ? 'PASS' : 'FAIL'} | ${name}`);
      if (!ok) failures++;
    }
  }

  cdp.close();
  edge.kill();
  console.log(`\n${failures === 0 ? '✅ 两套主题均通过' : `❌ ${failures} 项未通过`}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error('检查失败：', e.message);
  try { edge.kill(); } catch { /* ignore */ }
  process.exit(2);
});
