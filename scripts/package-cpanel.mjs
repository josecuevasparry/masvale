/**
 * Packages build/ for a cPanel upload.
 *
 *   node scripts/package-cpanel.mjs                -> deploy/masvale-sitio.zip (root deploy)
 *   node scripts/package-cpanel.mjs /masvale       -> same, but URLs are prefixed for a subfolder
 *
 * The prefix is applied to a copy of the build, so `npm run build` output stays
 * untouched and the script can be re-run for either target.
 */
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const buildDir = join(root, "build");
const deployDir = join(root, "deploy");
const stageDir = join(deployDir, "stage");

const prefix = (process.argv[2] ?? "").trim().replace(/^\/+|\/+$/g, "");
const base = prefix ? `/${prefix}` : "";

const HTACCESS = `# Masvale Consultores - SPA hosted on cPanel/Apache.
Options -MultiViews
DirectoryIndex index.html

<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase ${base || "/"}

  # Let real files and directories through (assets, media, fonts).
  RewriteCond %{REQUEST_FILENAME} -f [OR]
  RewriteCond %{REQUEST_FILENAME} -d
  RewriteRule ^ - [L]

  # Everything else is a client-side route: serve the app.
  RewriteRule ^ index.html [L]
</IfModule>

# Hashed assets never change, so cache them hard. index.html must not be cached.
<IfModule mod_expires.c>
  ExpiresActive On
  ExpiresByType text/css "access plus 1 year"
  ExpiresByType application/javascript "access plus 1 year"
  ExpiresByType font/woff2 "access plus 1 year"
  ExpiresByType image/png "access plus 1 year"
  ExpiresByType image/svg+xml "access plus 1 year"
  ExpiresByType image/jpeg "access plus 1 year"
  ExpiresByType video/mp4 "access plus 1 month"
</IfModule>

<IfModule mod_headers.c>
  <FilesMatch "index\\.html$">
    Header set Cache-Control "no-cache, must-revalidate"
  </FilesMatch>
</IfModule>

<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/css application/javascript application/json image/svg+xml
</IfModule>
`;

const require_ = async (path) => {
  try {
    await stat(path);
  } catch {
    throw new Error(`Missing ${relative(root, path)} - run "npm run build" first.`);
  }
};

const filesUnder = async (dir) => {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await filesUnder(full)));
    else files.push(full);
  }
  return files;
};

await require_(join(buildDir, "index.html"));

await rm(stageDir, { recursive: true, force: true });
await mkdir(stageDir, { recursive: true });
await cp(buildDir, stageDir, { recursive: true });

// Source maps are only useful in development.
for (const file of await filesUnder(stageDir)) {
  if (file.endsWith(".map")) await rm(file);
}

await writeFile(join(stageDir, ".htaccess"), HTACCESS, "utf8");

if (base) {
  // Rewrite the absolute URLs in the shell files for a subfolder deployment.
  for (const name of ["index.html", "manifest.json", "asset-manifest.json", "robots.txt"]) {
    const file = join(stageDir, name);
    try {
      const original = await readFile(file, "utf8");
      await writeFile(file, original.replaceAll('"/', `"${base}/`), "utf8");
    } catch {
      // optional file
    }
  }
  console.log(`Prefixed asset URLs with ${base}`);
}

const zipPath = join(deployDir, "masvale-sitio.zip");
await mkdir(deployDir, { recursive: true });
await rm(zipPath, { force: true });

// Zip from inside the stage so the archive has no extra top-level folder.
execFileSync(
  "powershell",
  [
    "-NoProfile",
    "-Command",
    `Compress-Archive -Path '${stageDir}\\*' -DestinationPath '${zipPath}' -Force`,
  ],
  { stdio: "inherit" }
);

const files = await filesUnder(stageDir);
let bytes = 0;
for (const file of files) bytes += (await stat(file)).size;

console.log(`\n${files.length} files, ${(bytes / 1024 / 1024).toFixed(1)} MB unpacked`);
console.log(`Wrote ${relative(root, zipPath)}`);
console.log(
  `Upload the CONTENTS of the zip into public_html${base || ""} (or extract it there).`
);
