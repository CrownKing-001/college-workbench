// 从旧网页（localhost:7100）读取 localStorage 里的全部 fitplan 数据。
// 用 Electron 自带的 Chromium 起一个真实浏览器上下文，与用户浏览器同源同存储语义。
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const OUT = process.argv[2] || path.join(__dirname, '旧数据导出.json');
const URL = process.env.OLD_URL || 'http://localhost:7100/';

async function main() {
  const win = new BrowserWindow({ show: false, width: 1280, height: 900 });

  await win.loadURL(URL);
  // 等 React 应用挂载、localStorage 写入完成
  await new Promise((r) => setTimeout(r, 4000));

  const KEYS = [
    'fitplan-run-logs',
    'fitplan-health-logs',
    'fitplan-diet-logs',
    'fitplan-train-done',
    'fitplan-diet-seed-ids',
    'fitplan-courses',
  ];

  const result = await win.webContents.executeJavaScript(`
    (() => {
      const KEYS = ${JSON.stringify(KEYS)};
      const out = {};
      const stats = [];
      for (const k of KEYS) {
        const raw = localStorage.getItem(k);
        let v = null;
        if (raw) { try { v = JSON.parse(raw); } catch { v = raw; } }
        out[k] = v === null ? [] : v;
        stats.push({ key: k, count: Array.isArray(v) ? v.length : (v ? 1 : 0), raw: raw ? raw.length : 0 });
      }
      // 顺便看看 localStorage 里所有键，防止漏掉
      const allKeys = Object.keys(localStorage);
      return { data: out, stats, allKeys };
    })()
  `, true);

  console.log('=== localStorage 全部键 ===');
  console.log(result.allKeys.join(', ') || '(空)');
  console.log('\n=== 各模块记录数 ===');
  let total = 0;
  for (const s of result.stats) {
    console.log(`  ${s.key.padEnd(26)} ${String(s.count).padStart(3)} 条   (${s.raw} 字节)`);
    total += s.count;
  }
  console.log(`  ${'合计'.padEnd(24)} ${String(total).padStart(3)} 条`);

  const payload = {
    __app: 'university-desk',
    __version: 1,
    __exportedAt: new Date().toISOString(),
    __source: `旧网页 ${URL}`,
    ...result.data,
  };

  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2), 'utf8');
  console.log('\n已写入: ' + OUT);

  // 打印内容摘要，便于人工核对
  console.log('\n=== 内容预览 ===');
  for (const k of KEYS) {
    const v = result.data[k];
    if (Array.isArray(v) && v.length) {
      console.log(`\n[${k}]`);
      v.slice(0, 30).forEach((x) => console.log('  ' + JSON.stringify(x)));
      if (v.length > 30) console.log(`  ... 还有 ${v.length - 30} 条`);
    }
  }

  app.exit(total > 0 ? 0 : 3);
}

app.whenReady().then(main).catch((e) => {
  console.error('提取失败:', e);
  app.exit(1);
});
