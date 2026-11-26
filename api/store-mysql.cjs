/**
 * MySQL store: same interface as the JSON store, backed by MySQL/MariaDB.
 * CommonJS, for cPanel's require()-based Node.js App loader.
 *
 * Rows are mapped to the shapes the routes already speak:
 *   - camelCase fields: startDateTime, startLabel, calendarEvent, createdAt …
 *   - `users`/`intents` keep their names (the routes call them that);
 *   - `intents` is stored as a comma separated list and returned as an array.
 */
const { randomUUID } = require("node:crypto");

const toMysqlDate = (iso) => new Date(iso).toISOString().slice(0, 19).replace("T", " ");
const toIso = (value) =>
  value instanceof Date
    ? value.toISOString()
    : new Date(`${String(value).replace(" ", "T")}Z`).toISOString();

const splitIntents = (value) =>
  String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

/** Both tables are `id, kind, <own fields…>, created_at, updated_at`. */
const SCHEMA = {
  meetings: {
    fields: [
      "organization",
      "name",
      "email",
      "product",
      "mode",
      "location",
      "start_datetime",
      "end_datetime",
      "start_label",
      "notes",
      "source",
      "status",
      "calendar_event_id",
      "calendar_link",
      "meet_link",
    ],
    order: "start_datetime",
    toFields: (record) => ({
      organization: record.organization,
      name: record.name,
      email: record.email,
      product: record.product || null,
      mode: record.mode ?? "presencial",
      location: record.location ?? null,
      start_datetime: toMysqlDate(record.startDateTime),
      end_datetime: toMysqlDate(record.endDateTime),
      start_label: record.startLabel ?? null,
      notes: record.notes || null,
      source: record.source ?? null,
      status: record.status ?? "pendiente",
      calendar_event_id: record.calendarEvent?.id ?? null,
      calendar_link: record.calendarEvent?.htmlLink ?? null,
      meet_link: record.calendarEvent?.meetLink ?? null,
    }),
    fromRow: (row) => ({
      id: row.id,
      kind: row.kind,
      organization: row.organization,
      name: row.name,
      email: row.email,
      product: row.product ?? undefined,
      mode: row.mode,
      location: row.location ?? undefined,
      startDateTime: toIso(row.start_datetime),
      endDateTime: toIso(row.end_datetime),
      startLabel: row.start_label ?? undefined,
      notes: row.notes ?? undefined,
      source: row.source ?? undefined,
      status: row.status,
      ...(row.calendar_event_id
        ? {
            calendarEvent: {
              id: row.calendar_event_id,
              htmlLink: row.calendar_link,
              meetLink: row.meet_link,
            },
          }
        : {}),
      createdAt: toIso(row.created_at),
      ...(row.updated_at ? { updatedAt: toIso(row.updated_at) } : {}),
    }),
  },
  quotes: {
    fields: [
      "organization",
      "name",
      "email",
      "product",
      "users",
      "intents",
      "additional_services",
      "notes",
      "source",
      "status",
    ],
    order: "created_at",
    toFields: (record) => ({
      organization: record.organization,
      name: record.name,
      email: record.email,
      product: record.product || null,
      users: Number(record.users ?? 0),
      intents: (record.intents ?? []).join(","),
      additional_services: record.additionalServices || null,
      notes: record.notes || null,
      source: record.source ?? null,
      status: record.status ?? "pendiente",
    }),
    fromRow: (row) => ({
      id: row.id,
      kind: row.kind,
      organization: row.organization,
      name: row.name,
      email: row.email,
      product: row.product ?? undefined,
      users: Number(row.users),
      intents: splitIntents(row.intents),
      additionalServices: row.additional_services ?? undefined,
      notes: row.notes ?? undefined,
      source: row.source ?? undefined,
      status: row.status,
      createdAt: toIso(row.created_at),
      ...(row.updated_at ? { updatedAt: toIso(row.updated_at) } : {}),
    }),
  },
};

/**
 * Catalogue rows use their own shape: a slug `id`, no `kind`, and a boolean
 * `visible` plus `sort_order` for ordering. Media is reassembled from
 * `media_type` / `media_src`.
 */
const catalogFromRow = (row) => ({
  id: row.id,
  category: row.category,
  title: row.title,
  description: row.description ?? "",
  purchaseType: row.purchase_type ?? undefined,
  media:
    row.media_type && row.media_src
      ? { type: row.media_type, src: row.media_src }
      : undefined,
  poster: row.poster ?? undefined,
  picture: row.picture ?? undefined,
  pictureAlt: row.picture_alt ?? undefined,
  visible: Number(row.visible) === 1,
  sortOrder: Number(row.sort_order ?? 0),
  createdAt: toIso(row.created_at),
  ...(row.updated_at ? { updatedAt: toIso(row.updated_at) } : {}),
});

