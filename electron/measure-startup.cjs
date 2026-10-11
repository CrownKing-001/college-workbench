// 启动耗时测量：在真实 Electron 里加载应用，记录从开始加载到界面可用的时间。
// 用法：node electron/measure-startup.cjs
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const electron = require('electron');
const exe = typeof electron === 'string'
  ? electron
  : path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron.exe');
const root = path.join(__dirname, '..');

const out = path.join(root, '.startup.json');
fs.rmSync(out, { force: true });

const env = { ...process.env, UD_MEASURE: '1' };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(exe, [root], { stdio: 'inherit', env });
child.on('exit', (code) => {
  try {
    const r = JSON.parse(fs.readFileSync(out, 'utf8'));
    console.log('\n── 启动耗时 ──────────────────────');
    for (const [k, v] of Object.entries(r)) console.log(`${k.padEnd(28)} ${v}`);
  } catch {
    console.log('（没有拿到测量结果）');
  }
  process.exit(code ?? 1);
});
