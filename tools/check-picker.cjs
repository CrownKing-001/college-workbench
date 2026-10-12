// 交互回归：总览「添加倒计时」下拉必须真的可见、能点、能钉上事项。
//
// 背景：欢迎条上加过 overflow-hidden，把 absolute 下拉整个裁掉了 ——
// 表现就是「点了没反应 / 看不见」。这个脚本专门盯这类「点了没反应」的回归：
// 不只查 DOM 里有没有，还查它**渲染出来的实际位置和尺寸**。
//
// 用法：node tools/check-picker.cjs [端口]
// 前提：npm run build + node tools/serve.cjs <端口>
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const PORT = Number(process.argv[2] || 4180);
const BASE = `http://127.0.0.1:${PORT}`;
const CDP_PORT = 9336;
const OUT = path.join(__dirname, '..', '.shots');

const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => fs.existsSync(p));
if (!EDGE) { console.error('找不到 Edge'); process.exit(1); }

fs.mkdirSync(OUT, { recursive: true });
const profile = path.join(OUT, '.cdp-picker');
fs.mkdirSync(profile, { recursive: true });

const edge = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars',
  `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--window-size=1440,1200',
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

const today = new Date();
const k = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const todayKey = k(today);
const later = new Date(today); later.setDate(later.getDate() + 30);

const SEED = {
  'fitplan-milestones': [
    // 已钉住的
    { id: 'p1', title: '已钉事项', date: todayKey, category: '考试', emoji: '📝', done: false, checklist: [], pinned: true },
    // 未钉住的 —— 下拉里应该能选到它
    { id: 'u1', title: '待选事项甲', date: k(later), category: '竞赛', emoji: '🏆', done: false, checklist: [] },
    { id: 'u2', title: '待选事项乙', date: k(later), category: '证书', emoji: '🎓', done: false, checklist: [] },
  ],
  'fitplan-settings': { theme: 'dark', trainDays: '1,3,5' },
};

const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ' → ' + detail : ''}`);
}

