import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

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


const expectedPngAssets = {
  "icon-192-v7.png": [192, "e0b381dba4d732320bcc4bd37366a3216db159af6d486ed6716dcd099e8112a0"],
  "icon-512-v7.png": [512, "8e00b56913c8fb339dbfc0cf306ed4f7b5341bbdcb2a3fb62d0d6ed4dfddd4f7"],
  "apple-touch-icon-v7.png": [180, "517000bbcb5c6666f57c2132dc0bf342e086e6aa1813c2125476202060d5939b"],
  "favicon-32-v7.png": [32, "d1e1a53c63b7e6455416ed2cd0e5f974ae69b1929955659415b7a1f3dfb3a835"],
};
const expectedBinaryAssets = {
  "public/icons/icon-192-maskable-v8.webp": "724332557536894b99c774d8ecf234bab6a6f6e98c1a5884cecfd4a0ee6e7a4a",
  "public/icons/icon-512-maskable-v8.webp": "293ca1cebf7412d83843c31e0d975ea61218f97649029eb928ac7e5dbbc656da",
  "public/assets/twinly-header-logo-v2.png": "0023cee3c55edee162e6ea149511e73bf9af565dd8167990c66307ed52107237",
};
const checksum = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
assert.equal(checksum("public/icons/source-twinly-512-v7.webp"),
  "ef228ee999c501d9e5091a5460f0484e92e256cd119eb9967f9dfadb981964bb",
  "Unexpected or missing user-supplied high-quality source image");
for (const [name, [size, hash]] of Object.entries(expectedPngAssets)) {
  const path = `public/icons/${name}`;
  validatePng(path, size);
  assert.equal(checksum(path), hash, `Icon asset ${name} is not from the verified high-quality source`);
}
for (const [path, hash] of Object.entries(expectedBinaryAssets)) {
  assert.equal(checksum(path), hash, `Unexpected binary asset: ${path}`);
}
const manifest = JSON.parse(readFileSync("public/manifest.webmanifest", "utf8"));
assert.equal(manifest.id, "/");
assert.equal(manifest.display, "standalone");
const expectedManifestIcons = [
  {src:"/icons/icon-192-maskable-v8.webp",sizes:"192x192",type:"image/webp",purpose:"any maskable"},
  {src:"/icons/icon-512-maskable-v8.webp",sizes:"512x512",type:"image/webp",purpose:"any maskable"},
];
assert.deepEqual(manifest.icons, expectedManifestIcons, "Android install icon references changed");
const login = readFileSync("src/components/LoginScreen.tsx", "utf8");
const html = readFileSync("index.html", "utf8");
const sw = readFileSync("public/sw.js", "utf8");
assert(login.includes('src="/icons/icon-512-v7.png"'), "Login must use high-quality 512px icon");
assert(html.includes('href="/icons/apple-touch-icon-v7.png"'), "Missing refreshed 180px iOS home-screen icon");
assert(html.includes('href="/icons/favicon-32-v7.png"'), "Missing refreshed favicon");
assert(sw.includes('const SHELL_CACHE_VERSION = "twinly-shell-v20";'), "Old service-worker cache version");
assert(sw.includes('const BUILD_CACHE_KEY = "dev";'), "Missing build cache-key injection marker");
assert(sw.includes("const BUILD_ASSET_PRECACHE = [];"), "Missing build asset precache injection marker");
assert(sw.includes("/assets/twinly-launch-v2.mp4"), "Missing launch video precache");
for (const name of Object.keys(expectedPngAssets)) {
  if (name === "apple-touch-icon-v7.png" || name === "favicon-32-v7.png" ||
      name.startsWith("icon-")) {
    assert(sw.includes(`/icons/${name}`), `Service worker references missing ${name}`);
  }
}
for (const path of Object.keys(expectedBinaryAssets)) {
  const publicPath = path.replace(/^public/, "");
  assert(sw.includes(publicPath), `Service worker references missing ${publicPath}`);
}
console.log("Verified source integrity, PNG checksums, Android manifest, iOS icon, login and SW.");
