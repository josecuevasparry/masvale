/**
 * Inspects a media file enough to tell whether it will stream in a browser:
 * the container brand and whether the MOOV atom sits before the media data
 * (faststart), which is what lets <video> start before the file is fully
 * downloaded.
 *
 *   node scripts/inspect-media.mjs public/media/*.mp4
 */
import { open, readdir, stat } from "node:fs/promises";
import { join } from "node:path";

const list = async (target) => {
  const info = await stat(target);
  if (info.isDirectory()) {
    const entries = await readdir(target);
    return entries
      .filter((name) => /\.(mp4|mov|m4v|webm)$/i.test(name))
      .map((name) => join(target, name));
  }
  return [target];
};

const readBoxes = async (file, limit = 40) => {
  const handle = await open(file, "r");
  try {
    const { size } = await handle.stat();
    const boxes = [];
    let offset = 0;
    while (offset < size && boxes.length < limit) {
      const header = Buffer.alloc(16);
      const { bytesRead } = await handle.read(header, 0, 16, offset);
      if (bytesRead < 8) break;

      let boxSize = header.readUInt32BE(0);
      const type = header.toString("latin1", 4, 8);
      let headerSize = 8;
      if (boxSize === 1) {
        boxSize = Number(header.readBigUInt64BE(8));
        headerSize = 16;
      } else if (boxSize === 0) {
        boxSize = size - offset;
      }
      if (!/^[\x20-\x7e]{4}$/.test(type) || boxSize < headerSize) break;

      boxes.push({ type, offset, size: boxSize });

      // Descend one level for the container boxes that matter.
      if (["moov", "trak", "mdia", "minf", "stbl"].includes(type)) {
        offset += headerSize;
      } else {
        offset += boxSize;
      }
    }
    return { boxes, size };
  } finally {
    await handle.close();
  }
};

const targets = process.argv.slice(2);
const files = targets.length ? targets : ["public/media"];

for (const target of files) {
  for (const file of await list(target)) {
    const { boxes, size } = await readBoxes(file);
    const top = boxes.filter((box) => ["ftyp", "moov", "mdat", "free", "wide"].includes(box.type));
    const ftyp = top.find((box) => box.type === "ftyp");
    const moov = top.find((box) => box.type === "moov");
    const mdat = top.find((box) => box.type === "mdat");
    const faststart = moov && mdat ? moov.offset < mdat.offset : null;

    console.log(`\n${file}  (${(size / 1024 / 1024).toFixed(1)} MB)`);
    console.log(`  top-level boxes: ${top.map((b) => `${b.type}@${b.offset}`).join(", ")}`);
    console.log(`  brand: ${ftyp ? "ok" : "missing"}`);
    console.log(
      `  faststart: ${
        faststart === null
          ? "unknown"
          : faststart
            ? "yes (moov before mdat - streams fine)"
            : "NO (moov after mdat - needs remux for smooth autoplay)"
      }`
    );
  }
}
