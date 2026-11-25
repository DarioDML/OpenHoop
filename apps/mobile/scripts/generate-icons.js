const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const OUT = path.join(__dirname, '..', 'assets', 'images');
const BG_TOP = [42, 53, 60];
const BG_BOTTOM = [13, 17, 20];
const SEG_FROM = [168, 151, 255];
const SEG_TO = [63, 176, 255];
const WHITE = [255, 255, 255];
const SAMPLES = 4;

// "Open Segments" mark from the design canvas: a hoop of seven segments with one piece missing.
// SVG reference (viewBox 0 0 100 100): circle r=28, stroke 11, dasharray 15.99 6 (x6) 15.99 27.99, rotate(-87).
const DASH = 15.99;
const GAP = 6;
const PATTERN = 7 * DASH + 6 * GAP + 27.99;
const START = (-87 * Math.PI) / 180;

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function onSegment(x, y, g) {
  const dx = x - g.cx;
  const dy = y - g.cy;
  if (Math.abs(Math.hypot(dx, dy) - g.radius) > g.thickness / 2) return false;
  let angle = Math.atan2(dy, dx) - START;
  angle = ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const along = (angle / (2 * Math.PI)) * PATTERN;
  for (let i = 0; i < 7; i++) {
    const from = i * (DASH + GAP);
    if (along >= from && along <= from + DASH) return true;
  }
  return false;
}

function mix(a, b, t) {
  return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t));
}

function render(size, options) {
  const g = { cx: size / 2, cy: size / 2, radius: size * options.radius, thickness: size * options.thickness };
  const box = g.radius;
  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let hits = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          if (onSegment(x + (sx + 0.5) / SAMPLES, y + (sy + 0.5) / SAMPLES, g)) hits += 1;
        }
      }
      const coverage = hits / (SAMPLES * SAMPLES);
      const t = Math.min(1, Math.max(0, (x - (g.cx - box) + (y - (g.cy - box))) / (4 * box)));
      const ink = options.ink === 'gradient' ? mix(SEG_FROM, SEG_TO, t) : options.ink;
      const at = (y * size + x) * 4;
      if (!options.background) {
        pixels[at] = ink[0];
        pixels[at + 1] = ink[1];
        pixels[at + 2] = ink[2];
        pixels[at + 3] = Math.round(coverage * 255);
      } else {
        const bg = mix(BG_TOP, BG_BOTTOM, y / (size - 1));
        const out = mix(bg, ink, coverage);
        pixels[at] = out[0];
        pixels[at + 1] = out[1];
        pixels[at + 2] = out[2];
        pixels[at + 3] = 255;
      }
    }
  }
  return encodePng(size, pixels);
}

function gradientSquare(size) {
  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    const c = mix(BG_TOP, BG_BOTTOM, y / (size - 1));
    for (let x = 0; x < size; x++) {
      const at = (y * size + x) * 4;
      pixels[at] = c[0];
      pixels[at + 1] = c[1];
      pixels[at + 2] = c[2];
      pixels[at + 3] = 255;
    }
  }
  return encodePng(size, pixels);
}

const files = {
  'icon.png': render(1024, { radius: 0.28, thickness: 0.11, ink: 'gradient', background: true }),
  'android-icon-foreground.png': render(1024, { radius: 0.153, thickness: 0.06, ink: 'gradient', background: false }),
  'android-icon-monochrome.png': render(1024, { radius: 0.153, thickness: 0.06, ink: WHITE, background: false }),
  'android-icon-background.png': gradientSquare(1024),
  'splash-icon.png': render(512, { radius: 0.3, thickness: 0.118, ink: 'gradient', background: false }),
  'favicon.png': render(64, { radius: 0.28, thickness: 0.11, ink: 'gradient', background: true }),
};

for (const [name, data] of Object.entries(files)) fs.writeFileSync(path.join(OUT, name), data);
