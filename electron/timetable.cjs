// 课表图片识别 —— 从一张课程表照片/截图里抽出结构化课程，供用户确认后导入。
//
// 为什么单独写一个模块（而不是塞进 ocr.cjs）：
//   · ocr.cjs 处理的是「校历」——说明区自然语言 + 少量关键日期，靠关键词规则抽。
//   · 课表是**网格**：横轴是星期、纵轴是节次，课程名/教室/周次挤在同一个格子里。
//     两者的文本形态完全不同，抽取策略也必须不同，混在一起只会互相干扰。
//
// 复用底层：同一个 Windows.Media.Ocr 引擎（不联网、不装依赖、照片不出本机），
// 同一套「放大 + 灰度对比」预处理（小字表格放大后准确率明显提升）。
//
// 抽取思路（三步，全部基于 OCR 的包围盒坐标，不依赖任何固定模板）：
//   1. 找表头：识别出「星期一…星期日 / 周一…周日」这类列标题，拿到每天的 x 区间。
//      找不到表头就退回「按 x 聚类」的均匀分列（很多课表截图只有数字星期）。
//   2. 找节次行：识别「第N节 / N / 第一大节 / 08:00」这类时间标记，拿到每行的 y 区间。
//      找不到就按 y 聚类切行。
//   3. 把每个文字块按「落在哪个列 × 哪一行」投进网格格子，格子内的文字合并成一条课程，
//      再逐格解析出 课程名 / 教室 / 周次 / 节次时间。
//
// 重要取舍：OCR 一定会有错，所以这里**只产出候选**，绝不自动写入课表。
// 前端会把这些候选列成可编辑的表格，用户逐条核对、修改、勾选后才写进课表。

const { runOcr, runOcrRaw, normalize } = require('./ocr.cjs');

/** 把 OCR 的中文字符间空格去掉（"高 等 数" → "高等数"），并统一标点 */
function cleanLine(text) {
  // 课表单元格里没有有意义的空格，OCR 会在数字/标点周围乱插空格，
  // 所以比 normalize 更进一步：直接去掉所有空白。
  return normalize(String(text || '')).replace(/\s+/g, '');
}

/**
 * 把词级包围盒按 y 聚成「文本行」：行内按 x 拼接，行间按 y 排序。
 * 两种用途：
 *  · 词级 OCR → 行级，供表头 / 节次检测使用；
 *  · 单元格内部把该格的词还原成几行文字（课程名 / 教室 / 周次）。
 * 注意：对整幅图的全部词调用会把相邻格子**重新粘回一行**，
 * 所以拆列必须用词级坐标，只有格内还原文字才用这个函数。
 */
function groupWordsByRow(words) {
  const sorted = [...words].sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2) || a.x - b.x);
  const groups = [];
  for (const w of sorted) {
    const cy = w.y + w.h / 2;
    const last = groups[groups.length - 1];
    if (last && Math.abs(cy - last.cy) <= Math.max(10, w.h * 0.6)) {
      last.words.push(w);
      last.cy = (last.cy + cy) / 2;
    } else {
      groups.push({ cy, words: [w] });
    }
  }
  return groups.map((g) => {
    const ws = [...g.words].sort((a, b) => a.x - b.x);
    const x = ws[0].x;
    const right = Math.max(...ws.map((w) => w.x + w.w));
    return {
      x,
      y: Math.min(...ws.map((w) => w.y)),
      w: right - x,
      h: Math.max(...ws.map((w) => w.h)),
      text: ws.map((w) => w.text).join(''),
    };
  });
}

// ── 星期识别 ────────────────────────────────────────────
// 中文星期写法很多：星期一/周一/礼拜一/星期1/一（单独一个字）。
// OCR 实测常把「一」认成「－」「—」「l」，所以都归一到数字。
const CN_NUM = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7, 七: 7 };
const CN_NUM_LOOSE = { ...CN_NUM, '－': 1, '—': 1, '-': 1, '–': 1, l: 1, I: 1, '|': 1, 丨: 1, 目: 7, 曰: 7 };

