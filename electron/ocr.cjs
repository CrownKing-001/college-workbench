// 校历 / 图片文字识别 —— 用 Windows 自带的 Windows.Media.Ocr。
//
// 为什么不用第三方 OCR：
//   · Windows 10/11 自带 OCR 引擎，中文（zh-Hans-CN）识别器通常已随系统安装，
//     不联网、不装依赖、不上传照片，隐私和便携性都更好。
//   · 校历是「密集小字表格」，直接识别 1080px 的照片错误率很高
//     （实测会把「星期一」认成「期一」、「注册」认成「缴、注册」），
//     所以这里先把图片放大 3 倍并做灰度对比度拉伸，再交给 OCR，准确率明显提升。
//
// 实现方式：Node 无法直接调用 WinRT API，所以借 PowerShell 中转。
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const LANG = 'zh-Hans-CN';

// ── PowerShell 脚本的落盘 ─────────────────────────────────
// 打包成便携版后，main.cjs 跑在 app.asar 里，而 PowerShell.exe 读不了 asar 虚拟文件系统。
// 所以这里把 .ps1 用 Node 读出来（Node 能透明读 asar），写到临时目录再交给 PowerShell。
let _psOcr = null;
let _psUpscale = null;

function psFile(name) {
  const src = path.join(__dirname, name);
  const temp = path.join(os.tmpdir(), `ud-${process.pid}-${name}`);
  // 每次都重写，保证内容是当前版本（便携版升级后旧临时文件不会残留旧逻辑）
  fs.writeFileSync(temp, fs.readFileSync(src, 'utf8'), 'utf8');
  return temp;
}
const PS_OCR = () => (_psOcr ?? (_psOcr = psFile('ocr-windows.ps1')));
const PS_UPSCALE = () => (_psUpscale ?? (_psUpscale = psFile('upscale-windows.ps1')));

/** 用 System.Drawing 把图片放大 + 灰度对比度拉伸，返回临时 png 路径 */
function preprocess(src, scale) {
  const out = path.join(os.tmpdir(), `calendar-ocr-${scale}x-${process.pid}.png`);
  execFileSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', PS_UPSCALE()],
    {
      env: { ...process.env, OCR_IMG: src, OCR_OUT: out, OCR_SCALE: String(scale) },
      stdio: 'pipe',
      windowsHide: true,
    }
  );
  return out;
}

/** 对单张图跑 OCR，返回带包围盒的行；mode='words' 时返回词级包围盒 */
function recognize(imagePath, mode) {
  const out = execFileSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', PS_OCR()],
    {
      env: { ...process.env, OCR_IMG: imagePath, OCR_LANG: LANG, ...(mode ? { OCR_MODE: mode } : {}) },
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      windowsHide: true,
    }
  );
  return out
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => {
      const m = l.match(/^(\d+),(\d+),(\d+),(\d+),(.*)$/);
      if (!m) return null;
      return { x: +m[1], y: +m[2], w: +m[3], h: +m[4], text: m[5].trim() };
    })
    .filter(Boolean);
}

/** 把 OCR 出来的文本归一化：去掉中文字之间被误插的空格、统一标点 */
function normalize(text) {
  return text
    .replace(/([\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])/g, '$1')
    .replace(/\s+/g, ' ')
    .replace(/[｛〔【]/g, '（')
    .replace(/[｝〕】]/g, '）')
    .replace(/[．。]/g, '。')
    .trim();
}

// ── 从识别文本里抽取「日期 + 事件」 ───────────────────────
// 校历的说明区是自然语言，用规则抽取：找出「月 日」并带上前后文作为事件名。
//
// OCR 对某些字会稳定认错（实测：「清」→「消/淞」、「元旦」→「元目」、
// 「注册」→「注岫」、「军训」→「军调」），所以每个关键词都带上常见误识变体，
// 否则一条规则漏了，对应日期就整条丢失。
const EVENT_RULES = [
  { re: /(缴费|缴、|注册|注岫)/, title: '缴费注册', category: '教务', emoji: '📝' },
  { re: /(正式上课|正试上课)/, title: '正式上课', category: '教务', emoji: '🎓' },
  { re: /(报到|拫到)/, title: '新生报到', category: '教务', emoji: '🧳' },
  { re: /(入学教育|军训|军调)/, title: '入学教育·军训', category: '教务', emoji: '🥾' },
  { re: /(缓补考|缓朴考)/, title: '缓补考', category: '考试', emoji: '📄' },
  { re: /(期末考试|期未考试|期末考式)/, title: '期末考试周', category: '考试', emoji: '📚' },
  { re: /(校运动会|校运动)/, title: '校运动会', category: '活动', emoji: '🏅' },
  { re: /(校园主题|校园.*活动日)/, title: '校园主题活动日', category: '活动', emoji: '🎪' },
  { re: /(寒假)/, title: '寒假', category: '假期', emoji: '❄️' },
  { re: /(暑期|暑假)/, title: '暑期学期', category: '假期', emoji: '☀️' },
  { re: /(中秋节|中秋)/, title: '中秋节', category: '假期', emoji: '🥮' },
  { re: /(国庆节|国庆)/, title: '国庆节', category: '假期', emoji: '🇨🇳' },
  { re: /(元旦|元目|元且)/, title: '元旦', category: '假期', emoji: '🎊' },
  { re: /(清明节|消明节|淞明节)/, title: '清明节', category: '假期', emoji: '🌱' },
  { re: /(劳动节|劳功节)/, title: '劳动节', category: '假期', emoji: '💪' },
  { re: /(端午节|端牛节)/, title: '端午节', category: '假期', emoji: '🍡' },
  { re: /(妇女节|妇文节)/, title: '妇女节', category: '假期', emoji: '🌷' },
  { re: /(教学周)/, title: '教学周开始', category: '教务', emoji: '📖' },
];

