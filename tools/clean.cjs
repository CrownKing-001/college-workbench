// 瘦身：删掉所有「可再生」的产物与缓存，只保留源码和交付物。
//
// 用法：
//   node tools/clean.cjs              # 保守：清缓存 + 构建中间产物，保留 exe/zip
//   node tools/clean.cjs --all        # 连 release/ 交付物一起删
//   node tools/clean.cjs --temp       # 顺带清理 %TEMP% 里遗留的便携版解压目录
//   node tools/clean.cjs --dry        # 只报告会删什么，不真删
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const ALL = args.includes('--all');
const TEMP = args.includes('--temp');
const DRY = args.includes('--dry');

let freed = 0;

function sizeOf(p) {
  try {
    const st = fs.statSync(p);
    if (!st.isDirectory()) return st.size;
    let sum = 0;
    for (const e of fs.readdirSync(p, { withFileTypes: true })) {
      sum += sizeOf(path.join(p, e.name));
    }
    return sum;
  } catch {
    return 0;
  }
}

function report(label, p, bytes) {
  const mb = bytes / 1048576;
  console.log(`  ${DRY ? '会删' : '已删'} ${label.padEnd(34)} ${mb.toFixed(1).padStart(8)} MB`);
}

function remove(label, p, { keep = null } = {}) {
  if (!fs.existsSync(p)) return;
  // keep: 目录里要保留的文件名（用来区分「交付物」与「中间产物」）
  if (keep) {
    for (const e of fs.readdirSync(p, { withFileTypes: true })) {
      if (keep.includes(e.name)) continue;
      const full = path.join(p, e.name);
      const bytes = sizeOf(full);
      if (bytes === 0 && !fs.statSync(full).isDirectory()) continue;
      report(`${label}/${e.name}`, full, bytes);
      if (!DRY) fs.rmSync(full, { recursive: true, force: true });
      freed += bytes;
    }
    return;
  }
  const bytes = sizeOf(p);
  report(label, p, bytes);
  if (!DRY) fs.rmSync(p, { recursive: true, force: true });
  freed += bytes;
}

console.log(`仓库：${root}`);
console.log(DRY ? '（dry-run，不会真的删）\n' : '');

console.log('· 缓存类');
remove('截图与浏览器 profile', path.join(root, '.shots'));
remove('打包用的 pnpm 转发脚本', path.join(root, '.tools-bin'));
remove('lint 输出', path.join(root, 'lint.json'));
remove('构建产物 dist', path.join(root, 'dist'));

console.log('\n· release/');
if (ALL) {
  remove('release（全部）', path.join(root, 'release'));
} else {
  // 只删中间产物，保留 .exe / .zip 交付物
  remove('release 中间产物', path.join(root, 'release'), {
    keep: fs.existsSync(path.join(root, 'release'))
      ? fs.readdirSync(path.join(root, 'release')).filter((f) => /\.(exe|zip)$/i.test(f))
      : [],
  });
}

if (TEMP) {
  console.log('\n· %TEMP% 里遗留的便携版解压目录');
  // 正在运行的实例绝对不能删：它就是从这些目录里跑起来的
  const inUse = new Set();
  try {
    const { execFileSync } = require('node:child_process');
    const out = execFileSync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      'Get-Process | Where-Object { $_.Path } | ForEach-Object { Split-Path $_.Path -Parent } | Sort-Object -Unique',
    ], { encoding: 'utf8' });
    for (const line of out.split(/\r?\n/)) if (line.trim()) inUse.add(line.trim().toLowerCase());
  } catch { /* 拿不到就一律跳过，安全优先 */ }

  for (const e of fs.readdirSync(os.tmpdir(), { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const full = path.join(os.tmpdir(), e.name);
    // 便携版解压目录的特征：里面有主程序 exe
    let looksLikeExtraction = false;
    try {
      looksLikeExtraction = fs.readdirSync(full).some((f) => f.endsWith('.exe') && f.includes('大学日程'));
    } catch { /* ignore */ }
    if (!looksLikeExtraction) continue;

    if (inUse.has(full.toLowerCase())) {
      console.log(`  跳过（正在运行）${e.name}`);
      continue;
    }
    const bytes = sizeOf(full);
    report(e.name, full, bytes);
    if (!DRY) fs.rmSync(full, { recursive: true, force: true });
    freed += bytes;
  }
}

console.log(`\n${DRY ? '预计可释放' : '共释放'} ${(freed / 1048576).toFixed(1)} MB`);
if (!DRY && !ALL) {
  console.log('提示：exe / zip 交付物保留了。需要重新生成解包目录：npm run dist:dir');
}
