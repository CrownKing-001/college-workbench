// 暗色主题校验启动器
const { spawn } = require('node:child_process');
const path = require('node:path');

const electron = require('electron');
const exe = typeof electron === 'string' ? electron : path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron.exe');
const root = path.join(__dirname, '..');

const env = { ...process.env, UD_DARKCHECK: '1' };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(exe, [root], { stdio: 'inherit', env });
child.on('exit', (code) => process.exit(code ?? 1));
