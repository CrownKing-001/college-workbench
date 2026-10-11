// 在桌面创建「工作台」快捷方式，指向打包好的便携版 exe。
// 用法：
//   node tools/make-shortcut.cjs                     # 自动找 release/ 下的便携版 exe
//   node tools/make-shortcut.cjs "D:\path\app.exe"   # 指定 exe
//   node tools/make-shortcut.cjs --name 我的工作台     # 自定义名称
//   node tools/make-shortcut.cjs --remove            # 删除快捷方式
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);

const nameIdx = args.indexOf('--name');
const SHORTCUT_NAME = nameIdx >= 0 && args[nameIdx + 1] ? args[nameIdx + 1] : '工作台';
const remove = args.includes('--remove');
const explicitExe = args.find((a) => !a.startsWith('--') && a.toLowerCase().endsWith('.exe'));

const desktop = path.join(os.homedir(), 'Desktop');
const lnkPath = path.join(desktop, `${SHORTCUT_NAME}.lnk`);

if (remove) {
  if (fs.existsSync(lnkPath)) {
    fs.unlinkSync(lnkPath);
    console.log(`已删除快捷方式：${lnkPath}`);
  } else {
    console.log('快捷方式不存在，无需删除');
  }
  process.exit(0);
}

// 找 exe：优先显式指定，其次 release/ 下的便携版
function findExe() {
  if (explicitExe) {
    const p = path.resolve(explicitExe);
    if (!fs.existsSync(p)) throw new Error(`指定的 exe 不存在：${p}`);
    return p;
  }
  const rel = path.join(root, 'release');
  if (!fs.existsSync(rel)) throw new Error('release 目录不存在，请先运行 npm run dist');

  const cands = fs
    .readdirSync(rel)
    .filter((f) => f.toLowerCase().endsWith('.exe'))
    .map((f) => path.join(rel, f))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  if (!cands.length) throw new Error('release 目录下没有找到 exe');
  return cands[0];
}

const exe = findExe();
const iconPath = path.join(root, 'electron', 'build', 'icon.ico');
const iconForShortcut = fs.existsSync(iconPath) ? `${iconPath},0` : `${exe},0`;

if (!fs.existsSync(desktop)) throw new Error(`桌面目录不存在：${desktop}`);

// 用 WScript.Shell 创建 .lnk —— 这是 Windows 上最稳的方式，能带图标与工作目录。
//
// 注意：路径不能用 JSON.stringify 塞进 PowerShell 字符串字面量 ——
// JSON 会把反斜杠转义成 `\\`，PowerShell 解析后就成了双反斜杠，
// 快捷方式的工作目录/图标路径随之失效。这里改用单引号包裹 +
// 把路径里的单引号按 PowerShell 规则转义（'' 表示一个字面单引号）。
const psQuote = (s) => `'${String(s).replace(/'/g, "''")}'`;

const ps = `
$ws = New-Object -ComObject WScript.Shell
$lnk = $ws.CreateShortcut(${psQuote(lnkPath)})
$lnk.TargetPath = ${psQuote(exe)}
$lnk.WorkingDirectory = ${psQuote(path.dirname(exe))}
$lnk.Description = ${psQuote('大学日程 · 桌面工作台')}
$lnk.IconLocation = ${psQuote(iconForShortcut)}
$lnk.WindowStyle = 1
$lnk.Save()
`;

try {
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], {
    stdio: 'inherit',
  });
} catch (err) {
  console.error('创建快捷方式失败：', err.message);
  process.exit(1);
}

if (!fs.existsSync(lnkPath)) {
  console.error('快捷方式似乎没有创建成功');
  process.exit(1);
}

console.log('✅ 桌面快捷方式已创建');
console.log(`   名称：${SHORTCUT_NAME}`);
console.log(`   位置：${lnkPath}`);
console.log(`   目标：${exe}`);
console.log(`   图标：${fs.existsSync(iconPath) ? iconPath : '(使用 exe 自带图标)'}`);
