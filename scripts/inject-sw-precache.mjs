import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const DIST_ROOT = "dist";
const ASSET_ROOT = path.join(DIST_ROOT, "assets");
const SW_PATH = path.join(DIST_ROOT, "sw.js");
const CACHE_KEY_SOURCE = 'const BUILD_CACHE_KEY = "dev";';
const PRECACHE_SOURCE = "const BUILD_ASSET_PRECACHE = [];";
const OFFLINE_ASSET_EXTENSIONS = new Set([
  ".js",
  ".css",
  ".woff",
  ".woff2",
  ".png",
  ".svg",
  ".webp",
  ".jpg",
  ".jpeg",
  ".gif",
  ".avif",
  ".wasm",
]);

function walkFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(fullPath) : [fullPath];
  });
}

assert(statSync(path.join(DIST_ROOT, "index.html")).isFile(), "dist/index.html is missing");
assert(statSync(SW_PATH).isFile(), "dist/sw.js is missing");
assert(statSync(ASSET_ROOT).isDirectory(), "dist/assets is missing");

const assetUrls = walkFiles(ASSET_ROOT)
  .filter((file) => OFFLINE_ASSET_EXTENSIONS.has(path.extname(file).toLowerCase()))
  .map((file) => "/" + path.relative(DIST_ROOT, file).split(path.sep).join("/"))
  .sort();

assert(assetUrls.some((url) => url.endsWith(".js")), "No built JavaScript assets found");
assert(assetUrls.some((url) => url.endsWith(".css")), "No built CSS assets found");

const precacheUrls = ["/", "/index.html", ...assetUrls];

const buildHash = createHash("sha256");
for (const url of ["/index.html", ...assetUrls]) {
  const diskPath = path.join(DIST_ROOT, url.slice(1));
  buildHash.update(url);
  buildHash.update(readFileSync(diskPath));
}
const buildCacheKey = buildHash.digest("hex").slice(0, 12);

const originalSw = readFileSync(SW_PATH, "utf8");
assert(originalSw.includes(CACHE_KEY_SOURCE), "Service worker cache-key injection marker is missing");
assert(originalSw.includes(PRECACHE_SOURCE), "Service worker precache injection marker is missing");

const builtSw = originalSw
  .replace(CACHE_KEY_SOURCE, `const BUILD_CACHE_KEY = "${buildCacheKey}";`)
  .replace(PRECACHE_SOURCE, `const BUILD_ASSET_PRECACHE = ${JSON.stringify(precacheUrls, null, 2)};`);

assert(!builtSw.includes(CACHE_KEY_SOURCE), "Build cache key was not injected");
assert(!builtSw.includes(PRECACHE_SOURCE), "Build asset precache list was not injected");
for (const url of precacheUrls) {
  assert(builtSw.includes(JSON.stringify(url)), `Service worker is missing ${url}`);
}

writeFileSync(SW_PATH, builtSw);
console.log(`Injected offline app shell: ${precacheUrls.length} files, cache key ${buildCacheKey}`);