(async () => {
  const target = await getTarget();
  const cdp = await connect(target.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  await cdp.send('Page.navigate', { url: `${BASE}/` });
  await sleep(1400);
  await cdp.send('Runtime.evaluate', {
    expression: `(() => { const s=${JSON.stringify(SEED)}; for(const[a,b]of Object.entries(s)) localStorage.setItem(a,JSON.stringify(b)); return 1; })()`,
    returnByValue: true,
  });

  await cdp.send('Page.navigate', { url: 'about:blank' });
  await sleep(200);
  await cdp.send('Page.navigate', { url: `${BASE}/#/dashboard?theme=dark` });
  await sleep(2400);

  const ev = async (expr) => {
    const { result } = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    return result.value;
  };

  console.log('=== 1. 「添加倒计时」按钮存在且可见 ===');
  const btn = await ev(`(() => {
    const b = Array.from(document.querySelectorAll('main button')).find(x => x.textContent.includes('添加倒计时') || x.textContent.trim() === '添加');
    if (!b) return JSON.stringify({ found: false });
    const r = b.getBoundingClientRect();
    const cs = getComputedStyle(b);
    return JSON.stringify({ found: true, w: Math.round(r.width), h: Math.round(r.height), vis: cs.visibility, disp: cs.display });
  })()`);
  const bi = JSON.parse(btn);
  check('按钮存在', bi.found);
  check('按钮有实际尺寸', bi.found && bi.w > 20 && bi.h > 20, bi.found ? `${bi.w}x${bi.h}` : '');
  check('按钮可见', bi.found && bi.vis === 'visible' && bi.disp !== 'none');

  console.log('\n=== 2. 点开后下拉面板确实渲染出来了（关键回归点）===');
  const after = await ev(`(async () => {
    const b = Array.from(document.querySelectorAll('main button')).find(x => x.textContent.includes('添加倒计时') || x.textContent.trim() === '添加');
    b.click();
    await new Promise(r => setTimeout(r, 400));
    // 下拉里那句提示文案是稳定标识
    const tip = Array.from(document.querySelectorAll('main div')).find(d => d.textContent.trim().startsWith('从「重要事项」中选择'));
    if (!tip) return JSON.stringify({ panel: false });
    const box = tip.closest('div[class*="absolute"]');
    if (!box) return JSON.stringify({ panel: false, reason: 'no-absolute-box' });
    const r = box.getBoundingClientRect();
    const cs = getComputedStyle(box);
    // 是否被祖先的 overflow 裁掉：逐级检查祖先，看面板是否超出其裁剪框
    let clipped = false, clipper = '';
    for (let el = box.parentElement; el; el = el.parentElement) {
      const s = getComputedStyle(el);
      if (s.overflow !== 'visible' || s.overflowX !== 'visible' || s.overflowY !== 'visible') {
        const er = el.getBoundingClientRect();
        if (r.bottom > er.bottom + 1 || r.top < er.top - 1 || r.right > er.right + 1 || r.left < er.left - 1) {
          clipped = true;
          clipper = el.className.toString().slice(0, 60);
          break;
        }
      }
    }
    const items = Array.from(box.querySelectorAll('button')).map(x => x.textContent.trim()).filter(Boolean);
    return JSON.stringify({
      panel: true, w: Math.round(r.width), h: Math.round(r.height),
      top: Math.round(r.top), vis: cs.visibility, opacity: cs.opacity,
      clipped, clipper, items,
    });
  })()`);
  const ai = JSON.parse(after);
  check('下拉面板已渲染', ai.panel, ai.reason || '');
  check('面板有实际尺寸', ai.panel && ai.w > 100 && ai.h > 40, ai.panel ? `${ai.w}x${ai.h}` : '');
  check('面板未被祖先 overflow 裁剪', ai.panel && !ai.clipped, ai.clipped ? '被裁剪者: ' + ai.clipper : '');
  check('面板里有可选项', ai.panel && ai.items.length > 0, ai.panel ? ai.items.join(' / ').slice(0, 80) : '');
  check('能看到未钉住的事项', ai.panel && ai.items.some((t) => t.includes('待选事项')), ai.panel ? ai.items.join(' / ').slice(0, 80) : '');

  console.log('\n=== 3. 选中一项后真的钉上总览 ===');
  const picked = await ev(`(async () => {
    const b = Array.from(document.querySelectorAll('main button')).find(x => x.textContent.includes('待选事项甲'));
    if (!b) return JSON.stringify({ clicked: false });
    b.click();
    await new Promise(r => setTimeout(r, 600));
    const t = document.querySelector('main').innerText;
    return JSON.stringify({ clicked: true, nowOnDash: t.includes('待选事项甲') });
  })()`);
  const pi = JSON.parse(picked);
  check('点到了「待选事项甲」', pi.clicked);
  check('点选后出现在总览绿色条', pi.nowOnDash);

  // 截图留证
  const { result: hres } = await cdp.send('Runtime.evaluate', {
    expression: `JSON.stringify({h: Math.max(document.querySelector('main')?.scrollHeight||0, document.body.scrollHeight)})`,
    returnByValue: true,
  });
  const { h } = JSON.parse(hres.value);
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1440, height: Math.min(Math.max(h + 90, 1000), 4000), deviceScaleFactor: 1, mobile: false,
  });
  await sleep(400);
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  const f = path.join(OUT, 'picker-open.png');
  fs.writeFileSync(f, Buffer.from(shot.data, 'base64'));
  console.log(`\n   截图 ${path.basename(f)}`);

  const failed = checks.filter((c) => !c.ok);
  console.log(`\n=== ${checks.length - failed.length}/${checks.length} 通过 ===`);
  cdp.close();
  edge.kill();
  process.exit(failed.length === 0 ? 0 : 1);
})().catch((e) => {
  console.error('检查失败：', e.message);
  try { edge.kill(); } catch { /* ignore */ }
  process.exit(2);
});
