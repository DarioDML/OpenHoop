const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const OUT = path.join(__dirname, '..', 'assets', 'images');
const BACKGROUND = [14, 17, 22];
const ACCENT = [94, 200, 177];
const WHITE = [255, 255, 255];
const SAMPLES = 4;

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

function arcCoverage(x, y, geometry) {
  const dx = x - geometry.cx;
  const dy = y - geometry.cy;
  let angle = Math.atan2(dy, dx) - geometry.start;
  angle = ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  let clamped = angle;
  if (angle > geometry.sweep) {
    const toEnd = angle - geometry.sweep;
    const toStart = 2 * Math.PI - angle;
    clamped = toEnd < toStart ? geometry.sweep : 0;
  }
  const theta = geometry.start + clamped;
  const px = geometry.cx + geometry.radius * Math.cos(theta);
  const py = geometry.cy + geometry.radius * Math.sin(theta);
  return Math.hypot(x - px, y - py) <= geometry.thickness / 2;
}

function render(size, options) {
  const geometry = {
    cx: size / 2,
    cy: size / 2,
    radius: size * options.radius,
    thickness: size * options.thickness,
    start: (-60 * Math.PI) / 180,
    sweep: (290 * Math.PI) / 180,
  };
  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let hits = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          if (arcCoverage(x + (sx + 0.5) / SAMPLES, y + (sy + 0.5) / SAMPLES, geometry)) hits += 1;
        }
      }
      const coverage = hits / (SAMPLES * SAMPLES);
      const at = (y * size + x) * 4;
      const ink = options.ink;
      if (options.background === null) {
        pixels[at] = ink[0];
        pixels[at + 1] = ink[1];
        pixels[at + 2] = ink[2];
        pixels[at + 3] = Math.round(coverage * 255);
      } else {
        const bg = options.background;
        pixels[at] = Math.round(bg[0] + (ink[0] - bg[0]) * coverage);
        pixels[at + 1] = Math.round(bg[1] + (ink[1] - bg[1]) * coverage);
        pixels[at + 2] = Math.round(bg[2] + (ink[2] - bg[2]) * coverage);
        pixels[at + 3] = 255;
      }
    }
  }
  return encodePng(size, pixels);
}

function solid(size, color) {
  const pixels = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    pixels[i * 4] = color[0];
    pixels[i * 4 + 1] = color[1];
    pixels[i * 4 + 2] = color[2];
    pixels[i * 4 + 3] = 255;
  }
  return encodePng(size, pixels);
}

const files = {
  'icon.png': render(1024, { radius: 0.3, thickness: 0.115, ink: ACCENT, background: BACKGROUND }),
  'android-icon-foreground.png': render(1024, { radius: 0.2, thickness: 0.085, ink: ACCENT, background: null }),
  'android-icon-monochrome.png': render(1024, { radius: 0.2, thickness: 0.085, ink: WHITE, background: null }),
  'android-icon-background.png': solid(1024, BACKGROUND),
  'splash-icon.png': render(512, { radius: 0.3, thickness: 0.115, ink: ACCENT, background: null }),
  'favicon.png': render(64, { radius: 0.3, thickness: 0.115, ink: ACCENT, background: BACKGROUND }),
};

for (const [name, data] of Object.entries(files)) fs.writeFileSync(path.join(OUT, name), data);
