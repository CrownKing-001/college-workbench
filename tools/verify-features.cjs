// 端到端验证：往 localStorage 里塞测试数据，确认迁移过来的功能真的渲染出来。
// 覆盖：总览钉选倒计时、饮食记录（历史/套餐/食物库）、体重作息的打卡日历。
//
// 用法：node tools/verify-features.cjs [端口]
// 前提：npm run build + node tools/serve.cjs <端口>
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const PORT = Number(process.argv[2] || 4180);
const BASE = `http://127.0.0.1:${PORT}`;
const CDP_PORT = 9335;
const OUT = path.join(__dirname, '..', '.shots');

const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => fs.existsSync(p));
if (!EDGE) { console.error('找不到 Edge'); process.exit(1); }

fs.mkdirSync(OUT, { recursive: true });
// profile 放系统临时目录，用完即删 —— 别留在仓库里（单个几百 MB）
const { tempProfile, cleanupOnExit } = require('./cdp-profile.cjs');
const profile = tempProfile('verify-features');
cleanupOnExit(profile);

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

// 测试数据：日期用「今天」，保证落在当前视图里
const today = new Date();
const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const todayKey = key(today);
const dayAgo = new Date(today); dayAgo.setDate(dayAgo.getDate() - 1);
const dayAgoKey = key(dayAgo);

const SEED = {
  'fitplan-milestones': [
    { id: 'm1', title: '高等数学期末考试', date: todayKey, category: '考试', emoji: '📝', done: false, checklist: ['带学生证'], remindDaysBefore: 7, pinned: true },
    { id: 'm2', title: '英语四级报名', date: '2026-12-19', category: '考试', emoji: '📘', done: false, checklist: [], remindDaysBefore: 7, pinned: true },
    { id: 'm3', title: '未钉住的事项', date: '2026-11-01', category: '其他', emoji: '📌', done: false, checklist: [] },
  ],
  'fitplan-diet-logs': [
    { date: todayKey, meal: '早餐', text: '鸡蛋×2 + 牛奶×1', protein: 21, calories: 310 },
    { date: todayKey, meal: '午餐', text: '鸡腿×1 + 米饭×1 + 炒青菜×1', protein: 27, calories: 440 },
    { date: dayAgoKey, meal: '晚餐', text: '三文鱼×1 + 糙米饭×1', protein: 24, calories: 400 },
  ],
  'fitplan-templates': [
    { id: 't1', name: '我的练后餐', meal: '加餐', items: [{ foodId: 'whey', name: '乳清蛋白粉', qty: 1, protein: 24, calories: 120 }] },
  ],
  'fitplan-health-logs': [
    { date: todayKey, weight: 68.5, sleep: 7.2, steps: 9200 },
    { date: dayAgoKey, weight: 68.9, sleep: 6.4, steps: 8100 },
  ],
  'fitplan-train-done': [todayKey, dayAgoKey],
  'fitplan-settings': { theme: 'dark', trainDays: '1,3,5' },
};

const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'} | ${name}${detail && !ok ? ' → ' + detail : ''}`);
}

