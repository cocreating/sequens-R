import { readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const assetDirectory = new URL('../dist/assets/', import.meta.url);
const javascriptAssets = readdirSync(assetDirectory).filter((name) => name.endsWith('.js'));
const gzipBytes = javascriptAssets.reduce(
  (total, name) => total + gzipSync(readFileSync(new URL(name, assetDirectory))).byteLength,
  0,
);
const limitBytes = 200 * 1024;

if (gzipBytes > limitBytes) {
  throw new Error(`Initial JavaScript is ${gzipBytes} bytes gzip; the product budget allows ${limitBytes}.`);
}

console.log(`Initial JavaScript: ${(gzipBytes / 1024).toFixed(2)} KiB gzip / 200.00 KiB budget.`);
