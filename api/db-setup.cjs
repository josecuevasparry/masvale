/**
 * Creates the database and tables for the Masvale API (CommonJS, cPanel-safe).
 *
 *   npm run db:setup            (uses api/.env or the process environment)
 *   node api/db-setup.cjs --print
 *
 * Locally that is XAMPP: DB_HOST=127.0.0.1, DB_USER=root, DB_PASSWORD= empty.
 * On cPanel the database and user already exist, so it only applies the tables.
 *
 * Safe to re-run: statements use IF NOT EXISTS and never drop data.
 */
const { existsSync, readFileSync } = require("node:fs");
const { dirname, resolve } = require("node:path");

const here = __dirname;

const envFile = resolve(here, ".env");
if (existsSync(envFile)) {
  try {
    require("dotenv").config({ path: envFile });
  } catch {
    // dotenv is optional
  }
}

const { loadConfig } = require("./config.cjs");
const config = loadConfig();

const host = config.db.host || "127.0.0.1";
const port = config.db.port || 3306;
const user = config.db.user || "root";
const password = config.db.password || "";
const name = config.db.name || "masvale";

const schema = readFileSync(resolve(here, "schema.sql"), "utf8");
// The schema file is written for phpMyAdmin import; here we create the database
// ourselves and select it, so the same file works in both places.
const schemaStatements = schema
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n")
  .split(";")
  .map((statement) => statement.trim())
  .filter(Boolean);

const statements = [
  `CREATE DATABASE IF NOT EXISTS \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  `USE \`${name}\``,
  ...schemaStatements,
];

const main = async () => {
  if (process.argv.includes("--print")) {
    console.log(`-- target ${user}@${host}:${port}/${name}`);
    statements.forEach((statement) => console.log(`${statement};`));
    return;
  }

  let mysql;
  try {
    mysql = require("mysql2/promise");
  } catch {
    console.error("Falta mysql2. Ejecuta: npm install");
    process.exitCode = 1;
    return;
  }

  let connection;
  try {
    connection = await mysql.createConnection({
      host,
      port,
      user,
      password,
      multipleStatements: false,
    });
  } catch (error) {
    console.error(`No se pudo conectar a MySQL en ${host}:${port} como ${user}.`);
    console.error(`  ${error.code ?? ""} ${error.message}`);
    console.error(
      "Revisa que MySQL esté corriendo (XAMPP > MySQL > Start) y las variables DB_* en api/.env."
    );
    process.exitCode = 1;
    return;
  }

  try {
    for (const statement of statements) {
      await connection.query(statement);
      if (/^create table/i.test(statement)) {
        console.log(`ok  ${statement.match(/`([^`]+)`/)?.[1] ?? statement.slice(0, 40)}`);
      }
    }

    await connection.query(`USE \`${name}\``);
    const [tables] = await connection.query("SHOW TABLES");
    const fields = tables.map((row) => Object.values(row)[0]);

    console.log(`\nBase de datos lista: ${name} (${user}@${host}:${port})`);
    console.log(`Tablas: ${fields.join(", ") || "(ninguna)"}`);
    console.log("\nConfigura el API con:");
    console.log(`  DB_HOST=${host}`);
    console.log(`  DB_PORT=${port}`);
    console.log(`  DB_USER=${user}`);
    console.log(`  DB_PASSWORD=${password ? "(tu contraseña)" : ""}`);
    console.log(`  DB_NAME=${name}`);
  } finally {
    await connection.end();
  }
};

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
