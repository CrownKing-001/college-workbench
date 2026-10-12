// 截图引擎：由 run-shots.cjs 通过 UD_SHOTS=1 触发。
// 逐个切换左侧导航，把每个视图在指定主题下截一张 PNG。
const fs = require('node:fs');
const path = require('node:path');

const OUT_DIR = path.join(__dirname, '..', '.shots');

/** 导航项文案 → 截图文件名（避免中文文件名在不同工具里的编码问题） */
const VIEWS = [
  { nav: '总览', file: 'dashboard' },
  { nav: '今日', file: 'today' },
  { nav: '待办清单', file: 'todos' },
  { nav: '作业 DDL', file: 'assignments' },
  { nav: '重要事项', file: 'milestones' },
  { nav: '周计划', file: 'week' },
  { nav: '课表', file: 'courses' },
  { nav: '课表识别', file: 'calendarScan' },
  { nav: '校历识别', file: 'calendarAcademic' },
  { nav: '运动打卡', file: 'run' },
  { nav: '饮食记录', file: 'diet' },
  { nav: '智能分析', file: 'analysis' },
  { nav: '体重作息', file: 'health' },
  { nav: '设置', file: 'settings' },
];

async function runShots(app, BrowserWindow) {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const themes = JSON.parse(process.env.UD_SHOTS_THEMES || '["dark","light"]');
  const only = JSON.parse(process.env.UD_SHOTS_VIEWS || '[]');
  const list = only.length ? VIEWS.filter((v) => only.includes(v.file)) : VIEWS;

  const win = new BrowserWindow({
    width: 1440,
    height: 950,
    show: false,
    backgroundColor: '#12161d',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  });

  const errors = [];
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2) errors.push(message);
  });

  await win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  await new Promise((r) => setTimeout(r, 1200));

  const run = (js) => win.webContents.executeJavaScript(js, true);

  for (const theme of themes) {
    // 直接改 <html data-theme>，再让 React 把它持久化到设置里
    await run(`(async () => {
      document.documentElement.dataset.theme = ${JSON.stringify(theme)};
      const btns = Array.from(document.querySelectorAll('aside nav button'));
      const settings = btns.find(b => b.textContent.includes('设置'));
      if (settings) settings.click();
      await new Promise(r => setTimeout(r, 500));
      const toggle = Array.from(document.querySelectorAll('main button, header button'))
        .find(b => (b.title || '').includes('浅色') || (b.title || '').includes('深色'));
      const cur = document.documentElement.dataset.theme;
      if (toggle && cur !== ${JSON.stringify(theme)}) { toggle.click(); }
      await new Promise(r => setTimeout(r, 400));
      document.documentElement.dataset.theme = ${JSON.stringify(theme)};
      return document.documentElement.dataset.theme;
    })()`);
    await new Promise((r) => setTimeout(r, 500));

    for (const v of list) {
      const clicked = await run(`(() => {
        const b = Array.from(document.querySelectorAll('aside nav button'))
          .find(x => x.textContent.includes(${JSON.stringify(v.nav)}));
        if (!b) return false;
        b.click();
        return true;
      })()`);
      if (!clicked) {
        console.log(`  [跳过] 找不到导航项：${v.nav}`);
        continue;
      }
      // 等懒加载视图 + 图表渲染完
      await new Promise((r) => setTimeout(r, 900));
      // 滚到顶部，保证截图从页面开头开始
      await run(`document.querySelector('main').scrollTop = 0`);
      await new Promise((r) => setTimeout(r, 200));

      const img = await win.webContents.capturePage();
      const out = path.join(OUT_DIR, `${theme}-${v.file}.png`);
      fs.writeFileSync(out, img.toPNG());
      console.log(`  已截图 ${path.basename(out)}`);
    }
  }

  if (errors.length) {
    console.log(`\n⚠️ 控制台错误 ${errors.length} 条：`);
    errors.slice(0, 8).forEach((e) => console.log('   -', e));
  } else {
    console.log('\n无控制台错误');
  }
  console.log(`\n截图目录：${OUT_DIR}`);
  return 0;
}

module.exports = { runShots };
