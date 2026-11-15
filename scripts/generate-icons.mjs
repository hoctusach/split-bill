import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c >>> 0;
}

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) c = crcTable[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodePng(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    rgba.copy(raw, row + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const TEAL = [12, 95, 86];
const PAPER = [247, 244, 238];
const INK = [28, 25, 21];
const CLAY = [196, 98, 45];

function cover(distance) {
  return Math.max(0, Math.min(1, 0.5 - distance));
}

function roundBox(x, y, cx, cy, halfWidth, halfHeight, radius) {
  const dx = Math.abs(x - cx) - halfWidth + radius;
  const dy = Math.abs(y - cy) - halfHeight + radius;
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - radius;
}

function over(dst, rgb, alpha) {
  const outA = alpha + dst[3] * (1 - alpha);
  if (outA <= 0) return [0, 0, 0, 0];
  return [
    (rgb[0] * alpha + dst[0] * dst[3] * (1 - alpha)) / outA,
    (rgb[1] * alpha + dst[1] * dst[3] * (1 - alpha)) / outA,
    (rgb[2] * alpha + dst[2] * dst[3] * (1 - alpha)) / outA,
    outA,
  ];
}

function sample(x, y, size, maskable) {
  let pixel = [TEAL[0], TEAL[1], TEAL[2], 1];
  const inset = maskable ? 0.2 : 0.1;
  const left = size * (0.22 + inset * 0.15);
  const right = size * (0.78 - inset * 0.15);
  const top = size * (maskable ? 0.24 : 0.16);
  const bottom = size * (maskable ? 0.76 : 0.84);
  const radius = size * 0.055;
  const receipt = cover(
    roundBox(x, y, (left + right) / 2, (top + bottom) / 2, (right - left) / 2, (bottom - top) / 2, radius),
  );
  pixel = over(pixel, PAPER, receipt);
  const line = (y0, x1, weight) => {
    const x0 = left + size * 0.07;
    const inside = x >= x0 && x <= x1;
    const distance = inside
      ? Math.abs(y - y0) - weight
      : Math.hypot(x - (x < x0 ? x0 : x1), y - y0) - weight;
    return cover(distance) * receipt;
  };
  pixel = over(pixel, INK, line(top + (bottom - top) * 0.32, right - size * 0.08, size * 0.012));
  pixel = over(pixel, INK, line(top + (bottom - top) * 0.48, right - size * 0.16, size * 0.012));
  pixel = over(pixel, INK, line(top + (bottom - top) * 0.64, right - size * 0.22, size * 0.012));
  const coinRadius = size * (maskable ? 0.1 : 0.125);
  const coinX = right - coinRadius * 0.05;
  const coinY = bottom - coinRadius * 0.05;
  const coin = cover(Math.hypot(x - coinX, y - coinY) - coinRadius);
  pixel = over(pixel, CLAY, coin);
  const ringOuter = cover(Math.hypot(x - coinX, y - coinY) - coinRadius * 0.72);
  const ringInner = cover(Math.hypot(x - coinX, y - coinY) - coinRadius * 0.56);
  pixel = over(pixel, PAPER, Math.max(0, ringOuter - ringInner));
  return pixel;
}

function render(size, maskable) {
  const rgba = Buffer.alloc(size * size * 4);
  const samples = 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const pixel = sample(x + (sx + 0.5) / samples, y + (sy + 0.5) / samples, size, maskable);
          r += pixel[0];
          g += pixel[1];
          b += pixel[2];
          a += pixel[3];
        }
      }
      const count = samples * samples;
      const index = (y * size + x) * 4;
      rgba[index] = Math.round(r / count);
      rgba[index + 1] = Math.round(g / count);
      rgba[index + 2] = Math.round(b / count);
      rgba[index + 3] = Math.round((a / count) * 255);
    }
  }
  return encodePng(size, rgba);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../public/icons");
mkdirSync(root, { recursive: true });
writeFileSync(resolve(root, "icon-192.png"), render(192, false));
writeFileSync(resolve(root, "icon-512.png"), render(512, false));
writeFileSync(resolve(root, "icon-512-maskable.png"), render(512, true));
writeFileSync(resolve(root, "apple-touch-icon.png"), render(180, false));
console.log("Wrote icons to public/icons");
