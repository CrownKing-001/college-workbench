// 冒烟测试启动器：清掉 ELECTRON_RUN_AS_NODE，设置 UD_SMOKE，跑完透传退出码。
// 直接 `electron .` 在本机可能被 ELECTRON_RUN_AS_NODE 干扰，所以统一走这里。
const { spawn } = require('node:child_process');
const path = require('node:path');

const electron = require('electron');
const exe = typeof electron === 'string' ? electron : path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron.exe');
const root = path.join(__dirname, '..');

const env = { ...process.env, UD_SMOKE: '1' };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(exe, [root], { stdio: 'inherit', env });
child.on('exit', (code) => process.exit(code ?? 1));