/**
 * 从 OCR 行里抽取候选事件。
 * 返回 [{ title, date, category, emoji, raw, confidence }]
 *
 * 关键难点（都在真实校历上踩过）：
 *  1. 一句话里常列多个事件：「中秋节9月25日，国庆节10月1日，元旦1月1日」——
 *     必须按标点切开，让每个事件只取离它最近的日期，否则三条都会记成 9月25日。
 *  2. 学年是跨年的：9~12 月属于起始年，1~7 月属于次年，
 *     不能拿表格里的「2027年」当所有条目的基准。
 */
function extractEvents(lines) {
  const found = [];
  const seen = new Set();

  // 基准学年怎么定：
  // 校历标题里的「2026-2027 学年」常是艺术字，OCR 认不出来（实测只剩「年 月」），
  // 所以不能靠找最小年份。可靠的办法是利用说明区的跨年表述：
  //   「9月14日至2027年1月1日为教学周」→ 9 月配 2027 年 1 月，说明学年起于 2026。
  // 即：同一句里出现「M月…(20YY)年…月」且 M >= 8 > 后面的月，则 baseYear = YY - 1。
  const now = new Date();
  let baseYear = null;

  for (const l of lines) {
    const t = normalize(l.text);
    // 「…9月14日至2027年1月1日…」：年份后面紧跟的月份若 <= 7，
    // 而句子里更早出现过 >= 8 的月份，则学年起于 (年 - 1)。
    const ym = t.match(/(20\d{2})\s*年\s*(\d{1,2})\s*月/);
    if (ym) {
      const y2 = +ym[1];
      const m2 = +ym[2];
      if (m2 <= 7) {
        // 看这个年份之前是否出现过 8~12 月
        const before = t.slice(0, t.indexOf(ym[0]));
        const ms = [...before.matchAll(/(\d{1,2})\s*月/g)].map((x) => +x[1]);
        if (ms.some((m) => m >= 8)) {
          baseYear = y2 - 1;
          break;
        }
      }
    }
  }

  // 退路一：说明区里最早的年份；退路二：按当前月份猜学年
  if (baseYear === null) {
    const years = lines
      .map((l) => normalize(l.text).match(/(20\d{2})\s*年/))
      .filter(Boolean)
      .map((m) => +m[1]);
    if (years.length) {
      const minY = Math.min(...years);
      // 说明区若已出现「当年 1 月」这类，最小年份可能就是学年次年
      baseYear = minY;
    }
  }
  if (baseYear === null) {
    baseYear = now.getMonth() + 1 >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  }

  // 事件规则按「匹配串长度」排序，长词优先，避免「国庆节」被「节」类规则抢走
  const rules = [...EVENT_RULES].sort((a, b) => b.re.source.length - a.re.source.length);

  for (const line of lines) {
    const text = normalize(line.text);
    if (text.length < 3) continue;

    // 按标点/分号切成小句，每句单独找「事件 + 日期」。
    // 「、」不切：「10月27日全天、28日上午校运动会」里的「、」连接的是
    // 同一个事件的日期区间，切开会让事件名只剩后半句、丢掉真正的起始日。
    // 但 OCR 常把「，」认成「·」，所以「·」要切。
    const clauses = text.split(/[，,。；;·]/).map((s) => s.trim()).filter(Boolean);

    // 小句里若没有日期，可能是「（星期一）正式上课」这种跨行续写，
    // 记下上一次出现的日期，供下一句继承。
    let carryDate = null;

    for (const clause of clauses) {
      // 该句里所有「X月Y日」/「Y日」
      const dateMatches = [];
      const re = /(?:(\d{1,2})\s*月\s*)?(\d{1,2})\s*日/g;
      let m;
      while ((m = re.exec(clause))) {
        dateMatches.push({ month: m[1] ? +m[1] : null, day: +m[2], index: m.index });
      }

      for (const rule of rules) {
        const hit = clause.match(rule.re);
        if (!hit) continue;

        // 日期选取：中文校历的惯例是「日期在前、事件名在后」，
        // 且区间的**起始日**才是要记的那天：
        //   「9月7日至9月11日安排缓补考」   → 9月7日
        //   「2月22日至6月11日为教学周」    → 2月22日
        //   「9月5日至9月18日参加军训」     → 9月5日
        // 例外是「事件名在前、日期紧跟其后」：
        //   「中秋节9月25日」「正式上课9月14日」
        // 所以：先看事件名**后面**是否紧跟着日期（间隔很短），是就用它；
        // 否则用整句的第一个日期。
        const at = clause.indexOf(hit[0]);
        const after = dateMatches.find((d) => d.index >= at + hit[0].length);
        const before = dateMatches.find((d) => d.index < at);

        let pick;
        if (after && before) {
          // 事件名夹在两个日期之间：谁离得近用谁
          const gapAfter = after.index - (at + hit[0].length);
          const gapBefore = at - before.index;
          pick = gapAfter <= gapBefore + 2 ? after : before;
        } else if (after) {
          pick = after;
        } else if (before) {
          // 事件名在后面 → 用整句第一个日期（区间起始）
          pick = dateMatches[0];
        }

        let month = pick ? pick.month : null;
        let day = pick ? pick.day : null;
        let carry = false;

        if (month === null && pick && pick.day) {
          // 只写了「N日」，从本句或上一句的「X月」补
          const mm = clause.slice(0, pick.index).match(/(\d{1,2})\s*月/) || text.match(/(\d{1,2})\s*月/);
          if (mm) month = +mm[1];
        }
        if (month === null && !pick && carryDate) {
          month = carryDate.month;
          day = carryDate.day;
          carry = true;
        }
        if (month === null || !day) continue;

        // 年份：句子里明确写了年份就用它；否则按跨学年规则推
        // （8~12 月属于学年起始年，1~7 月属于次年）
        let year;
        const explicit = text.match(/(20\d{2})\s*年/);
        if (explicit && clause.includes(explicit[0])) year = +explicit[1];
        else year = month >= 8 ? baseYear : baseYear + 1;

        // 学年范围过滤：这张校历只覆盖「baseYear 年 8 月 ~ baseYear+1 年 7 月」。
        // 表格里还会出现下一学年（如 2027 年 9 月）的行，那些不属于本学年，丢掉。
        const ymd = year * 10000 + month * 100 + day;
        const startBound = baseYear * 10000 + 800;
        const endBound = (baseYear + 1) * 10000 + 731;
        if (ymd < startBound || ymd > endBound) continue;

        const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const key = `${rule.title}|${date}`;
        if (seen.has(key)) continue;
        seen.add(key);

        found.push({
          title: rule.title,
          date,
          category: rule.category,
          emoji: rule.emoji,
          raw: clause,
          confidence: carry ? 'low' : pick?.month ? 'high' : 'medium',
        });

        carryDate = { month, day };
      }

      // 本句找到了日期就更新 carry，供下一句继承
      if (dateMatches.length && dateMatches[0].month) {
        carryDate = { month: dateMatches[0].month, day: dateMatches[0].day };
      }
    }
  }

  // 同一事件名在不同学期会重复出现（秋季的「正式上课」和春季的「正式上课」都有效），
  // 所以不能按事件名去重，只能去掉「同一天同一事件」的完全重复。
  // 但「新生报到」这类会在同一天出现多条（本科/研究生分别报到），保留一条即可。
  const uniq = new Map();
  for (const e of found.sort((a, b) => a.date.localeCompare(b.date))) {
    const key = `${e.title}|${e.date}`;
    if (!uniq.has(key)) uniq.set(key, e);
  }
  return [...uniq.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * 只做「放大 → OCR」，返回原始包围盒（行级或词级），不抽校历事件。
 * 课表网格重建需要词级坐标（相邻格子常被 OCR 连成一行），所以单独暴露这一层。
 */
function runOcrRaw(imagePath, opts = {}) {
  const scale = opts.scale || 3;
  const mode = opts.mode;
  let workPath = imagePath;
  let preprocessed = null;
  try {
    if (scale > 1) {
      preprocessed = preprocess(imagePath, scale);
      workPath = preprocessed;
    }
  } catch (err) {
    // 放大失败就退回原图，至少还能识别一部分
    console.error('[ocr] 预处理失败，改用原图:', err.message);
    workPath = imagePath;
  }

  try {
    const raw = recognize(workPath, mode);
    // 放大后坐标要还原回原图比例，方便前端在图上画框
    const lines = raw.map((l) => ({
      ...l,
      x: Math.round(l.x / scale),
      y: Math.round(l.y / scale),
      w: Math.round(l.w / scale),
      h: Math.round(l.h / scale),
    }));
    return { ok: true, scale, lines, engine: 'Windows.Media.Ocr' };
  } finally {
    if (preprocessed && preprocessed !== imagePath) {
      try {
        fs.unlinkSync(preprocessed);
      } catch {
        /* 临时文件删不掉不影响结果 */
      }
    }
  }
}

/** 完整流程：放大 → OCR → 归一化 → 抽事件 */
function runOcr(imagePath, opts = {}) {
  const res = runOcrRaw(imagePath, opts);
  if (!res.ok) return res;
  const events = extractEvents(res.lines);
  return { ...res, events };
}

module.exports = { runOcr, runOcrRaw, recognize, extractEvents, normalize };