const catalogToFields = (record) => ({
  category: record.category,
  title: record.title,
  description: record.description ?? null,
  purchase_type: record.purchaseType ?? null,
  media_type: record.media?.type ?? null,
  media_src: record.media?.src ?? null,
  poster: record.poster ?? null,
  picture: record.picture ?? null,
  picture_alt: record.pictureAlt ?? null,
  visible: record.visible === false ? 0 : 1,
  sort_order: Number(record.sortOrder ?? 0),
});

/**
 * Articles use the WordPress shape: `id` is the slug, there is no `kind`, and
 * `published_at` may be null for drafts.
 */
const articleFromRow = (row) => ({
  id: row.id,
  title: row.title,
  excerpt: row.excerpt ?? "",
  content: row.content ?? "",
  picture: row.picture ?? undefined,
  pictureAlt: row.picture_alt ?? undefined,
  visible: Number(row.visible) === 1,
  sortOrder: Number(row.sort_order ?? 0),
  publishedAt: row.published_at ? toIso(row.published_at) : undefined,
  createdAt: toIso(row.created_at),
  ...(row.updated_at ? { updatedAt: toIso(row.updated_at) } : {}),
});

const articleToFields = (record) => ({
  title: record.title,
  excerpt: record.excerpt || null,
  content: record.content || null,
  picture: record.picture ?? null,
  picture_alt: record.pictureAlt ?? null,
  visible: record.visible === false ? 0 : 1,
  published_at: record.publishedAt ? toMysqlDate(record.publishedAt) : null,
  sort_order: Number(record.sortOrder ?? 0),
});

