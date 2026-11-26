/**
 * Derives the favicon and the app icons from public/logo-masvale.png, so the
 * browser tab and the home-screen icon carry the Masvale mark instead of the
 * Create React App default.
 *
 *   node scripts/make-icons.mjs
 *
 * Uses sharp, which ships with react-scripts' toolchain. Re-run whenever the
 * logo changes.
 */
import { stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "public", "logo-masvale.png");

const { default: sharp } = await import("sharp");

const sizes = [
  { file: "favicon.ico", size: 48 },
  { file: "logo192.png", size: 192 },
  { file: "logo512.png", size: 512 },
];

await stat(source);
const meta = await sharp(source).metadata();
console.log(`source: logo-masvale.png (${meta.width}x${meta.height})`);

for (const { file, size } of sizes) {
  const target = join(root, "public", file);
  const buffer = await sharp(source)
    .resize(size, size, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png()
    .toBuffer();

  // sharp cannot write .ico; a PNG named .ico is accepted by every current
  // browser, and the <link rel="icon"> in index.html points at it.
  await writeFile(target, buffer);
  const written = (await stat(target)).size;
  console.log(`  ${file.padEnd(14)} ${size}x${size}  ${(written / 1024).toFixed(1)} KB`);
}

console.log("\nDone. Commit public/favicon.ico, logo192.png and logo512.png.");
