// 用系统自带的 Edge（headless）给每个视图截图，用于人工检查 UI。
// 前提：先 npm run build，再 node tools/serve.cjs <端口>。
//
// 用法：
//   node tools/shots-edge.cjs                 # 全部视图，深色
//   node tools/shots-edge.cjs dark light      # 全部视图，两套主题
//   node tools/shots-edge.cjs dark dashboard,diet,health
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const PORT = process.env.SHOTS_PORT || 4180;
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = path.join(__dirname, '..', '.shots');

const EDGE_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];
const browser = EDGE_CANDIDATES.find((p) => fs.existsSync(p));
if (!browser) {
  console.error('找不到 Edge / Chrome，无法截图。');
  process.exit(1);
}

const args = process.argv.slice(2);
const themes = args.filter((a) => a === 'dark' || a === 'light');
// 其余参数都当作「视图名列表」，支持逗号分隔或空格分隔
const viewArgs = args.filter((a) => a !== 'dark' && a !== 'light');
const themeList = themes.length ? themes : ['dark'];

const ALL = [
  'dashboard', 'today', 'todos', 'assignments', 'milestones', 'week',
  'courses', 'calendarScan', 'calendarAcademic', 'run', 'diet',
  'analysis', 'health', 'settings',
];
const views = viewArgs.length
  ? viewArgs.flatMap((s) => s.split(',')).map((s) => s.trim()).filter(Boolean)
  : ALL;

fs.mkdirSync(OUT, { recursive: true });

for (const theme of themeList) {
  for (const v of views) {
    const file = path.join(OUT, `${theme}-${v}.png`);
    fs.rmSync(file, { force: true });
    try {
      execFileSync(browser, [
        '--headless=new',
        '--disable-gpu',
        '--hide-scrollbars',
        '--no-first-run',
        '--no-default-browser-check',
        '--user-data-dir=' + path.join(OUT, '.edge-profile'),
        '--window-size=1440,1000',
        `--virtual-time-budget=4000`,
        `--screenshot=${file}`,
        `${BASE}/#/${v}?theme=${theme}`,
      ], { stdio: 'ignore', timeout: 60000 });
    } catch (e) {
      console.log(`  [失败] ${theme}-${v}: ${e.message.split('\n')[0]}`);
      continue;
    }
    if (fs.existsSync(file)) {
      console.log(`  已截图 ${theme}-${v}.png`);
    } else {
      console.log(`  [无输出] ${theme}-${v}`);
    }
  }
}
console.log(`\n截图目录：${OUT}`);
