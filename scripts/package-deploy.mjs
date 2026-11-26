/**
 * Packages the whole Masvale app into one Node application:
 *
 *   deploy/api.zip   API + the built React frontend, served by one process
 *
 *   node scripts/package-deploy.mjs
 *
 * One Express process serves /api and the static React build (with SPA fallback)
 * from the same folder, so the deploy needs no public_html, no subdomain and no
 * CORS configuration. Extract the zip into a folder like /home/<user>/api.
 */
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const deployDir = join(root, "deploy");

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

const sizeOf = async (dir) => {
  let bytes = 0;
  for (const file of await filesUnder(dir)) bytes += (await stat(file)).size;
  return bytes;
};

const zipDir = (sourceDir, zipPath) => {
  execFileSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      `Compress-Archive -Path '${sourceDir}\\*' -DestinationPath '${zipPath}' -Force`,
    ],
    { stdio: "inherit" }
  );
};

const stamp = new Date().toISOString().replace("T", " ").slice(0, 16);

// ------------------------------------------------------------- build check

const buildDir = join(root, "build");
if (!existsSync(join(buildDir, "index.html"))) {
  throw new Error('Falta build/index.html — ejecuta "npm run build" primero.');
}

// ---------------------------------------------------------------- api stage

const apiStage = join(deployDir, "stage-api");
await rm(apiStage, { recursive: true, force: true });
await mkdir(apiStage, { recursive: true });

const rootPkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));

const API_FILES = [
  "app.cjs",
  "articles-seed.cjs",
  "calendar.cjs",
  "catalog-seed.cjs",
  "config.cjs",
  "db-setup.cjs",
  "mailer.cjs",
  "routes.cjs",
  "schema-check.cjs",
  "server.cjs",
  "store.cjs",
  "store-mysql.cjs",
  "schema.sql",
  "README.md",
  ".env.example",
];

for (const file of API_FILES) {
  const from = join(root, "api", file);
  if (!existsSync(from)) continue;
  await cp(from, join(apiStage, file));
}

// Standalone pages served at /sitio/* (the Test Silogice quiz, etc.).
const sitioDir = join(root, "api", "sitio");
if (existsSync(sitioDir)) {
  await cp(sitioDir, join(apiStage, "sitio"), { recursive: true });
}

// The built React frontend ships INSIDE the app folder, served by Express.
await cp(buildDir, join(apiStage, "build"), { recursive: true });
for (const file of await filesUnder(join(apiStage, "build"))) {
  if (file.endsWith(".map")) await rm(file);
}

// Article pictures are written here and served at /uploads.
await mkdir(join(apiStage, "uploads"), { recursive: true });

// Minimal manifest: only what the service imports at runtime. CommonJS, because
// cPanel's "Setup Node.js App" (Passenger) loads the startup file with require().
const apiPkg = {
  name: "masvale-api",
  version: rootPkg.version,
  private: true,
  main: "server.cjs",
  engines: { node: ">=18" },
  scripts: {
    start: "node server.cjs",
    dev: "node --watch server.cjs",
    "db:setup": "node db-setup.cjs",
  },
  dependencies: {
    dotenv: rootPkg.dependencies.dotenv,
    express: rootPkg.dependencies.express,
    googleapis: rootPkg.dependencies.googleapis,
    mysql2: rootPkg.dependencies.mysql2,
    nodemailer: rootPkg.dependencies.nodemailer,
  },
};

await writeFile(join(apiStage, "package.json"), `${JSON.stringify(apiPkg, null, 2)}\n`);