/** 从一段文本里解析星期几（1=周一 … 7=周日）；解析不出返回 null */
function parseWeekday(text) {
  if (!text) return null;
  const t = String(text).replace(/\s/g, '');

  // 「星期/周/礼拜 + 数字或汉字」。这里不限定字符集，统一交给 CN_NUM_LOOSE 查表，
  // 以便覆盖 OCR 常见误识：「一」→ l/I/丨/-，「日」→ 目/曰 等（否则表头会整列漏掉）。
  const m = t.match(/(?:星期|周|礼拜|礼)([^\s])/);
  if (m) {
    const c = m[1];
    if (/[1-7]/.test(c)) return +c;
    return CN_NUM_LOOSE[c] ?? null;
  }

  // 「星期」被 OCR 认坏（实测「星期二」→「期二」「星朋二」），只看后面的数字/汉字。
  // 但「期」也出现在「起始日期2026」这类长句里，所以只有短文本（真正的表头）才走这条。
  if (t.length <= 4) {
    const m2 = t.match(/(?:星|期|朋|月|明)\s*([^\s])/);
    if (m2) {
      const c = m2[1];
      if (/[1-7]/.test(c)) return +c;
      return CN_NUM_LOOSE[c] ?? null;
    }
  }

  // 整行就是孤零零一个「一」或「1」时，只有在表头区域才可信 —— 由调用方决定，
  // 这里只在文本很短（<=2 字）时给出结果。
  if (t.length <= 2) {
    const c = t[0];
    if (/[1-7]/.test(c)) return +c;
    return CN_NUM_LOOSE[c] ?? null;
  }
  return null;
}

// ── 节次 / 时间识别 ─────────────────────────────────────
/** 解析「H:MM」或「HH:MM」为分钟数；解析不出返回 null */
function parseClock(text) {
  const m = String(text || '').match(/(\d{1,2})\s*[:：.]\s*(\d{1,2})/);
  if (!m) return null;
  const h = +m[1];
  const min = +m[2];
  if (h > 23 || min > 59) return null;
  return { h, min, text: `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}` };
}

/** 从一行文本里解析出「第几节」的节次编号（1 开始）；解析不出返回 null */
function parsePeriodIndex(text) {
  const t = String(text || '').replace(/\s/g, '');
  const m = t.match(/第?\s*([一二三四五六七八九十\d]{1,3})\s*(?:大)?节/);
  if (m) {
    const num = cnToNumber(m[1]);
    if (num) return num;
  }
  // 只有数字的格子（很多课表左侧就是 1 2 3 4…）
  if (/^\d{1,2}$/.test(t)) {
    const n = +t;
    if (n >= 1 && n <= 20) return n;
  }
  // 「1-2节」「3、4节」取第一个
  const m2 = t.match(/^(\d{1,2})\s*[-–~、,，]\s*\d{1,2}\s*节?$/);
  if (m2) return +m2[1];
  return null;
}

/** 中文数字转阿拉伯数字，支持「十」「十一」「二十」等 */
function cnToNumber(s) {
  if (!s) return null;
  if (/^\d+$/.test(s)) return +s;
  const map = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
  if (s === '十') return 10;
  if (s.length === 1) return map[s] ?? null;
  // 十一 … 十九
  if (s[0] === '十') return 10 + (map[s[1]] ?? 0);
  // 二十 … 九十九
  if (s[1] === '十') return (map[s[0]] ?? 0) * 10 + (s[2] ? (map[s[2]] ?? 0) : 0);
  return null;
}

// ── 周次识别 ────────────────────────────────────────────
const FULLWIDTH = (s) => String(s).replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));

/**
 * 从格子文本里解析上课周次。
 * 支持：`1-16周`、`1-16`、`第1-16周`、`单周`、`双周`、`1,3,5周`、`1-16周(单)`、`2-16双周`
 * 返回 { weeks: number[], label: string }，解析不出时 weeks 为 null（表示「每周」）。
 */
function parseWeeks(text) {
  const raw = FULLWIDTH(text || '');
  if (!raw) return { weeks: null, label: '' };

  const isOdd = /单周|单数周|\(单\)|（单）/.test(raw);
  const isEven = /双周|双数周|\(双\)|（双）/.test(raw);

  // 只解析「周」上下文：优先取「(…周)」括号块，否则取含「周」的短片段，
  // 避免把教室号 / 课程代码 / 时间（9:50、12:15）里的数字误当周次。
  let scope = '';
  const paren = raw.match(/[（(]\s*([^（）()]*周[^（）()]*)\s*[）)]/);
  if (paren) {
    scope = paren[1];
  } else {
    const m2 = raw.match(/(\d{1,2}\s*(?:[-–~～至到]\s*\d{1,2})?\s*[单双]?\s*周)/);
    scope = m2 ? m2[1] : '';
  }
  if (!scope) {
    if (isOdd || isEven) {
      const out = [];
      for (let w = 1; w <= 20; w++) {
        if (isOdd && w % 2 === 1) out.push(w);
        if (isEven && w % 2 === 0) out.push(w);
      }
      return { weeks: out, label: raw.trim() };
    }
    return { weeks: null, label: '' };
  }

  // 提取范围（a-b / a到b / a～b）与单独数字（列表）
  const weeks = new Set();
  const rangeRe = /(\d{1,2})\s*(?:到|至|~|～|–|-)\s*(\d{1,2})/g;
  let m;
  while ((m = rangeRe.exec(scope))) {
    const lo = Math.min(+m[1], +m[2]);
    const hi = Math.max(+m[1], +m[2]);
    for (let w = lo; w <= hi && w <= 30; w++) weeks.add(w);
  }
  // 列表数字：逗号/顿号分隔的单个周次
  for (const n of scope.match(/\d{1,2}/g) || []) {
    const w = +n;
    if (w >= 1 && w <= 30) weeks.add(w);
  }
  if (!weeks.size) return { weeks: null, label: raw.trim() };

  let out = [...weeks].sort((a, b) => a - b);
  if (isOdd) out = out.filter((w) => w % 2 === 1);
  if (isEven) out = out.filter((w) => w % 2 === 0);
  return { weeks: out, label: raw.trim() };
}

