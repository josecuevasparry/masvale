/**
 * Downloads a portable ffmpeg build into tools/ (Windows). One-off helper.
 *
 *   node scripts/get-ffmpeg.mjs
 */
import { createWriteStream } from "node:fs";
import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const toolsDir = join(root, "tools");
const zipPath = join(toolsDir, "ffmpeg.zip");

const URLS = [
  "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip",
  "https://github.com/GyanD/codexffmpeg/releases/download/2024-12-26-git-8e2f3b6b1c/ffmpeg-2024-12-26-git-8e2f3b6b1c-essentials_build.zip",
];

await mkdir(toolsDir, { recursive: true });

for (const url of URLS) {
  try {
    console.log(`fetching ${url}`);
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await pipeline(Readable.fromWeb(res.body), createWriteStream(zipPath));
    const size = (await stat(zipPath)).size;
    if (size < 5 * 1024 * 1024) throw new Error(`suspicious size ${size}`);
    console.log(`saved ${(size / 1024 / 1024).toFixed(1)} MB to tools/ffmpeg.zip`);
    break;
  } catch (error) {
    console.warn(`  failed: ${error.message}`);
    await rm(zipPath, { force: true });
  }
}

if (!(await stat(zipPath).catch(() => null))) {
  throw new Error("Could not download ffmpeg from any mirror.");
}

// Extract with the built-in tar (bsdtar reads zip on Windows).
execFileSync("tar", ["-xf", zipPath, "-C", toolsDir], { stdio: "inherit" });

const dirs = await readdir(toolsDir, { withFileTypes: true });
const extracted = dirs.find((entry) => entry.isDirectory() && entry.name.startsWith("ffmpeg-"));
if (!extracted) throw new Error("No ffmpeg-* folder after extracting.");

// Flatten to tools/ffmpeg so callers have a stable path.
const target = join(toolsDir, "ffmpeg");
await rm(target, { recursive: true, force: true });
await rename(join(toolsDir, extracted.name), target);
await rm(zipPath, { force: true });

const bin = join(target, "bin", "ffmpeg.exe");
const version = execFileSync(bin, ["-version"], { encoding: "utf8" }).split("\n")[0];
console.log(`\n${version}`);
console.log(`ffmpeg ready at ${bin}`);
