// ============================================================
// 旧版「大学日程」数据导出脚本
// 用法：在旧网页上按 F12 → Console → 粘贴全部内容 → 回车
// 会下载一个 大学日程-旧数据.json，之后在桌面工作台「设置 → 导入备份」即可
// ============================================================
(function exportOldData() {
  const KEYS = [
    'fitplan-run-logs',      // 校园跑打卡
    'fitplan-health-logs',   // 体重 / 睡眠 / 步数
    'fitplan-diet-logs',     // 饮食记录
    'fitplan-train-done',    // 训练打卡
    'fitplan-diet-seed-ids', // 已合并的预置饮食 id
  ];

  const out = {
    __app: 'university-desk',
    __version: 1,
    __exportedAt: new Date().toISOString(),
    __source: '旧版网页 localStorage',
  };

  const summary = [];

  for (const k of KEYS) {
    const raw = localStorage.getItem(k);
    let value = undefined;
    if (raw) {
      try {
        value = JSON.parse(raw);
      } catch {
        value = raw;
      }
    }
    // 记录为空也写进去（保持结构完整），但统计里标注
    out[k] = value ?? [];
    const n = Array.isArray(value) ? value.length : value ? 1 : 0;
    summary.push(`${k}: ${n} 条`);
  }

  console.log('%c=== 旧数据统计 ===', 'color:#10b981;font-weight:bold');
  summary.forEach((s) => console.log('  ' + s));

  const total = KEYS.reduce((acc, k) => acc + (Array.isArray(out[k]) ? out[k].length : 0), 0);
  console.log(`%c合计 ${total} 条记录`, 'color:#10b981;font-weight:bold');

  if (total === 0) {
    console.warn('⚠️ 没读到任何数据。请确认你打开的是原来那个能用的页面，并且是同一个浏览器。');
  }

  // 下载
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `大学日程-旧数据-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);

  console.log('%c✅ 已触发下载：' + a.download, 'color:#10b981;font-weight:bold');
  console.log('把这个文件在桌面工作台里用「设置 → 导入备份」导入即可。');

  // 同时把内容复制到剪贴板，防止下载被拦
  try {
    copy(JSON.stringify(out));
    console.log('（内容也已复制到剪贴板，可粘到记事本里存成 .json）');
  } catch (e) {
    /* 忽略 */
  }

  return out;
})();