const createMysqlStore = async ({ config }) => {
  const mysql = require("mysql2/promise");
  const pool = mysql.createPool({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.name,
    waitForConnections: true,
    connectionLimit: config.db.connectionLimit,
    charset: "utf8mb4_unicode_ci",
  });

  // Fail fast with a clear message instead of at the first request.
  await pool.query("SELECT 1");

  const collection = (name) => {
    const { fields, order, toFields, fromRow } = SCHEMA[name];
    const allColumns = ["id", "kind", ...fields, "created_at", "updated_at"];

    return {
      async all() {
        const [rows] = await pool.query(`SELECT * FROM \`${name}\` ORDER BY created_at DESC`);
        return rows.map(fromRow);
      },

      async findById(id) {
        const [rows] = await pool.query(`SELECT * FROM \`${name}\` WHERE id = ? LIMIT 1`, [id]);
        return rows.length ? fromRow(rows[0]) : null;
      },

      async insert(record) {
        const row = { id: randomUUID(), createdAt: new Date().toISOString(), ...record };
        const mapped = toFields(row);
        const placeholders = allColumns.map(() => "?").join(", ");
        const values = [
          row.id,
          name === "meetings" ? "meeting" : "quote",
          ...fields.map((field) => mapped[field]),
          toMysqlDate(row.createdAt),
          null,
        ];
        await pool.query(
          `INSERT INTO \`${name}\` (${allColumns.map((c) => `\`${c}\``).join(", ")}) VALUES (${placeholders})`,
          values
        );
        const inserted = allColumns.reduce(
          (acc, column, index) => ({ ...acc, [column]: values[index] }),
          {}
        );
        return fromRow(inserted);
      },

      async update(id, patch) {
        const current = await this.findById(id);
        if (!current) return null;

        const mapped = toFields({ ...current, ...patch });
        const values = fields.map((field) => mapped[field]);
        const assignments = fields.map((field) => `\`${field}\` = ?`).join(", ");

        await pool.query(
          `UPDATE \`${name}\` SET ${assignments}, \`updated_at\` = ? WHERE id = ?`,
          [...values, toMysqlDate(new Date().toISOString()), id]
        );
        return this.findById(id);
      },

      /** Rows inside [from, to) ISO strings, oldest first. */
      async between(from, to) {
        const [rows] = await pool.query(
          `SELECT * FROM \`${name}\` WHERE \`${order}\` >= ? AND \`${order}\` < ? ORDER BY \`${order}\` ASC`,
          [toMysqlDate(from), toMysqlDate(to)]
        );
        return rows.map(fromRow);
      },
    };
  };

  const CATALOG_COLUMNS = [
    "id",
    "category",
    "title",
    "description",
    "purchase_type",
    "media_type",
    "media_src",
    "poster",
    "picture",
    "picture_alt",
    "visible",
    "sort_order",
  ];

  const catalog = {
    async all({ visibleOnly = false } = {}) {
      const where = visibleOnly ? "WHERE visible = 1" : "";
      const [rows] = await pool.query(
        `SELECT * FROM catalog ${where} ORDER BY sort_order ASC, title ASC`
      );
      return rows.map(catalogFromRow);
    },

    async findById(id) {
      const [rows] = await pool.query("SELECT * FROM catalog WHERE id = ? LIMIT 1", [id]);
      return rows.length ? catalogFromRow(rows[0]) : null;
    },

    async insert(record) {
      const fields = catalogToFields(record);
      const values = CATALOG_COLUMNS.map((column) =>
        column === "id" ? record.id : fields[column]
      );
      await pool.query(
        `INSERT INTO catalog (${CATALOG_COLUMNS.map((c) => `\`${c}\``).join(", ")}, created_at, updated_at) ` +
          `VALUES (${CATALOG_COLUMNS.map(() => "?").join(", ")}, ?, ?)`,
        [...values, toMysqlDate(new Date().toISOString()), null]
      );
      return this.findById(record.id);
    },

    async update(id, patch) {
      const current = await this.findById(id);
      if (!current) return null;
      const merged = catalogToFields({ ...current, ...patch });
      const columns = CATALOG_COLUMNS.filter((column) => column !== "id");
      await pool.query(
        `UPDATE catalog SET ${columns.map((c) => `\`${c}\` = ?`).join(", ")}, updated_at = ? WHERE id = ?`,
        [...columns.map((column) => merged[column]), toMysqlDate(new Date().toISOString()), id]
      );
      return this.findById(id);
    },

    async remove(id) {
      const [result] = await pool.query("DELETE FROM catalog WHERE id = ?", [id]);
      return result.affectedRows > 0;
    },
  };

  const ARTICLES_COLUMNS = [
    "id",
    "title",
    "excerpt",
    "content",
    "picture",
    "picture_alt",
    "visible",
    "published_at",
    "sort_order",
  ];

  const articles = {
    async all() {
      const [rows] = await pool.query(
        "SELECT * FROM articles ORDER BY sort_order ASC, published_at DESC, title ASC"
      );
      return rows.map(articleFromRow);
    },

    async findById(id) {
      const [rows] = await pool.query("SELECT * FROM articles WHERE id = ? LIMIT 1", [id]);
      return rows.length ? articleFromRow(rows[0]) : null;
    },

    async insert(record) {
      const fields = articleToFields(record);
      const values = ARTICLES_COLUMNS.map((column) =>
        column === "id" ? record.id : fields[column]
      );
      await pool.query(
        `INSERT INTO articles (${ARTICLES_COLUMNS.map((c) => `\`${c}\``).join(", ")}, created_at, updated_at) ` +
          `VALUES (${ARTICLES_COLUMNS.map(() => "?").join(", ")}, ?, ?)`,
        [...values, toMysqlDate(new Date().toISOString()), null]
      );
      return this.findById(record.id);
    },

    async update(id, patch) {
      const current = await this.findById(id);
      if (!current) return null;
      const merged = articleToFields({ ...current, ...patch });
      const columns = ARTICLES_COLUMNS.filter((column) => column !== "id");
      await pool.query(
        `UPDATE articles SET ${columns.map((c) => `\`${c}\` = ?`).join(", ")}, updated_at = ? WHERE id = ?`,
        [...columns.map((column) => merged[column]), toMysqlDate(new Date().toISOString()), id]
      );
      return this.findById(id);
    },

    async remove(id) {
      const [result] = await pool.query("DELETE FROM articles WHERE id = ?", [id]);
      return result.affectedRows > 0;
    },
  };

  const store = {
    driver: "mysql",
    location: `${config.db.user}@${config.db.host}:${config.db.port}/${config.db.name}`,
    meetings: collection("meetings"),
    quotes: collection("quotes"),
    catalog,
    articles,
    async close() {
      await pool.end();
    },
  };

  // When MySQL is configured, make sure the tables exist: on a shared host the
  // schema.sql import is easy to forget, and an empty database is not obvious.
  // Columns added by later releases are handled the same way.
  const { ensureSchema, ensureColumns } = require("./schema-check.cjs");
  await ensureSchema(pool, { label: store.location });
  await ensureColumns(pool, { label: store.location });

  // First run: seed the catalogue with the products the site shipped with, but
  // only when the table is empty so later edits are never overwritten.
  const [seeded] = await pool.query("SELECT COUNT(*) AS count FROM catalog");
  if (Number(seeded[0].count) === 0) {
    const seedItems = require("./catalog-seed.cjs");
    for (const item of seedItems) await catalog.insert(item);
    console.log(`[db] catálogo sembrado: ${seedItems.length} productos (${store.location})`);
  }

  // Same rule for the blog articles: seed once, then the admin CRUD owns them.
  const [seededArticles] = await pool.query("SELECT COUNT(*) AS count FROM articles");
  if (Number(seededArticles[0].count) === 0) {
    const seedArticles = require("./articles-seed.cjs");
    for (const article of seedArticles) await articles.insert(article);
    console.log(`[db] artículos sembrados: ${seedArticles.length} (${store.location})`);
  }

  return store;
};

module.exports = { createMysqlStore };
module.exports.default = createMysqlStore;
