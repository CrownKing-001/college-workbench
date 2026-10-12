// 清除「网络下载标记」(Mark of the Web, MOTW)，避免 Windows SmartScreen
// 弹出蓝色的「Windows 已保护你的电脑」提示框。
//
// 背景：
//   electron-builder 的 portable 目标是「自解压 exe」——运行时把自己解压到
//   %TEMP% 的随机目录再启动。这个行为与恶意软件的释放器很像，加上程序没有
//   代码签名证书，Windows SmartScreen / Defender 很容易拦下来，弹出蓝色提示。
//   文件一旦带上 Zone.Identifier 流（从网页下载、从聊天工具接收、从别的机器
//   拷过来都可能带上），提示几乎必然出现。
//
// 这个脚本做两件事：
//   1. 递归清除 release/ 下所有文件的 MOTW（Unblock-File）；
//   2. 顺带报告是否仍有残留标记。
//
// 用法：
//   npm run unblock                 # 处理 release/ 目录
//   node tools/unblock.cjs <目录>    # 处理指定目录
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const target = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, 'release');

if (!fs.existsSync(target)) {
  console.error(`目录不存在：${target}`);
  console.error('先运行 npm run dist 或 npm run dist:green 生成产物。');
  process.exit(1);
}

// 递归收集文件
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const files = walk(target);
console.log(`目录：${target}`);
console.log(`待处理文件：${files.length} 个`);

// 用 PowerShell 的 Unblock-File 批量清除，比逐个 .NET 调用快得多。
// 路径用单引号包裹，并把单引号按 PowerShell 规则转义（'' 表示一个字面单引号）。
const psQuote = (s) => `'${String(s).replace(/'/g, "''")}'`;
const ps = `
$ErrorActionPreference = 'SilentlyContinue'
$files = Get-ChildItem -LiteralPath ${psQuote(target)} -Recurse -File
$n = 0
foreach ($f in $files) {
  if (Get-Item -LiteralPath $f.FullName -Stream Zone.Identifier -ErrorAction SilentlyContinue) {
    Unblock-File -LiteralPath $f.FullName
    $n++
  }
}
Write-Output "UNBLOCKED=$n"
`;

let unblocked = 0;
try {
  const out = execFileSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', ps],
    { encoding: 'utf8' }
  );
  const m = out.match(/UNBLOCKED=(\d+)/);
  unblocked = m ? Number(m[1]) : 0;
} catch (err) {
  console.error('清除失败：', err.message);
  process.exit(1);
}

// 复查
let remaining = 0;
try {
  const out = execFileSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command',
      `(Get-ChildItem -LiteralPath ${psQuote(target)} -Recurse -File | Where-Object { Get-Item -LiteralPath $_.FullName -Stream Zone.Identifier -ErrorAction SilentlyContinue }).Count`],
    { encoding: 'utf8' }
  );
  remaining = Number(out.trim()) || 0;
} catch { /* 忽略 */ }

console.log(`已清除标记：${unblocked} 个文件`);
console.log(`仍有标记：${remaining} 个文件`);
if (remaining === 0) {
  console.log('✅ SmartScreen 的「下载标记」已清除，再次打开应不再弹蓝色提示框。');
} else {
  console.log('⚠️ 仍有文件带标记，可能需要以管理员身份重跑，或手动右键 → 属性 → 解除锁定。');
}