/**
 * 从 OCR 行里识别「第N周」（图片标题/表头），用于校准当前教学周。
 * 只认「第N周」这种单一编号，不碰「1-16周」「第5-6周」这类课程周次区间。
 * 标题通常在图片顶部，所以优先取靠上、且文本较短的候选，避免把课程格子里的
 * 「第1周」角标误当当前周。
 */
function detectCurrentWeek(lines) {
  if (!Array.isArray(lines) || !lines.length) return null;
  const maxY = Math.max(...lines.map((l) => l.y + l.h));
  const topBand = maxY * 0.2; // 标题区：图片顶部约 20%
  const candidates = [];
  for (const l of lines) {
    const raw = FULLWIDTH(String(l.text || '')).replace(/\s+/g, '');
    const m = raw.match(/第(\d{1,2})周/);
    if (!m) continue;
    const n = +m[1];
    if (n < 1 || n > 30) continue;
    const cy = l.y + l.h / 2;
    const inTop = cy <= topBand;
    const short = raw.length <= 14;
    if (inTop || short) candidates.push({ n, y: cy, len: raw.length });
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => a.y - b.y || a.len - b.len);
  return candidates[0].n;
}

// ── 教室识别 ────────────────────────────────────────────
// 教室的写法：理科楼B324 / 教学楼109 / A101 / 综合楼 3-201 / 体育馆
// 特征：含「楼/馆/室/区/院/中心/阶梯」等字，或「字母+数字」的编号形式。
// 注意：不能用「体育/教学/实验」这类裸词 —— 它们会出现在课程名里
// （「体育与健康」「大学物理实验」），误判会导致整门课被丢掉。
const PLACE_HINT = /(楼|馆|室|区|院|中心|阶梯|校区|报告厅|礼堂|操场|球场|体育场|田径场|场地|场馆)/;
const PLACE_CODE = /[A-Za-z]{1,4}\s*[-]?\s*\d{2,4}/;

function looksLikePlace(text) {
  const t = String(text || '').trim();
  if (!t || t.length > 24) return false;
  return PLACE_HINT.test(t) || PLACE_CODE.test(t);
}

// ── 课程名清理 ──────────────────────────────────────────
// 一个格子里除了课程名，通常还有教学班代码/教室/周次。把已知的摘掉，剩下的当课程名。
const META_HINT = /教学班|代码|课程序号|学分|学时|[A-Z]{3,}\s*\d+|(PSYC|CRYP|GENE|MARX|SPOR|SFLE)\d*/;

function cleanCourseName(lines) {
  const candidates = [];
  for (const raw of lines) {
    let t = String(raw || '').trim();
    if (!t) continue;
    // 教学班代码 / 代码编号行直接跳过（「教学班代码：CRYP1102，01」这类）
    if (META_HINT.test(t)) continue;
    // 去掉括号里的周次/节次/时间说明：「（1周）（1·3节 8:00·10:35）某校区…」
    t = t.replace(/[（(][^）)]*[）)]/g, ' ');
    // 去掉残留的周次/时间片段
    t = t.replace(/第?\s*\d{1,2}\s*[-–~至到]\s*\d{1,2}\s*周?/g, ' ');
    t = t.replace(/\d{1,2}\s*周/g, ' ');
    t = t.replace(/\d{1,2}\s*[-–~·～至到]\s*\d{1,2}\s*节/g, ' ');
    t = t.replace(/\d{1,2}[:：.]\d{1,2}\s*[-–~·～至到]\s*\d{1,2}[:：.]\d{1,2}/g, ' ');
    t = t.replace(/\s+/g, ' ').trim();
    if (!t) continue;
    // 跳过纯教室行、纯数字行、纯时间行、纯「校区」长行
    if (looksLikePlace(t)) continue;
    if (/^[\d\s:：.~\-–—,，、·～]+$/.test(t)) continue;
    // 跳过地点碎片（「XX校区」被 OCR 拆成「XX」「校区」等）
    if (/校区/.test(t)) continue;
    if (t.length <= 5 && /[校区]/.test(t)) continue;
    // 跳过残留时间片段（「15:40·1」这类）
    if (/\d{1,2}[:：]\d{2}/.test(t)) continue;
    if (t.length < 2) continue;
    candidates.push(t);
  }
  // 取最像课程名的那行：更短、不含数字编号的更优先
  candidates.sort((a, b) => {
    const score = (s) => (/\d/.test(s) ? 1 : 0) + (s.length > 18 ? 1 : 0);
    return score(a) - score(b) || b.length - a.length;
  });
  return candidates[0] || '';
}

