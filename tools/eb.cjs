// electron-builder 启动器：解决「项目用 pnpm-lock.yaml，但机器上没装 pnpm」导致打包失败的问题。
//
// 背景：
//   electron-builder 看到 pnpm-lock.yaml 就会走 PnpmNodeModulesCollector，
//   内部执行 `pnpm list --json` 收集依赖树。如果 PATH 里没有 pnpm，
//   这条命令直接失败，报一个很难懂的：
//       ⨯ No JSON content found in output
//   （它只是在解析空输出，看起来像 JSON 解析问题，实际根因是 pnpm 不存在。）
//
// 做法：
//   在项目下的 .tools-bin/ 里生成一个极薄的 pnpm 转发脚本（转发给 corepack pnpm），
//   只在启动 electron-builder 时把该目录加进 PATH —— 不改系统环境、不需要管理员权限。
//   Node 自带 corepack，可以按需下载并缓存 pnpm。
//
// 用法：
//   node tools/eb.cjs --win --dir
//   node tools/eb.cjs --win portable --x64
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const shimDir = path.join(root, '.tools-bin');

/** 本机是否已经有可用的 pnpm（PATH 上能找到）。
 *  不用 shell:true —— 那样有参数拼接的安全告警（DEP0190），
 *  Windows 上直接找 pnpm.cmd 更准确。 */
function hasRealPnpm() {
  const names = process.platform === 'win32' ? ['pnpm.cmd', 'pnpm.exe'] : ['pnpm'];
  for (const name of names) {
    try {
      execFileSync(name, ['--version'], { stdio: 'ignore' });
      return true;
    } catch {
      /* 试下一个 */
    }
  }
  return false;
}

/** 生成 pnpm 转发脚本。corepack 是 Node 自带的，不需要额外安装。 */
function ensureShim() {
  fs.mkdirSync(shimDir, { recursive: true });

  // Windows：批处理 shim
  fs.writeFileSync(
    path.join(shimDir, 'pnpm.cmd'),
    '@echo off\r\ncorepack pnpm %*\r\n',
    'utf8'
  );
  // POSIX：shell shim（git-bash / CI）
  const sh = path.join(shimDir, 'pnpm');
  fs.writeFileSync(sh, '#!/bin/sh\nexec corepack pnpm "$@"\n', 'utf8');
  try { fs.chmodSync(sh, 0o755); } catch { /* Windows 上无所谓 */ }

  return shimDir;
}

/**
 * 把目录加进 PATH。
 *
 * 注意：Windows 上这个变量的键名通常是 `Path` 而不是 `PATH`。
 * 如果直接写 env.PATH，会在环境块里多出一个同名不同大小写的键，
 * 原来的 Path 被覆盖掉 —— 结果是子进程 PATH 只剩 shim 目录，
 * 连 npx / node 都找不到。所以必须按实际键名大小写去改。
 */
function prependPath(env, dir) {
  const key = Object.keys(env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH';
  // 清掉其他大小写变体，避免出现重复键
  for (const k of Object.keys(env)) {
    if (k !== key && k.toUpperCase() === 'PATH') delete env[k];
  }
  const current = env[key] ?? '';
  env[key] = current ? `${dir}${path.delimiter}${current}` : dir;
}

const args = process.argv.slice(2);
if (!args.length) {
  console.error('用法：node tools/eb.cjs <electron-builder 参数…>');
  console.error('  例：node tools/eb.cjs --win --dir');
  process.exit(2);
}

// 直接用 node 跑 electron-builder 的入口，绕开 npx / shell：
// 少一层解析，PATH 出问题时也不会再冒出「npx 不是内部或外部命令」这种误导性报错。
const ebCli = path.join(root, 'node_modules', 'electron-builder', 'cli.js');
if (!fs.existsSync(ebCli)) {
  console.error(`找不到 electron-builder：${ebCli}`);
  console.error('先安装依赖（pnpm install / npm install）。');
  process.exit(2);
}

const env = { ...process.env };

if (!hasRealPnpm()) {
  const dir = ensureShim();
  prependPath(env, dir);
  console.log('[eb] 未检测到系统 pnpm，已启用项目内 corepack 转发（.tools-bin/）');
} else {
  console.log('[eb] 使用系统已安装的 pnpm');
}

// 走公司/校园代理或用了镜像源时，Node 自带的 CA 包可能验不过证书链，
// 报「unable to verify the first certificate」。让 Node 改用系统证书库即可。
// （Node 22.15+ / 23+ 支持；老版本没有这个开关就跳过。）
const nodeArgs = [];
if (process.allowedNodeEnvironmentFlags.has('--use-system-ca')) {
  nodeArgs.push('--use-system-ca');
} else {
  // 老 Node 的兜底：关掉严格校验，否则镜像源完全下不动
  env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  console.log('[eb] 当前 Node 不支持 --use-system-ca，已临时放宽 TLS 校验以下载镜像资源');
}

try {
  execFileSync(process.execPath, [...nodeArgs, ebCli, ...args], {
    cwd: root,
    stdio: 'inherit',
    env,
  });
} catch (err) {
  console.error('\n[eb] electron-builder 失败：', err.message);
  process.exit(err.status ?? 1);
}
