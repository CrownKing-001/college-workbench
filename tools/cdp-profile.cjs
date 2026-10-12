// 浏览器 profile 一律放系统临时目录，**不要**放进仓库。
//
// 起因：截图 / 主题校验这些工具用 Edge 无头模式跑，Edge 会生成一个 user-data-dir。
// 早先把它放在 .shots/ 下面，单个就有 275 MB（还有几个 CDP profile 合计 100+ MB），
// 仓库体积迅速膨胀。profile 是纯缓存 —— 用完即弃，放系统临时目录最合适。
//
// 用法：
//   const { tempProfile, cleanup } = require('./cdp-profile.cjs');
//   const dir = tempProfile('check-theme');   // 每次都是干净的新目录
//   ...
//   cleanup(dir);                             // 退出时删掉
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

/** 建一个干净的临时 profile 目录（同名旧目录会先被清掉） */
function tempProfile(name) {
  const dir = path.join(os.tmpdir(), `college-shots-${name}`);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** 同步睡一会儿（Node 没有同步 sleep，用 Atomics.wait 实现） */
function sleepSync(ms) {
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch { /* 极少数环境不支持，忽略 */ }
}

/**
 * 删掉临时 profile。
 * 需要重试：脚本是在 edge.kill() 之后立刻退出的，Edge 往往还没释放文件句柄，
 * 第一次 rmSync 会失败。这里退避重试几次，基本都能删干净。
 */
function cleanup(dir) {
  if (!dir) return false;
  for (let i = 0; i < 6; i++) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch { /* 还被占用，等一下再试 */ }
    if (!fs.existsSync(dir)) return true;
    sleepSync(200);
  }
  // 实在删不掉也无所谓：下次运行时 tempProfile 会先清同名目录，
  // 而且它位于 %TEMP%，系统自己也会回收。
  return false;
}

/** 把清理挂到进程退出上，保证异常退出也能收干净 */
function cleanupOnExit(dir) {
  process.on('exit', () => cleanup(dir));
  process.on('SIGINT', () => { cleanup(dir); process.exit(130); });
}

module.exports = { tempProfile, cleanup, cleanupOnExit };