/** 从格子里挑出最像教室的一行 */
function pickPlace(lines) {
  const cands = lines
    .map((l) => String(l || '').trim())
    // 排除教学班代码等元数据行（「教学班代码：CRYP1102，01」不是教室）
    .filter((l) => l && !META_HINT.test(l) && looksLikePlace(l));
  if (!cands.length) return '';
  // 多个候选时取最长的（通常信息最全，如「理科楼 B324」而不是「B324」）
  return cands.sort((a, b) => b.length - a.length)[0];
}

// ── 表格结构推断 ────────────────────────────────────────

/**
 * 找表头列：扫描所有文字块，找出能解析成星期几的那些，
 * 用它们的 x 中心把画面切成 7 列。
 */
function detectColumns(lines) {
  const candidates = [];
  for (const l of lines) {
    const wd = parseWeekday(l.text);
    if (wd) candidates.push({ day: wd, cx: l.x + l.w / 2, y: l.y, h: l.h, text: l.text });
  }
  if (candidates.length < 3) return null;

  // 同一天可能被识别到多次（表头 + 表里的「周一」角标），
  // 取**最靠上**的那一组：表头一定在表格顶部。
  const byDay = new Map();
  for (const c of candidates) {
    const cur = byDay.get(c.day);
    if (!cur || c.y < cur.y) byDay.set(c.day, c);
  }
  const picked = [...byDay.values()].sort((a, b) => a.cx - b.cx);
  if (picked.length < 3) return null;

  // 校验：真正的表头是**同一水平行**上的一排星期。
  // 词级 OCR 下每个汉字独立成词，课程正文里的「一 / 日 / 六」会被 parseWeekday
  // 误判成星期；若这些候选的 y 散布很广，说明是正文单字而非表头，
  // 必须放弃表头退回按内容聚类，否则整张表的列会严重错位。
  const ySpread = Math.max(...picked.map((p) => p.y)) - Math.min(...picked.map((p) => p.y));
  const yTol = Math.max(24, Math.max(...picked.map((p) => p.h)) * 1.5);
  if (ySpread > yTol) return null;

  // 表头所在的 y 带：用于后续剔除表头文字，避免它被当成课程
  const headerY = Math.min(...picked.map((p) => p.y));
  const headerHeight = Math.max(...picked.map((p) => p.h));

  // 列宽：相邻表头 x 间距取中位数（抗个别误检）
  const gaps = [];
  for (let i = 1; i < picked.length; i++) gaps.push(picked[i].cx - picked[i - 1].cx);
  gaps.sort((a, b) => a - b);
  const width = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0;
  if (!(width > 0)) return null;

  // 用已检出的星期做锚点，向左右外推补全 7 天。
  // 教务系统截图常被裁剪（只露出周四~周日），左侧的周一~周三没有表头但仍有课程，
  // 所以不能只按检出的表头分列，否则左半边课程会被整片丢掉。
  const anchorByDay = new Map(picked.map((p) => [p.day, p.cx]));
  const centers = [];
  for (let day = 1; day <= 7; day++) {
    if (anchorByDay.has(day)) {
      centers.push({ day, cx: anchorByDay.get(day) });
    } else {
      // 找最近的已检出锚点，按列宽外推
      const ref = [...anchorByDay.entries()].sort(
        (a, b) => Math.abs(a[0] - day) - Math.abs(b[0] - day)
      )[0];
      if (!ref) continue;
      centers.push({ day, cx: ref[1] + (day - ref[0]) * width });
    }
  }
  centers.sort((a, b) => a.day - b.day);

  // 用相邻列中心的中点作为列边界；首尾列外扩半个列宽
  const bounds = [];
  for (let i = 0; i < centers.length; i++) {
    const left = i === 0 ? centers[0].cx - width / 2 : (centers[i - 1].cx + centers[i].cx) / 2;
    const right = i === centers.length - 1 ? centers[i].cx + width / 2 : (centers[i].cx + centers[i + 1].cx) / 2;
    bounds.push({ day: centers[i].day, left, right });
  }
  return { cols: bounds, headerY, headerHeight };
}

