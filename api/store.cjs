/**
 * Storage selection (CommonJS, for cPanel's require()-based loader).
 *
 * With MySQL credentials in the environment (`DB_NAME` or `DB_HOST`) the API
 * stores in MySQL/MariaDB; without them it falls back to the JSON-file store
 * below, so the service still runs for a quick local check.
 *
 * Both expose the same interface: meetings/quotes with all, findById, insert,
 * update and between.
 */
const { mkdir, readFile, rename, writeFile } = require("node:fs/promises");
const { dirname, join, resolve } = require("node:path");
const { randomUUID } = require("node:crypto");

const COLLECTIONS = ["meetings", "quotes", "catalog", "articles"];

const readJson = async (file, fallback) => {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return fallback;
  }
};

const createJsonStore = async ({ dataDir = "./data" } = {}) => {
  const dir = resolve(dataDir);
  await mkdir(dir, { recursive: true });

  const files = Object.fromEntries(
    COLLECTIONS.map((name) => [name, join(dir, `${name}.json`)])
  );

  const cache = {};
  for (const name of COLLECTIONS) {
    const rows = await readJson(files[name], []);
    cache[name] = Array.isArray(rows) ? rows : [];
  }

  const flush = async (name) => {
    const file = files[name];
    await mkdir(dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await writeFile(tmp, `${JSON.stringify(cache[name], null, 2)}\n`, "utf8");
    await rename(tmp, file); // atomic within the same directory
  };

  const collection = (name) => {
    if (!COLLECTIONS.includes(name)) throw new Error(`Unknown collection: ${name}`);

    return {
      async all() {
        return [...cache[name]].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      },
      async findById(id) {
        return cache[name].find((row) => row.id === id) ?? null;
      },

      async insert(record) {
        const row = {
          id: randomUUID(),
          createdAt: new Date().toISOString(),
          ...record,
        };
        cache[name].unshift(row);
        await flush(name);
        return row;
      },

      async update(id, patch) {
        const index = cache[name].findIndex((row) => row.id === id);
        if (index === -1) return null;
        cache[name][index] = {
          ...cache[name][index],
          ...patch,
          updatedAt: new Date().toISOString(),
        };
        await flush(name);
        return cache[name][index];
      },

      /** Meetings inside [from, to) ISO strings. */
      async between(from, to) {
        return cache[name]
          .filter((row) => {
            const start = row.startDateTime || row.createdAt;
            return start >= from && start < to;
          })
          .sort((a, b) => (a.startDateTime ?? "").localeCompare(b.startDateTime ?? ""));
      },

      async remove(id) {
        const index = cache[name].findIndex((row) => row.id === id);
        if (index === -1) return false;
        cache[name].splice(index, 1);
        await flush(name);
        return true;
      },
    };
  };

  return {
    driver: "json",
    location: dir,
    meetings: collection("meetings"),
    quotes: collection("quotes"),
    catalog: collection("catalog"),
    articles: collection("articles"),
    async close() {},
  };
};

/**
 * Picks the storage backend for a config: MySQL when it is configured, the JSON
 * files otherwise.
 *
 * If MySQL is configured but unreachable (wrong credentials, user without the
 * database assigned, server down) the API falls back to the JSON files instead
 * of crashing: the site keeps taking bookings and sending mail, and the agenda
 * keeps working. The reason is logged and /health reports which store is live.
 */
const createStore = async (config) => {
  if (config?.db?.enabled) {
    try {
      const { createMysqlStore } = require("./store-mysql.cjs");
      return await createMysqlStore({ config });
    } catch (error) {
      const hint =
        error.code === "ER_ACCESS_DENIED_ERROR"
          ? " Revisa DB_USER/DB_PASSWORD en cPanel (MySQL Databases) y que el usuario tenga la base asignada."
          : "";
      console.error(
        `[db] MySQL no disponible (${config.db.user}@${config.db.host}/${config.db.name}): ` +
          `${error.code ?? ""} ${error.message}.${hint} Se usará el almacén JSON.`
      );
    }
  }
  const store = await createJsonStore({ dataDir: config?.dataDir ?? "./data" });
  await seedArticles(store);
  return store;
};

/**
 * First run for the JSON fallback: seed the blog articles so the menu links
 * resolve even without MySQL. Only when the collection is empty, so edits made
 * later are never overwritten (same rule as the MySQL catalogue seed).
 */
const seedArticles = async (store) => {
  if (!store.articles) return;
  const existing = await store.articles.all();
  if (existing.length > 0) return;
  for (const article of require("./articles-seed.cjs")) {
    await store.articles.insert(article);
  }
};

module.exports = { createStore, createJsonStore };
module.exports.default = createStore;