(async () => {
  const target = await getTarget();
  const cdp = await connect(target.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  // 先打开同源页面才能写 localStorage
  await cdp.send('Page.navigate', { url: `${BASE}/` });
  await sleep(1500);

  const seedJs = `(() => {
    const seed = ${JSON.stringify(SEED)};
    for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, JSON.stringify(v));
    return Object.keys(seed).length;
  })()`;
  const { result: seeded } = await cdp.send('Runtime.evaluate', { expression: seedJs, returnByValue: true });
  console.log(`\n已写入 ${seeded.value} 组测试数据\n`);

  async function evalOn(view, expr, theme = 'dark') {
    await cdp.send('Page.navigate', { url: 'about:blank' });
    await sleep(200);
    await cdp.send('Page.navigate', { url: `${BASE}/#/${view}?theme=${theme}` });
    await sleep(2400);
    const { result } = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true });
    return result.value;
  }

  async function shot(view, theme = 'dark', name = '') {
    const { result } = await cdp.send('Runtime.evaluate', {
      expression: `JSON.stringify({h: Math.max(document.querySelector('main')?.scrollHeight||0, document.body.scrollHeight)})`,
      returnByValue: true,
    });
    const { h } = JSON.parse(result.value);
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1440, height: Math.min(Math.max(h + 90, 1000), 5000), deviceScaleFactor: 1, mobile: false,
    });
    await sleep(500);
    const s = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    const f = path.join(OUT, `verify-${theme}-${name || view}.png`);
    fs.writeFileSync(f, Buffer.from(s.data, 'base64'));
    console.log(`   截图 ${path.basename(f)}`);
    await cdp.send('Emulation.clearDeviceMetricsOverride');
  }

  console.log('=== 总览：钉选的重要事项显示倒计时 ===');
  const dash = await evalOn('dashboard', `(() => {
    const t = document.querySelector('main').innerText;
    return JSON.stringify({
      text: t,
      hasPinnedA: t.includes('高等数学期末考试'),
      hasPinnedB: t.includes('英语四级报名'),
      hasUnpinned: t.includes('未钉住的事项'),
      hasAddBtn: t.includes('添加'),
    });
  })()`);
  const d = JSON.parse(dash);
  check('钉住的事项 1 出现在总览绿色条', d.hasPinnedA);
  check('钉住的事项 2 出现在总览绿色条', d.hasPinnedB);
  check('未钉住的事项不出现在总览', !d.hasUnpinned);
  check('总览有「添加」入口', d.hasAddBtn);
  await shot('dashboard', 'dark', 'dashboard');

  console.log('\n=== 重要事项：显示「已钉到总览」标记 ===');
  const ms = await evalOn('milestones', `(() => {
    const t = document.querySelector('main').innerText;
    return JSON.stringify({ text: t, hasPinChip: t.includes('已钉到总览'), hasHint: t.includes('图钉') });
  })()`);
  const m = JSON.parse(ms);
  check('列表里标出「已钉到总览」', m.hasPinChip);
  check('底部提示说明图钉用法', m.hasHint);
  await shot('milestones', 'dark', 'milestones');

  console.log('\n=== 饮食记录：唯一入口，含统计/历史/套餐/食物库 ===');
  const diet = await evalOn('diet', `(() => {
    const t = document.querySelector('main').innerText;
    return JSON.stringify({
      text: t,
      hasProtein: t.includes('今日蛋白质'),
      hasCalorie: t.includes('今日热量'),
      hasMealGroup: t.includes('早餐') && t.includes('午餐'),
      hasHistory: t.includes('历史记录'),
      hasTemplate: t.includes('我的练后餐'),
      hasFoodLib: t.includes('193 种'),
      hasRecorded: t.includes('鸡腿'),
    });
  })()`);
  const di = JSON.parse(diet);
  check('显示今日蛋白质统计', di.hasProtein);
  check('显示今日热量统计', di.hasCalorie);
  check('今日明细按餐次分组', di.hasMealGroup);
  check('有历史记录区', di.hasHistory);
  check('自建套餐显示出来', di.hasTemplate);
  check('食物库显示 193 种', di.hasFoodLib);
  check('已记录的餐次内容渲染出来', di.hasRecorded);
  await shot('diet', 'dark', 'diet');

  console.log('\n=== 体重作息：训练打卡日历 + 不再有饮食记录 ===');
  const health = await evalOn('health', `(() => {
    const t = document.querySelector('main').innerText;
    return JSON.stringify({
      text: t,
      hasCalendar: t.includes('训练打卡日历'),
      hasWeek: t.includes('本周一览'),
      hasWeight: t.includes('68.5'),
      hasDietRedirect: t.includes('去饮食记录'),
      hasDietForm: t.includes('记一笔'),
      hasDietPanel: t.includes('饮食记录（'),
    });
  })()`);
  const he = JSON.parse(health);
  check('有训练打卡日历', he.hasCalendar);
  check('有本周一览', he.hasWeek);
  check('体重数据显示 68.5', he.hasWeight);
  check('底部有跳转饮食记录的入口', he.hasDietRedirect);
  check('不再有「记一笔」饮食表单', !he.hasDietForm);
  check('不再有「饮食记录」面板', !he.hasDietPanel);
  await shot('health', 'dark', 'health');

  console.log('\n=== 浅色主题同样正常 ===');
  const light = await evalOn('diet', `(() => {
    const root = getComputedStyle(document.documentElement);
    return JSON.stringify({
      theme: document.documentElement.dataset.theme,
      surface0: root.getPropertyValue('--surface-0').trim(),
      txt: document.querySelector('main').innerText.length,
    });
  })()`, 'light');
  const li = JSON.parse(light);
  check('浅色主题已应用', li.theme === 'light', li.theme);
  check('浅色下背景变量正确', li.surface0 === '#f8fafc', li.surface0);
  await shot('diet', 'light', 'diet-light');

  const failed = checks.filter((c) => !c.ok);
  console.log(`\n=== ${checks.length - failed.length}/${checks.length} 通过 ===`);

  cdp.close();
  edge.kill();
  process.exit(failed.length === 0 ? 0 : 1);
})().catch((e) => {
  console.error('验证失败：', e.message);
  try { edge.kill(); } catch { /* ignore */ }
  process.exit(2);
});