/**
 * 没有可用表头时的退路：所有文字块按 x 间距聚类，均分成 7 列。
 * 这一步不追求精确，只是让网格至少有个骨架，误判由用户核对时修正。
 */
/**
 * 兜底列：左边约 1/9 留给「节次 / 时间」栏，其余七等分。
 * 这是最早的朴素做法，精度一般，但能保证**任何图都有一套列可用**，
 * 不会因为列检测失败而整张表一门课都抽不出来。
 */
function evenColumns(items) {
  if (!items.length) return null;
  const cx = items.map((l) => l.x + l.w / 2).sort((a, b) => a - b);
  const minX = cx[0];
  const maxX = cx[cx.length - 1];
  const gutter = (maxX - minX) / 9;
  const start = minX + gutter;
  const step = (maxX - start) / 7;
  if (!(step > 0)) return null;
  const cols = [];
  for (let i = 0; i < 7; i++) {
    cols.push({ day: i + 1, left: start + i * step, right: start + (i + 1) * step });
  }
  return { cols, headerY: -1, headerHeight: 0 };
}

function fallbackColumns(items) {
  if (!items.length) return null;
  // 无表头时，用「水平相邻切格子」找列：
  //   同一格内相邻字的间隙只有几像素，跨格子的空隙有几十像素，
  //   所以先按 y 聚行，再把每行按间隙切成一个个 run（= 格子），
  //   最后把各 run 的起点聚类成列。
  const sorted = [...items].sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2) || a.x - b.x);
  const rows = [];
  for (const it of sorted) {
    const cy = it.y + it.h / 2;
    const last = rows[rows.length - 1];
    if (last && Math.abs(cy - last.cy) <= Math.max(10, it.h * 0.6)) {
      last.items.push(it);
      last.cy = (last.cy + cy) / 2;
    } else {
      rows.push({ cy, items: [it] });
    }
  }

  const starts = [];
  for (const r of rows) {
    const ws = [...r.items].sort((a, b) => a.x - b.x);
    let runStart = null;
    let runText = '';
    let prevRight = null;
    const flush = () => {
      if (runStart == null) return;
      // 左侧「时间 / 节次」栏是纯数字或冒号，不算内容列
      if (!/^[\d:：.]+$/.test(runText)) starts.push(runStart);
      runStart = null;
      runText = '';
    };
    for (const w of ws) {
      if (prevRight != null && w.x - prevRight >= 20) flush();
      if (runStart == null) runStart = w.x;
      runText += w.text;
      prevRight = w.x + w.w;
    }
    flush();
  }
  if (starts.length < 3) return evenColumns(items);

  starts.sort((a, b) => a - b);
  const clusters = [];
  for (const x of starts) {
    const last = clusters[clusters.length - 1];
    // 同一列的格子起点会对齐（抖动远小于列间距 236px）
    if (last && x - last[last.length - 1] < 90) last.push(x);
    else clusters.push([x]);
  }
  if (clusters.length < 3) return evenColumns(items);

  const centers = clusters.map((c) => c.reduce((s, v) => s + v, 0) / c.length);
  const gaps = [];
  for (let i = 1; i < centers.length; i++) gaps.push(centers[i] - centers[i - 1]);
  gaps.sort((a, b) => a - b);
  const width = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0;
  if (!(width > 0)) return evenColumns(items);

  const cols = centers.map((cx, i) => ({
    day: i + 1,
    left: i === 0 ? cx - width / 2 : (centers[i - 1] + cx) / 2,
    right: i === centers.length - 1 ? cx + width / 2 : (cx + centers[i + 1]) / 2,
  }));
  return { cols, headerY: -1, headerHeight: 0 };
}

/**
 * 找节次行：把能解析出节次的文字块按 y 聚类，得到每一行的 y 区间。
 * 找不到就按 y 聚类把文字块自然分行。
 */
