import fs from "node:fs";
import zlib from "node:zlib";

// 无依赖读取 Chrome 截图，用于检查缩放后状态栏接缝像素。
export function readPngPixels(input) {
  const data = Buffer.isBuffer(input) ? input : fs.readFileSync(input);
  let pos = 8, width, height, type, depth;
  const chunks = [];
  while (pos < data.length) {
    const size = data.readUInt32BE(pos), name = data.toString("ascii", pos + 4, pos + 8);
    const chunk = data.subarray(pos + 8, pos + 8 + size);
    if (name === "IHDR") {
      width = chunk.readUInt32BE(0); height = chunk.readUInt32BE(4); depth = chunk[8]; type = chunk[9];
    }
    if (name === "IDAT") chunks.push(chunk);
    pos += size + 12;
  }
  if (depth !== 8 || ![2, 6].includes(type)) throw new Error("Only RGB/RGBA 8-bit PNG is supported");
  const bpp = type === 2 ? 3 : 4, raw = zlib.inflateSync(Buffer.concat(chunks)), rows = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(width * bpp), offset = y * (width * bpp + 1), filter = raw[offset];
    for (let x = 0; x < row.length; x++) {
      const a = x >= bpp ? row[x - bpp] : 0, b = y ? rows[y - 1][x] : 0;
      const c = y && x >= bpp ? rows[y - 1][x - bpp] : 0;
      let prediction = 0;
      if (filter === 1) prediction = a;
      if (filter === 2) prediction = b;
      if (filter === 3) prediction = Math.floor((a + b) / 2);
      if (filter === 4) {
        const v = a + b - c, da = Math.abs(v - a), db = Math.abs(v - b), dc = Math.abs(v - c);
        prediction = da <= db && da <= dc ? a : db <= dc ? b : c;
      }
      row[x] = (raw[offset + 1 + x] + prediction) & 255;
    }
    rows.push(row);
  }
  return { width, height, pixel: (x, y) => [...rows[y].subarray(x * bpp, x * bpp + 3)] };
}
