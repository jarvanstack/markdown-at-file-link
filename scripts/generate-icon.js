const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const size = 128;
const pixels = Buffer.alloc(size * size * 4);

for (let y = 0; y < size; y += 1) {
  for (let x = 0; x < size; x += 1) {
    const i = (y * size + x) * 4;
    const t = y / (size - 1);
    pixels[i] = Math.round(22 + 9 * t);
    pixels[i + 1] = Math.round(96 + 42 * t);
    pixels[i + 2] = Math.round(235 - 26 * t);
    pixels[i + 3] = 255;
  }
}

roundRect(10, 10, 108, 108, 18, [255, 255, 255, 28]);
roundRect(20, 22, 88, 84, 10, [255, 255, 255, 238]);

drawTextLikeAtMark();
drawLinkBar();

const png = encodePng(size, size, pixels);
const output = path.join(__dirname, '..', 'images', 'icon.png');

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, png);
console.log(`Generated ${output}`);

function drawTextLikeAtMark() {
  drawCircle(51, 59, 25, [31, 111, 235, 255]);
  drawCircle(51, 59, 13, [255, 255, 255, 255]);
  drawCircle(51, 59, 6, [31, 111, 235, 255]);
  drawRect(72, 56, 15, 9, [31, 111, 235, 255]);
  drawRect(81, 36, 8, 29, [31, 111, 235, 255]);
  drawCircle(75, 42, 14, [31, 111, 235, 255], (x, y) => x >= 75 || y >= 42);
  drawCircle(75, 42, 7, [255, 255, 255, 255], (x, y) => x >= 75 || y >= 42);
}

function drawLinkBar() {
  drawRect(36, 86, 56, 8, [31, 111, 235, 255]);
  drawCircle(36, 90, 4, [31, 111, 235, 255]);
  drawCircle(92, 90, 4, [31, 111, 235, 255]);
  drawRect(48, 80, 32, 4, [31, 111, 235, 255]);
}

function roundRect(x, y, width, height, radius, rgba) {
  for (let py = y; py < y + height; py += 1) {
    for (let px = x; px < x + width; px += 1) {
      const dx = Math.max(x - px, 0, px - (x + width - 1));
      const dy = Math.max(y - py, 0, py - (y + height - 1));
      const cornerX = px < x + radius ? x + radius : px >= x + width - radius ? x + width - radius - 1 : px;
      const cornerY = py < y + radius ? y + radius : py >= y + height - radius ? y + height - radius - 1 : py;
      const inCorner = px !== cornerX || py !== cornerY;
      if (dx !== 0 || dy !== 0 || (inCorner && distance(px, py, cornerX, cornerY) > radius)) {
        continue;
      }
      blendPixel(px, py, rgba);
    }
  }
}

function drawRect(x, y, width, height, rgba) {
  for (let py = y; py < y + height; py += 1) {
    for (let px = x; px < x + width; px += 1) {
      blendPixel(px, py, rgba);
    }
  }
}

function drawCircle(cx, cy, radius, rgba, predicate = () => true) {
  for (let y = cy - radius; y <= cy + radius; y += 1) {
    for (let x = cx - radius; x <= cx + radius; x += 1) {
      if (distance(x, y, cx, cy) <= radius && predicate(x, y)) {
        blendPixel(x, y, rgba);
      }
    }
  }
}

function blendPixel(x, y, rgba) {
  if (x < 0 || y < 0 || x >= size || y >= size) {
    return;
  }
  const i = (y * size + x) * 4;
  const alpha = rgba[3] / 255;
  pixels[i] = Math.round(rgba[0] * alpha + pixels[i] * (1 - alpha));
  pixels[i + 1] = Math.round(rgba[1] * alpha + pixels[i + 1] * (1 - alpha));
  pixels[i + 2] = Math.round(rgba[2] * alpha + pixels[i + 2] * (1 - alpha));
  pixels[i + 3] = 255;
}

function distance(x1, y1, x2, y2) {
  return Math.hypot(x1 - x2, y1 - y2);
}

function encodePng(width, height, rgba) {
  const scanlines = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const scanlineOffset = y * (width * 4 + 1);
    scanlines[scanlineOffset] = 0;
    rgba.copy(scanlines, scanlineOffset + 1, y * width * 4, (y + 1) * width * 4);
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr(width, height)),
    chunk('IDAT', zlib.deflateSync(scanlines)),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function ihdr(width, height) {
  const buffer = Buffer.alloc(13);
  buffer.writeUInt32BE(width, 0);
  buffer.writeUInt32BE(height, 4);
  buffer[8] = 8;
  buffer[9] = 6;
  buffer[10] = 0;
  buffer[11] = 0;
  buffer[12] = 0;
  return buffer;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
