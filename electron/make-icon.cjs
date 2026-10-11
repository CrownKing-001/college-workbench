// 生成应用图标（PNG + ICO），纯 Node 实现，不依赖额外图像库。
//
// 设计：深色圆角方块（squircle 观感）+ 翡翠绿→青绿渐变底，
//       中间一枚白色「对勾 + 三条进度线」的组合，象征「工作台 / 打卡完成」。
// 要点：小尺寸（16/32px）下细节会糊，所以主体只用大色块和高对比，
//       不依赖细线；对勾笔画足够粗，缩到 16px 仍能认出来。
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const S = 256;
const px = new Uint8Array(S * S * 4); // RGBA

// ── 基础绘制工具 ────────────────────────────────────────
const set = (x, y, r, g, b, a = 255) => {
  if (x < 0 || y < 0 || x >= S || y >= S) return;
  const i = (y * S + x) * 4;
  const sa = a / 255;
  const da = px[i + 3] / 255;
  const oa = sa + da * (1 - sa);
  if (oa === 0) return;
  px[i] = Math.round((r * sa + px[i] * da * (1 - sa)) / oa);
  px[i + 1] = Math.round((g * sa + px[i + 1] * da * (1 - sa)) / oa);
  px[i + 2] = Math.round((b * sa + px[i + 2] * da * (1 - sa)) / oa);
  px[i + 3] = Math.round(oa * 255);
};

/** 圆角矩形（squircle 近似：半径够大时观感接近 iOS 图标） */
const inRoundRect = (x, y, x0, y0, x1, y1, r) => {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
};

/** 点到线段的最短距离，用于画粗笔画（对勾） */
const distToSeg = (px_, py_, x0, y0, x1, y1) => {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((px_ - x0) * dx + (py_ - y0) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = x0 + t * dx;
  const cy = y0 + t * dy;
  return Math.hypot(px_ - cx, py_ - cy);
};

// 配色
const BG_TOP = [16, 185, 129];   // emerald-500
const BG_BOT = [13, 148, 136];   // teal-600
const PLATE = [15, 23, 42];      // slate-900 深色「卡片」

// 超采样抗锯齿
const SS = 3;
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    let acc = [0, 0, 0, 0];
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const fx = x + (sx + 0.5) / SS;
        const fy = y + (sy + 0.5) / SS;

        let r = 0, g = 0, b = 0, a = 0;

        // ① 外层：翡翠→青绿渐变圆角方块
        if (inRoundRect(fx, fy, 6, 6, S - 6, S - 6, 58)) {
          const t = Math.min(1, Math.max(0, (fy - 6) / (S - 12)));
          r = Math.round(BG_TOP[0] + (BG_BOT[0] - BG_TOP[0]) * t);
          g = Math.round(BG_TOP[1] + (BG_BOT[1] - BG_TOP[1]) * t);
          b = Math.round(BG_TOP[2] + (BG_BOT[2] - BG_TOP[2]) * t);
          a = 255;
        }

        // ② 内层：深色圆角「屏幕」，让中间的白色图形有对比
        if (inRoundRect(fx, fy, 40, 40, S - 40, S - 40, 40)) {
          r = PLATE[0]; g = PLATE[1]; b = PLATE[2]; a = 255;
        }

        // ③ 三条进度线（左上角，短→长，表示逐项完成）
        {
          const x0 = 74, h = 8, rad = 4;
          const bars = [
            { y: 84, w: 46 },
            { y: 106, w: 66 },
            { y: 128, w: 30 },
          ];
          for (const bar of bars) {
            if (inRoundRect(fx, fy, x0, bar.y - h / 2, x0 + bar.w, bar.y + h / 2, rad)) {
              r = 148; g = 163; b = 184; a = 255; // slate-400
            }
          }
        }

        // ④ 大对勾（右下，粗笔画）
        {
          const w = 13; // 半宽
          const d1 = distToSeg(fx, fy, 96, 168, 124, 196);
          const d2 = distToSeg(fx, fy, 124, 196, 176, 138);
          if (Math.min(d1, d2) <= w) {
            r = 255; g = 255; b = 255; a = 255;
          }
        }

        acc[0] += r; acc[1] += g; acc[2] += b; acc[3] += a;
      }
    }
    const n = SS * SS;
    const i = (y * S + x) * 4;
    px[i] = Math.round(acc[0] / n);
    px[i + 1] = Math.round(acc[1] / n);
    px[i + 2] = Math.round(acc[2] / n);
    px[i + 3] = Math.round(acc[3] / n);
  }
}

// ── 编码 PNG ────────────────────────────────────────────
function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function encodePNG(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4)
      .copy(raw, y * (width * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── 编码 ICO（内嵌 PNG，Windows Vista+ 支持）─────────────
function encodeICO(pngBuffers) {
  const count = pngBuffers.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(count, 4);

  const dir = Buffer.alloc(16 * count);
  let offset = 6 + 16 * count;
  pngBuffers.forEach((p, i) => {
    const size = p.size;
    dir[i * 16] = size >= 256 ? 0 : size;
    dir[i * 16 + 1] = size >= 256 ? 0 : size;
    dir[i * 16 + 2] = 0;
    dir[i * 16 + 3] = 0;
    dir.writeUInt16LE(1, i * 16 + 4);   // color planes
    dir.writeUInt16LE(32, i * 16 + 6);  // bpp
    dir.writeUInt32LE(p.buf.length, i * 16 + 8);
    dir.writeUInt32LE(offset, i * 16 + 12);
    offset += p.buf.length;
  });

  return Buffer.concat([header, dir, ...pngBuffers.map((p) => p.buf)]);
}

/** 盒式平均缩放（带 alpha 加权，避免透明边缘发黑） */
function resize(src, from, to) {
  const out = new Uint8Array(to * to * 4);
  const scale = from / to;
  for (let y = 0; y < to; y++) {
    for (let x = 0; x < to; x++) {
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      const x0 = Math.floor(x * scale), x1 = Math.min(from, Math.ceil((x + 1) * scale));
      const y0 = Math.floor(y * scale), y1 = Math.min(from, Math.ceil((y + 1) * scale));
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const i = (sy * from + sx) * 4;
          const al = src[i + 3] / 255;
          r += src[i] * al; g += src[i + 1] * al; b += src[i + 2] * al;
          a += src[i + 3];
          n++;
        }
      }
      const aAvg = a / n;
      const o = (y * to + x) * 4;
      const wsum = aAvg > 0 ? (a / 255) || 1 : 1;
      out[o] = Math.round(r / wsum);
      out[o + 1] = Math.round(g / wsum);
      out[o + 2] = Math.round(b / wsum);
      out[o + 3] = Math.round(aAvg);
    }
  }
  return out;
}

const outDir = path.join(__dirname, 'build');
fs.mkdirSync(outDir, { recursive: true });

const png256 = encodePNG(S, S, px);
fs.writeFileSync(path.join(outDir, 'icon.png'), png256);

const sizes = [256, 128, 64, 48, 32, 16];
const icoParts = sizes.map((s) => ({
  size: s,
  buf: encodePNG(s, s, s === S ? px : resize(px, S, s)),
}));
fs.writeFileSync(path.join(outDir, 'icon.ico'), encodeICO(icoParts));

console.log('icon.png + icon.ico 已生成于', outDir);
