/**
 * Configuration for the Masvale API.
 *
 * CommonJS on purpose: cPanel's Node.js App (Phusion Passenger) loads the
 * startup file with require(), which cannot load an ES module. The service is
 * deployed to cPanel, so the whole API is CJS.
 *
 * Everything comes from the environment. See api/README.md for the full list.
 */
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");

const bool = (value, fallback = false) => {
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
};

const list = (value) =>
  String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

/** Service account key: inline JSON, base64 of it, or a path to the file. */
const readServiceAccount = (raw) => {
  if (!raw) return null;
  const value = raw.trim();
  try {
    if (value.startsWith("{")) return JSON.parse(value);
    const decoded = Buffer.from(value, "base64").toString("utf8");
    if (decoded.trim().startsWith("{")) return JSON.parse(decoded);
  } catch {
    // not inline JSON; treat it as a file path below
  }
  return JSON.parse(readFileSync(resolve(value), "utf8"));
};

const loadConfig = (env = process.env) => {
  const mailHost = env.SMTP_HOST || "";
  const mailUser = env.SMTP_USER || "";
  const mailFrom = env.SMTP_FROM || mailUser;

  // Origins are compared exactly by the browser, so a trailing slash or a
  // different case would silently block every request. Normalise on the way in.
  const corsOrigins = list(env.CORS_ORIGINS).map((origin) =>
    origin === "*" ? "*" : origin.replace(/\/+$/, "").toLowerCase()
  );

  const oauth = {
    clientId: env.GOOGLE_CLIENT_ID || "",
    clientSecret: env.GOOGLE_CLIENT_SECRET || "",
    refreshToken: env.GOOGLE_REFRESH_TOKEN || "",
  };
  const serviceAccount = readServiceAccount(
    env.GOOGLE_SERVICE_ACCOUNT_JSON || env.GOOGLE_SERVICE_ACCOUNT_FILE
  );
  const calendarEnabled =
    !bool(env.GOOGLE_CALENDAR_DISABLED) &&
    Boolean(serviceAccount || (oauth.clientId && oauth.clientSecret && oauth.refreshToken));

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

    calendar: {
      id: env.GOOGLE_CALENDAR_ID || "primary",
      timezone: env.CALENDAR_TIMEZONE || "America/Santiago",
      serviceAccount,
      oauth,
      enabled: calendarEnabled,
    },

    meetings: {
      durationMinutes: Number(env.MEETING_DURATION_MINUTES || 45),
      /** How soon a meeting may start, and how far ahead it may be booked. */
      minLeadHours: Number(env.MEETING_MIN_LEAD_HOURS || 4),
      maxDaysAhead: Number(env.MEETING_MAX_DAYS_AHEAD || 60),
      /** Business hours in CALENDAR_TIMEZONE. */
      startHour: Number(env.MEETING_START_HOUR || 9),
      endHour: Number(env.MEETING_END_HOUR || 18),
      /** 1 = Monday ... 7 = Sunday, as in Google Calendar. */
      weekdays: list(env.MEETING_WEEKDAYS).length
        ? list(env.MEETING_WEEKDAYS).map(Number)
        : [1, 2, 3, 4, 5],
      slotMinutes: Number(env.MEETING_SLOT_MINUTES || 45),
      defaultLocation: env.MEETING_IN_PERSON_LOCATION || "Oficina Masvale, Santiago",
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
