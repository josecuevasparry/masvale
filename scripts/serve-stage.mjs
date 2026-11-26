/**
 * Local check of deploy/stage: serves it the way Apache would with the packaged
 * .htaccess (real files pass through, unknown paths fall back to index.html).
 *
 *   node scripts/serve-stage.mjs [port]
 */
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const port = Number(process.argv[2] ?? 4191);
const root = resolve(process.cwd(), "deploy", "stage");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".mp4": "video/mp4",
  ".txt": "text/plain; charset=utf-8",
};

createServer(async (req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  let file = normalize(join(root, urlPath));

  if (!file.startsWith(root)) file = join(root, "index.html");

  try {
    const info = await stat(file);
    // A directory without an index.html falls through to the SPA shell, which
    // is what Apache does with the packaged .htaccess.
    if (info.isDirectory()) {
      const index = join(file, "index.html");
      try {
        await stat(index);
        file = index;
      } catch {
        file = join(root, "index.html");
      }
    }
  } catch {
    file = join(root, "index.html"); // SPA fallback, like the .htaccess
  }

  let info;
  try {
    info = await stat(file);
  } catch {
    res.statusCode = 404;
    res.end("not found");
    return;
  }
  res.setHeader("Content-Type", TYPES[extname(file)] ?? "application/octet-stream");
  res.setHeader("Content-Length", info.size);
  res.setHeader("Accept-Ranges", "bytes");

  const range = req.headers.range;
  if (range) {
    const [startRaw, endRaw] = range.replace("bytes=", "").split("-");
    const start = Number(startRaw) || 0;
    const end = endRaw ? Number(endRaw) : info.size - 1;
    res.statusCode = 206;
    res.setHeader("Content-Range", `bytes ${start}-${end}/${info.size}`);
    res.setHeader("Content-Length", end - start + 1);
    createReadStream(file, { start, end }).pipe(res);
    return;
  }

  createReadStream(file)
    .on("error", () => {
      res.statusCode = 500;
      res.end("error");
    })
    .pipe(res);
}).listen(port, "127.0.0.1", () => {
  console.log(`serving ${root} on http://127.0.0.1:${port}`);
});
