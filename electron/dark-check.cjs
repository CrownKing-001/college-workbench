// 暗色主题校验：由 main.cjs 通过 UD_DARKCHECK=1 触发，
// 这样能复用主进程已注册的 IPC 处理器，应用才会真正挂载出内容。
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, '.smoke', 'dark-check.json');

async function runDarkCheck(app, BrowserWindow) {
  const win = new BrowserWindow({
    width: 1440, height: 900, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: false },
  });
  await win.loadFile(path.join(ROOT, 'dist', 'index.html'));
  await new Promise((r) => setTimeout(r, 3000));

  const run = (c) => win.webContents.executeJavaScript(c, true);

  // 相对亮度（WCAG）
  const lum = (hex) => {
    const m = hex.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (!m) return null;
    const [r, g, b] = [+m[1], +m[2], +m[3]].map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };

  const samples = await run(`(async () => {
    const pick = (sel, name) => {
      const el = document.querySelector(sel);
      if (!el) return { name, missing: true };
      const cs = getComputedStyle(el);
      return { name, bg: cs.backgroundColor, color: cs.color, border: cs.borderTopColor };
    };
    const base = [
      pick('body', 'body'),
      pick('aside', 'sidebar'),
      pick('header', 'header'),
      pick('main section', 'panel'),
      pick('main section h2', 'panel-title'),
      pick('aside nav button', 'nav-item'),
    ];
    // 输入框在「待办清单」页才有，先切过去再取
    const nav = Array.from(document.querySelectorAll('aside nav button'))
      .find(b => b.textContent.includes('待办清单'));
    if (nav) {
      nav.click();
      await new Promise(r => setTimeout(r, 600));
      base.push(pick('main input', 'input'));
      base.push(pick('main textarea, main input', 'input-alt'));
    }
    return base;
  })()`, true);

  // ── 全量扫描：逐个视图遍历所有可见元素，找出任何「亮底」漏网元素 ──
  // 只看 6 个采样点会漏掉个别用了浅色类的组件，这里把全部视图（含课表识别）过一遍。
  const scanAll = await run(`(async () => {
    const lum = (r, g, b) => {
      const f = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const parse = (c) => {
      const m = String(c).match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)(?:,\\s*([\\d.]+))?\\)/);
      if (!m) return null;
      const a = m[4] === undefined ? 1 : parseFloat(m[4]);
      return { r: +m[1], g: +m[2], b: +m[3], a };
    };

    const worst = [];   // 每个视图里最亮的实心背景
    const offenders = []; // 亮度超阈值的元素（真正的问题）
    const lowContrast = []; // 文字与背景对比度不足（读不清）

    // 求某个元素「实际看到」的背景色：自身背景若非透明就用它，
    // 否则向上找最近的不透明祖先（视觉上文字就是压在那上面的）。
    const effectiveBg = (el) => {
      let node = el;
      while (node && node !== document.documentElement) {
        const p = parse(getComputedStyle(node).backgroundColor);
        if (p && p.a >= 0.5) return p;
        node = node.parentElement;
      }
      const p = parse(getComputedStyle(document.body).backgroundColor);
      return p || { r: 18, g: 22, b: 29, a: 1 };
    };

    const views = Array.from(document.querySelectorAll('aside nav button'))
      .map(b => b.textContent.trim())
      .filter(Boolean);

    for (const label of views) {
      const btn = Array.from(document.querySelectorAll('aside nav button'))
        .find(b => b.textContent.trim() === label);
      if (!btn) continue;
      btn.click();
      await new Promise(r => setTimeout(r, 700));

      const main = document.querySelector('main');
      if (!main) continue;

      let brightest = { lum: -1, tag: '', cls: '', bg: '' };
      for (const el of main.querySelectorAll('*')) {
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        if (r.bottom < 0 || r.top > 4000) continue;
        const cs = getComputedStyle(el);
        const p = parse(cs.backgroundColor);
        if (!p || p.a < 0.5) continue;           // 全透明/几乎透明的跳过
        if (cs.visibility === 'hidden' || cs.display === 'none') continue;
        const L = lum(p.r, p.g, p.b);
        if (L > brightest.lum) {
          brightest = {
            lum: Math.round(L * 1000) / 1000,
            tag: el.tagName.toLowerCase(),
            cls: String(el.className).slice(0, 90),
            bg: cs.backgroundColor,
          };
        }
        // 亮底阈值：亮度 > 0.5 基本就是浅色块（深色主题下不该出现）。
        // 但进度条/状态点这类「品牌强调色」本来就该是亮的（例如 amber-400 进度条），
        // 它们面积很小、且是纯装饰，不算漏网的浅色块，所以按尺寸与语义排除。
        const area = r.width * r.height;
        const cls = String(el.className);
        const isAccent =
          area < 2400 ||
          /bg-(emerald|amber|rose|sky|indigo|orange|violet|red|green|blue)-(300|400|500)/.test(cls) ||
          /rounded-full|rounded-sm/.test(cls) && area < 6000;
        if (L > 0.5 && !isAccent) {
          offenders.push({
            view: label, tag: el.tagName.toLowerCase(),
            cls: cls.slice(0, 90),
            bg: cs.backgroundColor, lum: Math.round(L * 1000) / 1000,
            text: (el.textContent || '').trim().slice(0, 30),
          });
        }
      }

      // 文字对比度：只看直接含文本的叶子元素，避免父容器重复统计
      for (const el of main.querySelectorAll('*')) {
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) continue;
        if (r.bottom < 0 || r.top > 4000) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity < 0.3) continue;
        // 只取「自己的直接文本」
        const own = Array.from(el.childNodes)
          .filter((n) => n.nodeType === 3)
          .map((n) => n.textContent.trim())
          .join('');
        if (!own) continue;
        const fg = parse(cs.color);
        if (!fg || fg.a < 0.4) continue;
        const bg = effectiveBg(el);
        const lf = lum(fg.r, fg.g, fg.b);
        const lb = lum(bg.r, bg.g, bg.b);
        const hi = Math.max(lf, lb), lo = Math.min(lf, lb);
        const contrast = (hi + 0.05) / (lo + 0.05);
        // 大字号（>=18.66px 粗体 或 >=24px）放宽到 3.0，其余按 WCAG AA 4.5
        const size = parseFloat(cs.fontSize) || 14;
        const bold = (+cs.fontWeight || 400) >= 700;
        const need = size >= 24 || (bold && size >= 18.66) ? 3.0 : 4.5;
        if (contrast < need) {
          lowContrast.push({
            view: label, text: own.slice(0, 24), color: cs.color,
            bg: 'rgb(' + bg.r + ', ' + bg.g + ', ' + bg.b + ')',
            contrast: Math.round(contrast * 100) / 100, need,
            size: Math.round(size * 10) / 10,
          });
        }
      }
      worst.push({ view: label, ...brightest });
    }
    return { worst, offenders, lowContrast };
  })()`, true);

  const report = { samples: [], verdicts: [] };

  report.scan = scanAll;

  for (const s of samples) {
    if (s.missing) {
      report.samples.push({ ...s, note: '未找到元素' });
      continue;
    }
    const bgL = lum(s.bg);
    const fgL = lum(s.color);
    let contrast = null;
    if (bgL !== null && fgL !== null) {
      const hi = Math.max(bgL, fgL), lo = Math.min(bgL, fgL);
      contrast = Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
    }
    report.samples.push({
      name: s.name, bg: s.bg, color: s.color,
      bgLum: bgL === null ? null : Math.round(bgL * 1000) / 1000,
      contrast,
    });
  }

  // 判定
  const body = report.samples.find((s) => s.name === 'body');
  const panel = report.samples.find((s) => s.name === 'panel');
  const sidebar = report.samples.find((s) => s.name === 'sidebar');
  const title = report.samples.find((s) => s.name === 'panel-title');
  const input = report.samples.find((s) => s.name === 'input');

  const V = (ok, text) => { report.verdicts.push({ ok, text }); console.log(`${ok ? 'PASS' : 'FAIL'} | ${text}`); };

  V(body && body.bgLum !== null && body.bgLum < 0.05, `页面底色为深色 (亮度 ${body && body.bgLum})`);
  V(panel && panel.bgLum !== null && panel.bgLum < 0.08, `卡片为深色 (亮度 ${panel && panel.bgLum})`);
  V(sidebar && sidebar.bgLum !== null && sidebar.bgLum < body.bgLum, `侧边栏比主区更深，层次分明`);
  V(title && title.contrast >= 4.5, `卡片标题对比度 ${title && title.contrast}:1 (需 ≥4.5)`);
  V(body && body.contrast >= 4.5, `正文对比度 ${body && body.contrast}:1 (需 ≥4.5)`);
  V(input && input.bgLum !== null && input.bgLum < 0.06, `输入框为深色 (亮度 ${input && input.bgLum})`);

  // ── 全量扫描判定 ──
  const scan = report.scan || { worst: [], offenders: [] };
  const low = scan.lowContrast || [];
  if (low.length) {
    console.log('\n对比度不足的文字：');
    for (const l of low.slice(0, 12)) {
      console.log(`  [${l.view}] "${l.text}" ${l.color} on ${l.bg} = ${l.contrast}:1 (需 ${l.need})`);
    }
  }
  V(
    low.length === 0,
    low.length
      ? `${low.length} 处文字对比度不足：${low.slice(0, 3).map((l) => `[${l.view}]"${l.text}" ${l.contrast}:1`).join('、')}`
      : '全部视图文字对比度达标（WCAG AA）'
  );

  // 截图存档：窗口必须真正显示出来，否则离屏表面抓成黑图
  try {
    win.show();
    win.focus();
    await new Promise((r) => setTimeout(r, 1200));
    const img = await win.webContents.capturePage();
    fs.mkdirSync(path.join(ROOT, '.smoke'), { recursive: true });
    fs.writeFileSync(path.join(ROOT, '.smoke', 'dark-app.png'), img.toPNG());
    console.log('已保存截图 .smoke/dark-app.png');
  } catch (e) { console.log('截图失败:', e.message); }

  fs.writeFileSync(OUT, JSON.stringify(report, null, 2), 'utf8');
  const failed = report.verdicts.filter((v) => !v.ok).length;
  console.log(`\n=== 暗色校验 ${report.verdicts.length - failed}/${report.verdicts.length} 通过 ===`);
  return failed === 0 ? 0 : 1;
}

module.exports = { runDarkCheck };
