/**
 * One-off check: does the automatic column migration work on the local database?
 * Run with: node scripts/check-migration.mjs
 */
import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: "127.0.0.1",
  port: 3306,
  user: "root",
  password: "",
  database: "masvale",
});

const columns = async (table) => {
  const [rows] = await pool.query(
    "SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'masvale' AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION",
    [table]
  );
  return rows.map((row) => row.name);
};

const { ensureSchema, ensureColumns } = await import("../api/schema-check.cjs");

for (const table of ["meetings", "quotes"]) {
  console.log(`[${table}] antes:   ${(await columns(table)).join(", ")}`);
}
await ensureSchema(pool, { label: "local" });
console.log("migracion:       ", JSON.stringify(await ensureColumns(pool, { label: "local" })));
for (const table of ["meetings", "quotes"]) {
  console.log(`[${table}] despues: ${(await columns(table)).join(", ")}`);
}
console.log("segunda pasada:  ", JSON.stringify(await ensureColumns(pool, { label: "local" })));

const [meetings] = await pool.query("SELECT COUNT(*) AS c FROM meetings");
const [quotes] = await pool.query("SELECT COUNT(*) AS c FROM quotes");
console.log(`guardado: ${meetings[0].c} reuniones, ${quotes[0].c} cotizaciones`);

await pool.end();
