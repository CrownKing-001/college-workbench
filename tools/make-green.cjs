// 生成「绿色免安装版」：把 electron-builder 解包后的 win-unpacked 目录
// 直接打包成一个 zip，用户解压后双击 exe 就能跑。
//
// 为什么要有这个（和 dist 的便携版区别）：
//   · portable 自解压 exe：每次启动都把自己释放到 %TEMP%\<随机目录> 再运行。
//     这个行为和释放器木马高度相似，且程序没有代码签名 —— Windows SmartScreen /
//     Defender 很容易弹蓝色的「Windows 已保护你的电脑」，每次启动还慢。
//   · 绿色免安装版：exe 直接运行，不做任何自解压，不写临时目录。
//     AV 误报率与启动开销都显著更低，也更符合「拷到 U 盘就走」的用法。
//
// 用法：
//   npm run dist:green          # 构建 + 解包 + 打 zip
//   node tools/make-green.cjs --no-build   # 复用已有产物，只打包
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const skipBuild = process.argv.includes('--no-build');

const releaseDir = path.join(root, 'release');
const unpackedDir = path.join(releaseDir, 'win-unpacked');
const outName = `${pkg.build?.productName || pkg.name}-桌面工作台-${pkg.version}-免安装版`;
const outDir = path.join(releaseDir, outName);

/**
 * 跑一条外部命令。
 * 不用 shell:true —— 那样参数只是拼接，Node 会报 DEP0190 安全告警。
 * 代价是 Windows 上要显式写 .cmd 后缀，所以这里统一补上。
 */
function run(cmd, args) {
  const exe = process.platform === 'win32' && !cmd.includes('.') ? `${cmd}.cmd` : cmd;
  console.log(`\n> ${exe} ${args.join(' ')}`);
  execFileSync(exe, args, { cwd: root, stdio: 'inherit' });
}

// ① 构建 + 解包（--dir 只产出 win-unpacked，不做自解压 exe）
//    走 tools/eb.cjs 而不是直接调 electron-builder：它会按需补一个 pnpm 转发，
//    避免机器上没装 pnpm 时打包报「No JSON content found in output」。
if (!skipBuild) {
  run('npm', ['run', 'build']);
  run('node', ['tools/eb.cjs', '--win', '--dir']);
}

if (!fs.existsSync(unpackedDir)) {
  console.error(`找不到解包目录：${unpackedDir}`);
  console.error('先运行 npm run dist:green，或 npx electron-builder --win --dir');
  process.exit(1);
}

// ② 复制到带版本号的目录，避免用户看到一堆内部文件不知道点哪个
fs.rmSync(outDir, { recursive: true, force: true });
fs.cpSync(unpackedDir, outDir, { recursive: true });

// ②b 签名：默认**跳过**。
//     原因：自签名证书只装在「当前用户」的受信任存储里，而 SmartScreen 的校验
//     跑在系统服务上下文，看不到这个证书 —— 结果它看到的是「一个无法验证的签名」，
//     比完全不签名更容易被拦。要签名请显式用 npm run dist:signed / npm run sign。
if (process.env.UD_SIGN === '1') {
  try {
    run('powershell.exe', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass',
      '-File', path.join('tools', 'codesign.ps1'), '-Sign',
    ]);
  } catch {
    console.warn('\n[green] 签名步骤失败或尚未准备证书，继续打包（exe 将不带签名）。');
  }
} else {
  console.log('\n[green] 跳过签名（默认不签）。需要签名：设置 UD_SIGN=1 或运行 npm run sign。');
}

// ③ 放一份使用说明在最外层
const exeName = `${pkg.build?.productName || pkg.name}.exe`;
fs.writeFileSync(
  path.join(outDir, '使用说明.txt'),
  [
    '大学日程 · 桌面工作台（免安装版）',
    '',
    `直接双击 ${exeName} 即可运行，无需安装。`,
    '',
    '关于数据：',
    '  · 所有数据保存在本目录的 data/ 文件夹里（JSON 文件 + 照片），',
    '    整个文件夹拷到 U 盘或另一台电脑就能带着走。',
    '  · 想备份，直接复制 data/ 文件夹即可。',
    '',
    '如果 Windows 弹出蓝色提示框：',
    '  · 这是 SmartScreen 对「没有数字签名的程序」的例行提醒，不是病毒。',
    '  · 点「更多信息」→「仍要运行」即可。',
    '  · 或在文件上右键 → 属性 → 勾选「解除锁定」→ 确定，之后就不会再提示。',
    '  · 也可以运行 npm run unblock 批量清除下载标记。',
    '',
  ].join('\r\n'),
  'utf8'
);

// ④ 打 zip（用 PowerShell 的 Compress-Archive，Windows 自带，不引入额外依赖）
const zipPath = path.join(releaseDir, `${outName}.zip`);
fs.rmSync(zipPath, { force: true });
const psQuote = (s) => `'${String(s).replace(/'/g, "''")}'`;
run('powershell.exe', [
  '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command',
  `Compress-Archive -LiteralPath ${psQuote(outDir)} -DestinationPath ${psQuote(zipPath)} -CompressionLevel Optimal -Force`,
]);

const mb = (p) => `${(fs.statSync(p).size / 1048576).toFixed(1)} MB`;
console.log('\n✅ 免安装版已生成');
console.log(`   目录：${outDir}`);
console.log(`   压缩包：${zipPath}（${mb(zipPath)}）`);
console.log(`   入口：${path.join(outDir, exeName)}`);
console.log('\n提示：免安装版不做自解压，SmartScreen 误报率明显低于便携版 exe。');
