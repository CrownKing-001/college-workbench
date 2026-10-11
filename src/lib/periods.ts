// 作息时间表解析：把用户粘贴的「第N节 8:00-8:45」这类文本解析成时间段列表。
// 用于「设置 → 作息时间表」导入自己学校的上下课时间，供课表 OCR 分配节次时间用。

export interface PeriodSlot {
  start: string; // HH:MM
  end: string;   // HH:MM
}

/**
 * 从一段文本里解析作息时间表。
 * 支持每行一个时间段，常见写法都能认：
 *   「第1节 8:00-8:45」「第一节 8:00·8:45」「1 8:00～8:45」「8:00至8:45」「08:00-08:45」
 * 也兼容 OCR 带空格的写法「8 ： 00 · 8 ： 45」。
 * 返回按开始时间排序的时段列表；解析不到时返回空数组。
 */
export function parsePeriodSchedule(text: string): PeriodSlot[] {
  const out: PeriodSlot[] = [];
  if (!text) return out;

  const lines = String(text).split(/\r?\n/);
  for (const line of lines) {
    // 时间范围：H:MM 分隔符 H:MM（分隔符支持 - – — ~ ～ · 至 到）
    const m = line.match(
      /(\d{1,2})\s*[:：.]\s*(\d{1,2})\s*[-–—~～·至到]\s*(\d{1,2})\s*[:：.]\s*(\d{1,2})/
    );
    if (!m) continue;
    const start = `${String(+m[1]).padStart(2, '0')}:${String(+m[2]).padStart(2, '0')}`;
    const end = `${String(+m[3]).padStart(2, '0')}:${String(+m[4]).padStart(2, '0')}`;
    // 过滤明显错误的时间（结束早于等于开始、超出 24 小时）
    if (start >= end) continue;
    out.push({ start, end });
  }

  // 按开始时间排序，并去重（连续重复行常见于表格复制）
  const seen = new Set<string>();
  const uniq: PeriodSlot[] = [];
  for (const p of out.sort((a, b) => a.start.localeCompare(b.start))) {
    const key = `${p.start}|${p.end}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(p);
  }
  return uniq;
}

/** 把时间段列表转成可读文本（用于展示 / 导出） */
export function formatPeriodSchedule(periods: PeriodSlot[]): string {
  return periods
    .map((p, i) => `第${i + 1}节 ${p.start}-${p.end}`)
    .join('\n');
}