function detectRows(lines, headerY) {
  const body = lines.filter((l) => headerY < 0 || l.y > headerY + 4);
  if (!body.length) return [];

  // 先尝试用「节次标记」当行锚点（最可靠）
  const anchors = [];
  for (const l of body) {
    const idx = parsePeriodIndex(l.text);
    // 节次标记都在最左边一列：x 靠左且文本很短
    if (idx !== null && l.text.trim().length <= 6 && l.x < l.x + l.w) {
      const clock = parseClock(l.text);
      anchors.push({ idx, cy: l.y + l.h / 2, clock });
    }
  }

  // 用时钟时间做行锚点（很多课表左侧写的是 08:00-09:40 而不是第N节）
  const clockAnchors = [];
  for (const l of body) {
    const clock = parseClock(l.text);
    if (clock && l.text.trim().length <= 14) {
      clockAnchors.push({ cy: l.y + l.h / 2, clock });
    }
  }

  // 对锚点做 y 聚类（同一行的多个标记归并）
  const cluster = (items, getY, threshold = 14) => {
    const sorted = [...items].sort((a, b) => getY(a) - getY(b));
    const out = [];
    for (const it of sorted) {
      const last = out[out.length - 1];
      // 同一行内 y 差一般 < 行高的一半；跨行间距明显更大
      if (last && Math.abs(getY(it) - getY(last[last.length - 1])) < threshold) last.push(it);
      else out.push([it]);
    }
    return out;
  };

  let rows = [];
  if (anchors.length >= 3) {
    const groups = cluster(anchors, (a) => a.cy);
    groups.forEach((g, i) => {
      const y = g.reduce((s, x) => s + x.cy, 0) / g.length;
      const idx = Math.min(...g.map((x) => x.idx));
      const clock = g.find((x) => x.clock)?.clock ?? null;
      rows.push({ index: idx, y, clock, order: i });
    });
  } else if (clockAnchors.length >= 3) {
    // 左列时间是「开始 / 结束」成对出现的：同一节课的两个时间只差约一个行高，
    // 相邻两节课之间差得多得多。用相邻间距的中位数当聚类阈值，
    // 就能把 start/end 并成一节；否则行数会翻倍（20 个时间 → 20 行而不是 10 节）。
    const byY = [...clockAnchors].sort((a, b) => a.cy - b.cy);
    const gaps = [];
    for (let i = 1; i < byY.length; i++) gaps.push(byY[i].cy - byY[i - 1].cy);
    gaps.sort((a, b) => a - b);
    const th = gaps.length ? Math.max(20, gaps[Math.floor(gaps.length / 2)]) : 20;
    const groups = cluster(clockAnchors, (a) => a.cy, th);
    groups.forEach((g, i) => {
      const y = g.reduce((s, x) => s + x.cy, 0) / g.length;
      const clock = g.map((x) => x.clock).sort((a, b) => a.h * 60 + a.min - (b.h * 60 + b.min))[0];
      rows.push({ index: i + 1, y, clock, order: i });
    });
  }

  if (rows.length >= 2) {
    rows.sort((a, b) => a.y - b.y);
    // 算出每行的上下边界：相邻行中点
    for (let i = 0; i < rows.length; i++) {
      const prev = rows[i - 1];
      const next = rows[i + 1];
      rows[i].top = prev ? (prev.y + rows[i].y) / 2 : rows[i].y - 30;
      rows[i].bottom = next ? (rows[i].y + next.y) / 2 : rows[i].y + 30;
    }
    return rows;
  }

  // 退路：把所有文字块按 y 自然聚类成行
  const sorted = [...body].sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2));
  const groups = [];
  for (const l of sorted) {
    const cy = l.y + l.h / 2;
    const last = groups[groups.length - 1];
    if (last && Math.abs(cy - (last.y + last.h / 2)) < Math.max(12, l.h * 0.7)) last.items.push(l);
    else groups.push({ y: l.y, h: l.h, items: [l] });
  }
  rows = groups.map((g, i) => {
    const y = g.items.reduce((s, x) => s + x.y + x.h / 2, 0) / g.items.length;
    const clock = g.items.map((x) => parseClock(x.text)).find(Boolean) ?? null;
    return { index: i + 1, y, clock, order: i };
  });
  for (let i = 0; i < rows.length; i++) {
    const prev = rows[i - 1];
    const next = rows[i + 1];
    rows[i].top = prev ? (prev.y + rows[i].y) / 2 : rows[i].y - 30;
    rows[i].bottom = next ? (rows[i].y + next.y) / 2 : rows[i].y + 30;
  }
  return rows;
}

/**
 * 节次 → 默认时间。找不到左侧时间标记时，用常见的大学作息兜底，
 * 让导入的课程至少有个合理的时间，用户可在确认表里改。
 * 用户可在「设置 → 作息时间表」里导入自己学校的作息，覆盖这里的兜底值。
 */
