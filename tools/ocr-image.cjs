// 用 Windows 自带 OCR（Windows.Media.Ocr）识别图片文字。
// 用法：node tools/ocr-image.cjs <图片路径> [语言，默认 zh-Hans-CN]
//
// 说明：这里借 PowerShell 调 WinRT，因为 Node 无法直接访问 WinRT API。
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const img = process.argv[2];
const lang = process.argv[3] || 'zh-Hans-CN';
// --scale N：先把图片放大 N 倍再识别。校历这种密集表格在 1080px 宽的照片上
// 识别率很低（会把「星期一」认成「期一」），放大到 2~3 倍后明显改善。
const scaleIdx = process.argv.indexOf('--scale');
const scale = scaleIdx >= 0 ? Number(process.argv[scaleIdx + 1]) || 1 : 1;

// PowerShell 脚本统一放在 electron/ 下（打包时要跟着一起进 asar），
// tools/ 里的脚本直接引用它们，避免两份拷贝各改各的。
const PS_DIR = path.join(__dirname, '..', 'electron');

if (!img) {
  console.error('用法：node tools/ocr-image.cjs <图片路径> [语言] [--scale 2]');
  process.exit(2);
}
const abs = path.resolve(img);
if (!fs.existsSync(abs)) {
  console.error('图片不存在：' + abs);
  process.exit(2);
}

// 需要放大时，先用 System.Drawing 生成一张预处理图
let target = abs;
if (scale > 1) {
  const outPng = path.join(os.tmpdir(), `dsh-ocr-upscaled-${scale}x.png`);
  execFileSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(PS_DIR, 'upscale-windows.ps1')],
    { encoding: 'utf8', env: { ...process.env, OCR_IMG: abs, OCR_OUT: outPng, OCR_SCALE: String(scale) }, stdio: 'pipe' }
  );
  target = outPng;
  console.log(`已放大 ${scale}x 后识别`);
}

const psFile = path.join(PS_DIR, 'ocr-windows.ps1');
if (!fs.existsSync(psFile)) {
  console.error('缺少 OCR 脚本：' + psFile);
  process.exit(2);
}

try {
  const out = execFileSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', psFile],
    {
      encoding: 'utf8',
      env: { ...process.env, OCR_IMG: target, OCR_LANG: lang },
      maxBuffer: 32 * 1024 * 1024,
    }
  );
  const lines = out
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => {
      // 格式：x,y,w,h,文本
      const m = l.match(/^(\d+),(\d+),(\d+),(\d+),(.*)$/);
      if (!m) return { x: 0, y: 0, w: 0, h: 0, text: l };
      return { x: +m[1], y: +m[2], w: +m[3], h: +m[4], text: m[5] };
    });
  console.log(`识别出 ${lines.length} 行（语言 ${lang}）\n`);
  for (const l of lines) {
    console.log(`y=${String(l.y).padStart(4)} x=${String(l.x).padStart(4)} w=${String(l.w).padStart(4)} | ${l.text}`);
  }
  const outJson = path.join(path.dirname(abs), path.basename(abs, path.extname(abs)) + '.ocr.json');
  fs.writeFileSync(outJson, JSON.stringify({ image: abs, lang, lines }, null, 2), 'utf8');
  console.log(`\n已保存：${outJson}`);
} catch (err) {
  console.error('OCR 失败：', err.message);
  if (err.stdout) console.error('stdout:', String(err.stdout).slice(0, 2000));
  if (err.stderr) console.error('stderr:', String(err.stderr).slice(0, 2000));
  process.exit(1);
}
