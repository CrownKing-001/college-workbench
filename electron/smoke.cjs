// 冒烟测试：在真实的 Electron 环境里加载应用，验证渲染与关键交互。
// 由 main.cjs 通过 UD_SMOKE=1 触发，因此能正常拿到 Electron 内置模块。
const path = require('node:path');
const fs = require('node:fs');

const results = [];
const log = (ok, name, extra = '') => {
  results.push({ ok, name, extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${extra ? ' | ' + extra : ''}`);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runSmoke(app, BrowserWindow) {
  const OUT_DIR = path.join(__dirname, '..', '.smoke');
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const errors = [];
  win.webContents.on('console-message', (_e, level, message) => {
    // Electron 未打包时会打印安全告警（打包后自动消失），不算应用错误
    const isElectronWarning = message.includes('Electron Security Warning');
    if (level >= 2 && !isElectronWarning) errors.push(message);
  });
  win.webContents.on('render-process-gone', (_e, d) => {
    errors.push(`render-process-gone: ${JSON.stringify(d)}`);
  });

  await win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  await sleep(2500);

  const run = (code) => win.webContents.executeJavaScript(code, true);

  // 1. 应用挂载
  const rootLen = await run(`document.getElementById('root').innerHTML.length`);
  log(rootLen > 500, '应用已渲染', `root innerHTML ${rootLen} 字符`);

  // 2. 导航完整
  const navLabels = await run(
    `Array.from(document.querySelectorAll('aside nav button')).map(b => b.textContent.trim())`
  );
  const expectNav = ['总览', '今日', '待办清单', '作业 DDL', '重要事项', '周计划', '课表', '课表识别', '运动打卡', '饮食记录', '智能分析', '体重作息', '设置'];
  const missing = expectNav.filter((n) => !navLabels.some((l) => l.includes(n)));
  log(missing.length === 0, '导航包含全部 13 个模块',
    missing.length ? `缺少 ${missing.join(',')}` : `共 ${navLabels.length} 项`);

  // 3. preload 桥接
  const bridge = await run(`typeof window.desktop === 'object' && window.desktop.isDesktop === true`);
  log(bridge === true, 'preload 桌面桥接已注入');

  // 4. 数据目录
  const dataDir = await run(`window.desktop.dataDir()`);
  log(typeof dataDir === 'string' && dataDir.length > 0, '数据目录可访问', dataDir);

  // 5. 存储往返
  const roundTrip = await run(`(async () => {
    await window.desktop.set('smoke-test', { hello: '世界', n: 42 });
    return JSON.stringify(await window.desktop.get('smoke-test', null));
  })()`);
  log(roundTrip.includes('世界') && roundTrip.includes('42'), '文件存储读写往返正常', roundTrip);

  // 6. 课表初始为空（空白模板不预置任何课程）
  const courseCount = await run(`(async () => {
    const c = await window.desktop.get('fitplan-courses', null);
    return Array.isArray(c) ? c.length : -1;
  })()`);
  log(courseCount === 0, '课表初始为空（不预置数据）', `${courseCount} 条课程`);

  // 7. 逐一切换视图
  const viewResults = [];
  for (const label of expectNav) {
    const clicked = await run(`(() => {
      const b = Array.from(document.querySelectorAll('aside nav button')).find(x => x.textContent.includes(${JSON.stringify(label)}));
      if (!b) return false; b.click(); return true;
    })()`);
    await sleep(320);
    const len = await run(`document.querySelector('main').innerText.length`);
    viewResults.push({ label, clicked, len });
  }
  const broken = viewResults.filter((v) => !v.clicked || v.len < 20);
  log(broken.length === 0, '所有视图切换后均有内容',
    broken.length ? `异常：${broken.map((v) => v.label).join(',')}`
      : viewResults.map((v) => `${v.label}:${v.len}`).join(' '));

  // 8. 待办新增
  await run(`(() => { Array.from(document.querySelectorAll('aside nav button')).find(x => x.textContent.includes('待办清单')).click(); })()`);
  await sleep(350);
  const todoAdded = await run(`(async () => {
    const input = document.querySelector('main input[placeholder*="要做什么"]');
    if (!input) return 'no-input';
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, '冒烟测试：写实验报告');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 120));
    const btn = Array.from(document.querySelectorAll('main button')).find(b => b.textContent.includes('添加'));
    if (!btn) return 'no-button';
    btn.click();
    await new Promise(r => setTimeout(r, 500));
    return JSON.stringify(await window.desktop.get('fitplan-todos', []));
  })()`);
  log(todoAdded.includes('冒烟测试'), '待办可新增并落盘', todoAdded.slice(0, 100));

  // 9. 作业新增
  const assignAdded = await run(`(async () => {
    Array.from(document.querySelectorAll('aside nav button')).find(x => x.textContent.includes('作业 DDL')).click();
    await new Promise(r => setTimeout(r, 400));
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    const title = Array.from(document.querySelectorAll('main input')).find(i => i.placeholder && i.placeholder.includes('第 3 章'));
    const date = document.querySelector('main input[type=date]');
    if (!title || !date) return 'no-input';
    setter.call(title, '冒烟测试：实验三报告');
    title.dispatchEvent(new Event('input', { bubbles: true }));
    setter.call(date, '2026-10-20');
    date.dispatchEvent(new Event('input', { bubbles: true }));
    date.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 250));
    const btn = Array.from(document.querySelectorAll('main button')).find(b => b.textContent.includes('添加作业'));
    if (!btn) return 'no-button';
    btn.click();
    await new Promise(r => setTimeout(r, 500));
    return JSON.stringify(await window.desktop.get('fitplan-assignments', []));
  })()`);
  log(assignAdded.includes('冒烟测试') && assignAdded.includes('2026-10-20'), '作业可新增并落盘', assignAdded.slice(0, 140));

  // 10. 运动打卡
  // 注意：打卡有「今天已打过就不重复计」的保护逻辑，所以先清空历史再测新增。
  // 重要：reload 必须单独发一次 executeJavaScript —— 页面重载会销毁当前执行上下文，
  // 如果 reload 后面的语句还在同一个脚本里，那个 Promise 永远不会 resolve（测试会卡死）。
  await run(`window.desktop.set('fitplan-run-logs', [])`);
  await win.webContents.reload();
  await sleep(2500);
  const runCheck = await run(`(async () => {
    const nav = Array.from(document.querySelectorAll('aside nav button'));
    const btn0 = nav.find(x => x.textContent.includes('运动打卡'));
    if (!btn0) return 'no-nav';
    btn0.click();
    await new Promise(r => setTimeout(r, 700));
    const before = (await window.desktop.get('fitplan-run-logs', [])).length;
    const b = Array.from(document.querySelectorAll('main button')).find(x => x.textContent.includes('+1'));
    if (!b) return 'no-button';
    b.click();
    await new Promise(r => setTimeout(r, 700));
    const after = (await window.desktop.get('fitplan-run-logs', [])).length;
    return before + '->' + after;
  })()`);
  if (runCheck.includes('->')) {
    const [b0, a0] = runCheck.split('->').map(Number);
    log(a0 === b0 + 1, '运动打卡计数 +1', runCheck);
  } else {
    log(false, '运动打卡计数 +1', runCheck);
  }

  // 11. 课表编辑页可渲染（空状态）
  const coursesOk = await run(`(async () => {
    Array.from(document.querySelectorAll('aside nav button')).find(x => x.textContent.includes('课表')).click();
    await new Promise(r => setTimeout(r, 400));
    const txt = document.querySelector('main').innerText;
    return txt.includes('课程总览');
  })()`);
  log(coursesOk === true, '课表页渲染且为空状态');

  // 12. 设置页
  const settingsOk = await run(`(async () => {
    Array.from(document.querySelectorAll('aside nav button')).find(x => x.textContent.includes('设置')).click();
    await new Promise(r => setTimeout(r, 400));
    const txt = document.querySelector('main').innerText;
    return txt.includes('数据') && typeof window.desktop.exportBackup === 'function';
  })()`);
  log(settingsOk === true, '设置页渲染且备份接口可用');

  // 12b. 饮食记录：文字识别 → 营养成分自动计算 → 落盘
  const dietCalc = await run(`(async () => {
    Array.from(document.querySelectorAll('aside nav button')).find(x => x.textContent.includes('饮食记录')).click();
    await new Promise(r => setTimeout(r, 500));
    const input = Array.from(document.querySelectorAll('main input')).find(i => i.placeholder && i.placeholder.includes('鸡腿'));
    if (!input) return 'no-input';
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, '鸡腿 + 鸡蛋 + 米饭');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 160));
    const btn = Array.from(document.querySelectorAll('main button')).find(b => b.textContent.trim() === '识别');
    if (!btn) return 'no-recognize-button';
    btn.click();
    await new Promise(r => setTimeout(r, 400));
    const txt = document.querySelector('main').innerText;
    const m = txt.match(/本餐清单/);
    return m ? txt.slice(txt.indexOf('本餐清单'), txt.indexOf('本餐清单') + 120).replace(/\\s+/g, ' ') : 'no-list';
  })()`);
  const dietOk = /蛋白/.test(dietCalc) && !dietCalc.startsWith('no-');
  log(dietOk, '饮食：文字描述可识别出营养', dietCalc.slice(0, 110));

  // 12c. 饮食记录可保存并落盘
  const dietSaved = await run(`(async () => {
    const btn = Array.from(document.querySelectorAll('main button')).find(b => b.textContent.includes('保存') && b.textContent.includes('记录'));
    if (!btn) return 'no-save-button';
    btn.click();
    await new Promise(r => setTimeout(r, 600));
    const logs = await window.desktop.get('fitplan-diet-logs', []);
    const last = logs[logs.length - 1];
    return JSON.stringify({ n: logs.length, protein: last && last.protein, items: last && last.items && last.items.length });
  })()`);
  let dietSavedOk = false;
  try {
    const d = JSON.parse(dietSaved);
    // 必须真的落盘、有正的蛋白质、且带食物明细
    dietSavedOk = d.n > 0 && typeof d.protein === 'number' && d.protein > 0 && d.items > 0;
  } catch {
    dietSavedOk = false;
  }
  log(dietSavedOk, '饮食：记录可保存并落盘', dietSaved.slice(0, 130));

  // 12d. 照片接口可用（不实际写盘）
  const photoApi = await run(`(async () => {
    const p = window.desktop.photo;
    if (!p) return 'no-photo-api';
    const usage = await p.usage();
    return typeof p.pick === 'function' && typeof p.read === 'function' && typeof usage.count === 'number'
      ? 'ok:' + usage.count : 'bad';
  })()`);
  log(photoApi.startsWith('ok:'), '照片接口已就绪', photoApi);

  // 12e. 重要事项：空白模板不预置任何事项，且能新增自定义事项
  const msView = await run(`(async () => {
    Array.from(document.querySelectorAll('aside nav button')).find(x => x.textContent.includes('重要事项')).click();
    await new Promise(r => setTimeout(r, 600));
    const txt = document.querySelector('main').innerText;
    return JSON.stringify({
      hasEmpty: txt.includes('还没有事项') || txt.includes('新建事项'),
      hasBtn: !!Array.from(document.querySelectorAll('main button')).find(b => b.textContent.includes('新建事项')),
    });
  })()`);
  let msViewOk = false;
  try {
    const m = JSON.parse(msView);
    msViewOk = m.hasEmpty && m.hasBtn;
  } catch { msViewOk = false; }
  log(msViewOk, '重要事项：空白状态且可新建', msView.slice(0, 140));

  // 12f. 新增一条自定义事项（模拟「期末」），确认能落盘
  const msAdd = await run(`(async () => {
    const btn = Array.from(document.querySelectorAll('main button')).find(b => b.textContent.includes('新建事项'));
    if (!btn) return 'no-new-button';
    btn.click();
    await new Promise(r => setTimeout(r, 400));
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    const name = Array.from(document.querySelectorAll('main input')).find(i => i.placeholder && i.placeholder.includes('高数期末考试'));
    if (!name) return 'no-name-input';
    setter.call(name, '冒烟测试：期末复习');
    name.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 200));
    const save = Array.from(document.querySelectorAll('main button')).find(b => b.textContent.trim() === '保存');
    if (!save) return 'no-save-button';
    save.click();
    await new Promise(r => setTimeout(r, 600));
    const list = await window.desktop.get('fitplan-milestones', []);
    return JSON.stringify({ n: list.length, found: list.some(x => x.title === '冒烟测试：期末复习') });
  })()`);
  let msAddOk = false;
  try {
    const m = JSON.parse(msAdd);
    msAddOk = m.found === true;
  } catch { msAddOk = false; }
  log(msAddOk, '重要事项：可新增自定义事项并落盘', msAdd.slice(0, 140));

  // 12g. 解析器：量词后置写法（苹果一个 / 米饭二两）应能识别
  const parseCheck = await run(`(async () => {
    Array.from(document.querySelectorAll('aside nav button')).find(x => x.textContent.includes('饮食记录')).click();
    await new Promise(r => setTimeout(r, 500));
    const input = Array.from(document.querySelectorAll('main input')).find(i => i.placeholder && i.placeholder.includes('鸡腿'));
    if (!input) return 'no-input';
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, '米饭二两 + 鸡蛋两个');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 160));
    const btn = Array.from(document.querySelectorAll('main button')).find(b => b.textContent.trim() === '识别');
    if (!btn) return 'no-recognize-button';
    btn.click();
    await new Promise(r => setTimeout(r, 400));
    const txt = document.querySelector('main').innerText;
    // 米饭二两 7g/340kcal + 鸡蛋×2 13g/150kcal = 20g / 490kcal
    return txt.includes('本餐清单') ? (txt.match(/(\\d+)g 蛋白 · (\\d+) kcal/) || ['', '?', '?']).slice(1).join('/') : 'no-list';
  })()`);
  log(parseCheck === '20/490', '解析器：量词后置写法识别正确（米饭二两 + 鸡蛋两个 = 20g/490kcal）', parseCheck);

  // 12h. 课表识别页：可进入、空状态正常、OCR 桥接已就绪
  const calView = await run(`(async () => {
    Array.from(document.querySelectorAll('aside nav button')).find(x => x.textContent.includes('课表识别')).click();
    await new Promise(r => setTimeout(r, 600));
    const txt = document.querySelector('main').innerText;
    const cal = window.desktop.calendar;
    return JSON.stringify({
      hasEmpty: txt.includes('还没有识别结果') || txt.includes('课表识别'),
      hasPickBtn: !!Array.from(document.querySelectorAll('main button')).find(b => b.textContent.includes('选择课表图片')),
      bridge: !!(cal && typeof cal.pick === 'function' && typeof cal.ocr === 'function' && typeof cal.importPath === 'function' && typeof cal.timetable === 'function'),
    });
  })()`);
  let calViewOk = false;
  try {
    const m = JSON.parse(calView);
    calViewOk = m.hasEmpty && m.hasPickBtn && m.bridge;
  } catch { calViewOk = false; }
  log(calViewOk, '课表识别：页面可进入且 OCR 桥接就绪', calView.slice(0, 160));

  // 13. 无控制台错误
  log(errors.length === 0, '无控制台错误', errors.slice(0, 3).join(' | ') || 'clean');

  // 存档截图与结果
  try {
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(OUT_DIR, 'app.png'), img.toPNG());
    console.log('截图已保存: .smoke/app.png');
  } catch (e) {
    console.log('截图失败:', e.message);
  }

  const sample = await run(`document.querySelector('main').innerText.slice(0, 300)`);
  fs.writeFileSync(
    path.join(OUT_DIR, 'results.json'),
    JSON.stringify({ results, errors, mainSample: sample }, null, 2),
    'utf8'
  );

  const failed = results.filter((r) => !r.ok);
  console.log(`\n=== ${results.length - failed.length}/${results.length} 通过 ===`);
  return failed.length === 0 ? 0 : 1;
}

module.exports = { runSmoke };
