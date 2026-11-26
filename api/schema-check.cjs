/**
 * Startup check for the MySQL schema.
 *
 * A shared host makes it easy to deploy the API but forget the phpMyAdmin
 * import; without this the first booking fails with a cryptic SQL error. Here we
 * verify the tables exist and, if they do not, try to create them (the cPanel
 * user usually has CREATE rights) or explain exactly what to run.
 */
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const TABLES = ["meetings", "quotes", "catalog", "articles"];

/**
 * Columns added after the first release. CREATE TABLE IF NOT EXISTS does nothing
 * on a table that already exists, so a new field would silently stay missing on
 * a database created earlier and every insert would fail with "Unknown column".
 * Each entry is added with ALTER TABLE when the table does not have it yet.
 */
const REQUIRED_COLUMNS = {
  meetings: {
    product: "VARCHAR(200) NULL AFTER email",
  },
  quotes: {
    product: "VARCHAR(200) NULL AFTER email",
  },
};

const readSchemaStatements = () => {
  try {
    const sql = readFileSync(join(__dirname, "schema.sql"), "utf8");
    // Strip full-line `--` comments BEFORE splitting on `;`: several comments in
    // the file contain semicolons (`**UTC**;`, `-- USE masvale;`, ALTER hints),
    // which would otherwise split a statement mid-table and break auto-creation.
    const withoutComments = sql
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    return withoutComments
      .split(";")
      .map((statement) => statement.trim())
      .filter((statement) => /^create table/i.test(statement));
  } catch {
    return [];
  }
};

const ensureSchema = async (pool, { label = "" } = {}) => {
  const [rows] = await pool.query("SHOW TABLES");
  const existing = rows.map((row) => Object.values(row)[0]);
  const missing = TABLES.filter((table) => !existing.includes(table));
  if (missing.length === 0) return true;

  const statements = readSchemaStatements();
  const usable = statements.filter((statement) =>
    missing.some((table) => new RegExp(`create table if not exists ${table}`, "i").test(statement))
  );

  if (usable.length === 0) {
    console.warn(
      `[db] faltan las tablas ${missing.join(", ")} en ${label}. Importa api/schema.sql en phpMyAdmin.`
    );
    return false;
  }

  try {
    for (const statement of usable) await pool.query(statement);
    console.log(`[db] tablas creadas: ${missing.join(", ")} (${label})`);
    return true;
  } catch (error) {
    console.warn(
      `[db] no se pudieron crear ${missing.join(", ")} en ${label}: ${error.code ?? ""} ${error.message}` +
        "\n     Importa api/schema.sql desde phpMyAdmin."
    );
    return false;
  }
};

/**
 * Adds the columns a table is missing, one ALTER per column. Best effort: if the
 * database user cannot ALTER, the message says exactly what to run in
 * phpMyAdmin instead of failing the whole startup.
 *
 * @returns {Promise<{added: string[], failed: string[]}>}
 */
const ensureColumns = async (pool, { label = "" } = {}) => {
  const added = [];
  const failed = [];

  for (const [table, columns] of Object.entries(REQUIRED_COLUMNS)) {
    let present;
    try {
      const [rows] = await pool.query(
        "SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
        [table]
      );
      present = rows.map((row) => row.name);
    } catch (error) {
      console.warn(`[db] no se pudo revisar las columnas de ${table}: ${error.code ?? ""} ${error.message}`);
      continue;
    }

    for (const [column, definition] of Object.entries(columns)) {
      if (present.includes(column)) continue;
      try {
        await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
        added.push(`${table}.${column}`);
      } catch (error) {
        failed.push(`${table}.${column}`);
        console.warn(
          `[db] falta la columna ${table}.${column} y no se pudo crear (${error.code ?? ""} ${error.message}).` +
            `\n     Ejecuta en phpMyAdmin: ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition};`
        );
      }
    }
  }

  if (added.length) console.log(`[db] columnas agregadas: ${added.join(", ")} (${label})`);
  return { added, failed };
};

module.exports = { ensureSchema, ensureColumns, readSchemaStatements, TABLES, REQUIRED_COLUMNS };