const DEFAULT_PERIOD_TIMES = [
  { start: '08:00', end: '08:45' }, { start: '08:55', end: '09:40' },
  { start: '10:00', end: '10:45' }, { start: '10:55', end: '11:40' },
  { start: '13:30', end: '14:15' }, { start: '14:25', end: '15:10' },
  { start: '15:30', end: '16:15' }, { start: '16:25', end: '17:10' },
  { start: '18:30', end: '19:15' }, { start: '19:25', end: '20:10' },
  { start: '20:20', end: '21:05' }, { start: '21:15', end: '22:00' },
];

function periodTimes(row, span, periods) {
  // span: 这门课跨了几行（几节连上）
  const list = periods && periods.length
    ? periods.map((p) => ({ start: p.start, end: p.end }))
    : DEFAULT_PERIOD_TIMES;
  const n = Math.max(1, span || 1);
  const startIdx = Math.max(0, (row.index ?? 1) - 1);
  const first = row.clock?.text ?? list[startIdx]?.start ?? '08:00';
  const lastRow = Math.min(list.length - 1, startIdx + n - 1);
  const last = list[lastRow]?.end ?? '09:40';
  return { start: first, end: last };
}

// ── 主流程 ──────────────────────────────────────────────

/**
 * 从 OCR 行里抽取课程候选。
 * @param {Array<{x:number,y:number,w:number,h:number,text:string}>} lines
 * @returns {Array<{day:number,name:string,place:string,start:string,end:string,weeks:number[]|null,weeksLabel:string,raw:string,confidence:string,rowIndex:number}>}
 */
function extractCourses(input, periods, opts = {}) {
  if (!Array.isArray(input) || !input.length) return [];

  // 归一化：OCR 常把中文字符间插空格（"高 等 数"），统一去掉
  const items = input.map((l) => ({ ...l, text: cleanLine(l.text) })).filter((l) => l.text);
  if (!items.length) return [];

  // 词级输入（opts.wordLevel）时：先用词聚成行供表头/节次检测，
  // 单元格分配仍走词级坐标 —— 这样「相邻格子被 OCR 连成一行」也能按 x 拆回各列。
  const wordLevel = !!opts.wordLevel;
  const lines = wordLevel ? groupWordsByRow(items) : items;

  // 列检测：先用表头；表头缺失/不可信时，用最细粒度的 items（词级最好）做「相邻切格」聚类
  const header = detectColumns(lines) ?? fallbackColumns(items);
  if (!header) return [];
  const { cols, headerY, headerHeight } = header;

  const rows = detectRows(lines, headerY);
  if (!rows.length) return [];

  // 把每个文字块投进「列 × 行」的格子
  const grid = new Map(); // `${day}|${rowIdx}` -> { lines: [], row, day }
  const rowOf = (cy) => rows.find((r) => cy >= r.top && cy < r.bottom) ?? null;
  const colOf = (cx) => cols.find((c) => cx >= c.left && cx < c.right) ?? null;

  // 表头带下边界：表头文字（星期一/第N节标题）都在这一带之上，一律不算课程
  const headerBottom = headerY >= 0 ? headerY + headerHeight + 4 : -1;

  for (const l of items) {
    const cy = l.y + l.h / 2;
    // 表头本身不是课程内容
    if (headerBottom >= 0 && cy <= headerBottom) continue;
    const cx = l.x + l.w / 2;
    const row = rowOf(cy);
    const col = colOf(cx);
    if (!row || !col) continue;
    // 极长的文本块多半是标题/页脚，不是单元格内容
    if (l.w > 0 && l.text.length > 40) continue;
    const key = `${col.day}|${row.order}`;
    if (!grid.has(key)) grid.set(key, { day: col.day, row, lines: [] });
    grid.get(key).lines.push(l);
  }

  // 每个格子内部按 y 再排一次，保持自然阅读顺序
  for (const cell of grid.values()) cell.lines.sort((a, b) => a.y - b.y || a.x - b.x);

  // 先把格子整理成一条条候选（含「没有课程名、只有周次/教室」的续行格）。
  const rawCells = [...grid.values()].map((cell) => {
    // 词级输入时，把该格内的词按 y 还原成几行文字；行级输入直接取文本
    const texts = wordLevel
      ? groupWordsByRow(cell.lines).map((l) => l.text)
      : cell.lines.map((l) => l.text);
    const joined = texts.join(' ');
    const name = cleanCourseName(texts);
    const place = pickPlace(texts);
    const { weeks, label } = parseWeeks(joined);
    return { day: cell.day, row: cell.row, texts, name, place, weeks, weeksLabel: label, joined };
  });

  // 按天分组、按行排序，逐格归并：
  //  · 有课程名的格子 = 一门课；下方相邻、同名的格子 = 连堂，并入；
  //  · 没有课程名但带周次/教室的格子 = 上一格内容的换行续写，把信息并入上一格。
  const byDay = new Map();
  for (const c of rawCells) {
    if (!byDay.has(c.day)) byDay.set(c.day, []);
    byDay.get(c.day).push(c);
  }
  const merged = [];
  for (const [, list] of byDay) {
    list.sort((a, b) => a.row.order - b.row.order);
    let cur = null;
    for (const c of list) {
      const hasName = Boolean(c.name && c.name.length >= 2);
      const adjacent = cur && c.row.order - cur.lastOrder === 1;

      // 续行格：无名，紧跟在一个课程名之后 → 把周次/教室补进上一格
      if (cur && !hasName && adjacent) {
        cur.texts.push(...c.texts);
        cur.lastOrder = c.row.order;
        cur.lastRow = c.row;
        if (!cur.place && c.place) cur.place = c.place;
        if (!cur.weeks && c.weeks) cur.weeks = c.weeks;
        if (c.weeksLabel) cur.weeksLabel = c.weeksLabel;
        cur.joined += ' ' + c.joined;
        continue;
      }

      // 连堂：同名相邻
      if (cur && cur.name === c.name && hasName && adjacent) {
        cur.lastOrder = c.row.order;
        cur.lastRow = c.row;
        cur.texts.push(...c.texts);
        if (!cur.place && c.place) cur.place = c.place;
        if (!cur.weeks && c.weeks) cur.weeks = c.weeks;
        if (c.weeksLabel) cur.weeksLabel = c.weeksLabel;
        cur.joined += ' ' + c.joined;
        continue;
      }

      // 无名的孤立格（前面没有课程名可并入）直接丢弃
      if (!hasName) continue;

      cur = {
        day: c.day,
        name: c.name,
        place: c.place,
        weeks: c.weeks,
        weeksLabel: c.weeksLabel,
        firstRow: c.row,
        lastRow: c.row,
        firstOrder: c.row.order,
        lastOrder: c.row.order,
        texts: [...c.texts],
        joined: c.joined,
      };
      merged.push(cur);
    }
  }

  // 生成最终候选
  const out = merged.map((m) => {
    const span = m.lastOrder - m.firstOrder + 1;
    const { start, end } = periodTimes(m.firstRow, span, periods);
    // 置信度：课程名 + 教室 + 周次都齐全算高；缺周次算中；只认出名字算低
    const confidence =
      m.name && m.place && m.weeks ? 'high' : m.name && (m.place || m.weeks) ? 'medium' : 'low';
    return {
      day: m.day,
      name: m.name,
      place: m.place,
      start,
      end,
      weeks: m.weeks,
      weeksLabel: m.weeksLabel,
      raw: m.texts.join(' | '),
      confidence,
      rowIndex: m.firstRow.index ?? m.firstOrder + 1,
      span,
    };
  });

  // 同一天同一课程名 + 同一时间段去重（OCR 有时会把同一个格子拆成两块）
  const uniq = new Map();
  for (const c of out) {
    const key = `${c.day}|${c.name}|${c.start}`;
    if (!uniq.has(key)) uniq.set(key, c);
  }
  return [...uniq.values()].sort((a, b) => a.day - b.day || a.start.localeCompare(b.start));
}

