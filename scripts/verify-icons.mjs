import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import assert from "node:assert/strict";

const PNG_SIGNATURE = Buffer.from("89504e470d0a1a0a", "hex");

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let n = 0; n < 8; n++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function validatePng(path, expectedSize) {
  const bytes = readFileSync(path);
  assert(bytes.subarray(0, 8).equals(PNG_SIGNATURE), `${path}: invalid PNG signature`);
  let offset = 8, width, height, bitDepth, colorType, interlace, ended = false;
  const imageData = [];
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    assert(offset + length + 12 <= bytes.length, `${path}: truncated PNG chunk`);
    const kind = bytes.toString("ascii", offset + 4, offset + 8);
    const payload = bytes.subarray(offset + 8, offset + 8 + length);
    const expectedCrc = bytes.readUInt32BE(offset + 8 + length);
    const actualCrc = crc32(bytes.subarray(offset + 4, offset + 8 + length));
    assert.equal(actualCrc, expectedCrc, `${path}: corrupt ${kind} CRC`);
    if (kind === "IHDR") {
      assert.equal(length, 13, `${path}: invalid header`);
      width = payload.readUInt32BE(0);
      height = payload.readUInt32BE(4);
      bitDepth = payload[8];
      colorType = payload[9];
      interlace = payload[12];
    } else if (kind === "IDAT") {
      imageData.push(payload);
    } else if (kind === "IEND") {
      ended = true;
      offset += length + 12;
      break;
    }
    offset += length + 12;
  }
  assert(ended && offset === bytes.length, `${path}: PNG missing IEND or trailing bytes`);
  assert(width === expectedSize && height === expectedSize, `${path}: expected ${expectedSize}x${expectedSize}, got ${width}x${height}`);
  assert.equal(interlace, 0, `${path}: unsupported interlaced PNG`);
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  assert(channels && bitDepth, `${path}: invalid pixel format`);
  const rowBytes = Math.ceil(width * channels * bitDepth / 8);
  const pixels = inflateSync(Buffer.concat(imageData));
  assert.equal(pixels.length, height * (rowBytes + 1), `${path}: missing image rows`);
  for (let row = 0; row < height; row++) {
    assert(pixels[row * (rowBytes + 1)] <= 4, `${path}: invalid PNG row filter`);
  }
  console.log(`Verified ${path}: ${width}x${height}, decoded ${pixels.length} bytes`);
}

const icons = [
  ["icon-192-v5.png", 192],
  ["icon-512-v5.png", 512],
  ["apple-touch-icon-v5.png", 180],
  ["favicon-32-v5.png", 32],
];
for (const [name, size] of icons) {
  validatePng(`public/icons/${name}`, size);
}

const manifest = JSON.parse(readFileSync("public/manifest.webmanifest", "utf8"));
assert(manifest.id === "/" && manifest.display === "standalone");
for (const [name, size] of icons.slice(0, 2)) {
  assert(manifest.icons.some((icon) =>
    icon.src === `/icons/${name}` &&
    icon.sizes === `${size}x${size}` &&
    icon.type === "image/png"
  ), `Manifest is missing valid ${size}px PNG`);
}
const login = readFileSync("src/components/LoginScreen.tsx", "utf8");
const html = readFileSync("index.html", "utf8");
assert(login.includes("/icons/icon-192-v5.png"), "Login does not use verified icon");
assert(html.includes("/icons/apple-touch-icon-v5.png"), "Missing iOS touch icon");
console.log("Manifest and UI icon references verified");
