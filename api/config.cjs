/**
 * Configuration for the Masvale API.
 *
 * CommonJS on purpose: cPanel's Node.js App (Phusion Passenger) loads the
 * startup file with require(), which cannot load an ES module. The service is
 * deployed to cPanel, so the whole API is CJS.
 *
 * Everything comes from the environment. See api/README.md for the full list.
 */

const bool = (value, fallback = false) => {
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
};

const list = (value) =>
  String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);



const loadConfig = (env = process.env) => {
  const mailHost = env.SMTP_HOST || "";
  const mailUser = env.SMTP_USER || "";
  const mailFrom = env.SMTP_FROM || mailUser;

  // Origins are compared exactly by the browser, so a trailing slash or a
  // different case would silently block every request. Normalise on the way in.
  const corsOrigins = list(env.CORS_ORIGINS).map((origin) =>
    origin === "*" ? "*" : origin.replace(/\/+$/, "").toLowerCase()
  );

  

  return {
    port: Number(env.PORT || 4000),
    env: env.NODE_ENV || "development",
    /** Browser origins allowed to call the API. Empty means "allow any". */
    corsOrigins,
    /** Bearer token required by /api/admin/*. Falls back to ADMIN_PASSWORD. */
    adminToken: env.ADMIN_TOKEN || env.ADMIN_PASSWORD || "",
    dataDir: env.DATA_DIR || "./data",
    /** Where article pictures are written and served from (`/uploads`). */
    uploadsDir: env.UPLOADS_DIR || "./uploads",
    /** Max size of an uploaded picture, in bytes (default 8 MB). */
    uploadsMaxBytes: Number(env.UPLOADS_MAX_BYTES || 8 * 1024 * 1024),
    publicSiteUrl: env.PUBLIC_SITE_URL || "",

    site: {
      name: env.SITE_NAME || "Masvale Consultores",
      /** Inbox that receives every request. */
      adminInbox: env.ADMIN_EMAIL || "josecuevasparry@gmail.com",
      /** Address Bcc'd on quotation requests, so the team sees them too. */
      quoteBcc: env.QUOTE_BCC || "josecuevasparry@gmail.com",
      replyTo: env.SMTP_REPLY_TO || mailUser || "",
    },

    mail: {
      host: mailHost,
      port: Number(env.SMTP_PORT || 587),
      secure: bool(env.SMTP_SECURE, Number(env.SMTP_PORT) === 465),
      user: mailUser,
      pass: env.SMTP_PASS || "",
      from: mailFrom,
      enabled: Boolean(mailHost && mailFrom),
    },





    /**
     * MySQL / MariaDB. When DB_NAME (or DB_HOST) is set the API stores there
     * instead of the JSON files.
     */
    db: {
      host: env.DB_HOST || "",
      port: Number(env.DB_PORT || 3306),
      user: env.DB_USER || "",
      password: env.DB_PASSWORD || "",
      name: env.DB_NAME || "",
      connectionLimit: Number(env.DB_CONNECTION_LIMIT || 5),
      enabled: Boolean(env.DB_NAME || env.DB_HOST),
    },
  };
};

module.exports = { loadConfig };
module.exports.default = loadConfig;
