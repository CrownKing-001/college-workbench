// 逐页截图工具：把每个视图在深色 / 浅色两套主题下各截一张，用于人工检查 UI。
//
// 用法：
//   npm run shots              # 深色 + 浅色，全部视图
//   npm run shots -- dark      # 只截深色
//   npm run shots -- light diet health   # 只截浅色的指定视图
//
// 产物：.shots/<theme>-<view>.png
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const electron = require('electron');
const exe = typeof electron === 'string'
  ? electron
  : path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron.exe');
const root = path.join(__dirname, '..');

const args = process.argv.slice(2);
const themes = args.filter((a) => a === 'dark' || a === 'light');
const views = args.filter((a) => a !== 'dark' && a !== 'light');

const env = {
  ...process.env,
  UD_SHOTS: '1',
  UD_SHOTS_THEMES: JSON.stringify(themes.length ? themes : ['dark', 'light']),
  UD_SHOTS_VIEWS: JSON.stringify(views),
};
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(exe, [root], { stdio: 'inherit', env });
child.on('exit', (code) => process.exit(code ?? 1));