await writeFile(
  join(apiStage, "DEPLOY.md"),
  `# Masvale — despliegue (todo servido por Node, mismo dominio)

Empaquetado: ${stamp}

Un solo proceso **Node.js/Express** sirve la **API** (\`/api/*\`) y el **frontend
React** (los archivos estáticos de \`build/\`, con fallback a \`index.html\` para las
rutas del SPA). No hace falta subir nada a \`public_html\`, ni crear un subdominio,
ni configurar CORS: todo vive en el mismo dominio.

## 1. Base de datos (una vez)

1. cPanel → **MySQL® Databases**: crea la base y un usuario, y asígnalo con
   **ALL PRIVILEGES**. cPanel antepone tu cuenta (\`masvalec_\`).
2. No hace falta importar \`schema.sql\` a mano: al arrancar, el API crea las tablas
   que falten y siembra el catálogo y los artículos.

## 2. Subir la app

- **Carpeta:** \`api\` (cualquier nombre sirve).
- **Ubicación:** en la raíz de la cuenta (\`/home4/masvalec/api\`), al mismo nivel
  que \`public_html\`. **NO dentro de \`public_html\`.**

Sube \`api.zip\` y extráelo. Debe quedar una carpeta \`api/\` con:
\`server.cjs\`, \`build/\`, \`uploads/\`, \`package.json\`, \`.env.example\`, etc.

## 3. Configurar \`.env\`

Renombra \`.env.example\` a \`.env\` y completa:

\`\`\`
PORT=4000                         # cPanel lo ignora y asigna el suyo
ADMIN_TOKEN=<cadena larga>        # lo pide /agenda y /admin/articulos
DB_HOST=localhost
DB_PORT=3306
DB_USER=masvalec_<usuario>
DB_PASSWORD=<clave>
DB_NAME=masvalec_<base>
# Opcional (correo real; sin SMTP los correos se imprimen en la consola):
SMTP_HOST=mail.masvale.cl
SMTP_PORT=587
SMTP_USER=josecuevasparry@masvale.cl
SMTP_PASS=<clave>
SMTP_FROM=Masvale Consultores <josecuevasparry@masvale.cl>
\`\`\`

## 4. Crear la aplicación Node

**Setup Node.js App → Create Application**:

- **Node.js version:** 18 o superior
- **Application root:** \`api\`
- **Application URL:** \`masvale.cl\` (el dominio principal)
- **Application startup file:** \`server.cjs\`

Luego **Run NPM Install** y **Restart**.

> cPanel asigna el puerto interno y hace el proxy al dominio automáticamente.

## 5. Probar

- \`https://masvale.cl\` → la web (catálogo y blog).
- \`https://masvale.cl/health\` → JSON \`{"ok":true,...,"store":"mysql"}\`.
- \`https://masvale.cl/agenda\` → panel (pide \`ADMIN_TOKEN\`).
- \`https://masvale.cl/admin/articulos\` → CRUD de artículos.

## Notas

- Las fotos de los artículos se guardan en \`api/uploads/\` y se sirven en \`/uploads\`.
- El frontend llama a \`/api\` en el mismo dominio (mismo origen, sin CORS).
- Si el arranque falla, revisa \`startup-error.log\` junto a \`server.cjs\`; además el
  API responde un JSON 503 con el motivo exacto.
- Borra cualquier \`public_html\` viejo (o el sitio estático anterior) para que el
  dominio apunte solo a esta app.
`
);

// --------------------------------------------------------------------- zip

await mkdir(deployDir, { recursive: true });
const apiZip = join(deployDir, "api.zip");
await rm(apiZip, { force: true });
await rm(join(deployDir, "masvale-api.zip"), { force: true });
await rm(join(deployDir, "masvale-sitio.zip"), { force: true });
await rm(join(deployDir, "stage"), { recursive: true, force: true });

zipDir(apiStage, apiZip);

const apiFiles = await filesUnder(apiStage);
const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

console.log(`\nAPI   api.zip   ${apiFiles.length} files, ${mb(await sizeOf(apiStage))} unpacked`);
console.log(`\nStage folder kept for inspection: ${relative(root, apiStage)}`);
console.log(`Upload the CONTENTS of api.zip into /home/<user>/api (or extract it there).`);