/**
 * 完整流程：OCR（复用 ocr.cjs 的放大 + Windows.Media.Ocr）→ 网格重建 → 课程抽取。
 * @param {string} imagePath 图片绝对路径
 * @param {{scale?: number}} opts
 */
function runTimetableOcr(imagePath, opts = {}) {
  const scale = opts.scale || 3;
  // 词级包围盒已打通（ocr.cjs 的 mode='words' + 本文件的 wordLevel 分支），
  // 能按 x 把「被 OCR 连成一行」的相邻格子拆回各列；
  // 但列聚类在真实截图上仍会被状态栏/按钮等杂项干扰，尚未稳定，
  // 所以这里暂时仍走行级路径。等列检测稳住后再切到词级。
  const res = runOcrRaw(imagePath, { scale });
  if (!res.ok) return res;
  const lines = res.lines || [];
  const courses = extractCourses(lines, opts.periods);
  const currentWeek = detectCurrentWeek(lines);
  return {
    ok: true,
    scale,
    engine: res.engine,
    lines,
    courses,
    currentWeek,
  };
}

module.exports = {
  runTimetableOcr,
  extractCourses,
  detectCurrentWeek,
  parseWeekday,
  parseWeeks,
  parsePeriodIndex,
  parseClock,
  cnToNumber,
  looksLikePlace,
  // 以下导出仅用于调试 / 自测（网格重建的中间结果）
  groupWordsByRow,
  detectColumns,
  fallbackColumns,
  detectRows,
  cleanCourseName,
  pickPlace,
};
