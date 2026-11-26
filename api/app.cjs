/**
 * Express app for the Masvale API (CommonJS, for cPanel's require()-based
 * Node.js App loader).
 */
const express = require("express");
const { existsSync } = require("node:fs");
const { join } = require("node:path");
const { createRoutes } = require("./routes.cjs");

/** "https://Masvale.cl/" and "https://masvale.cl" are the same origin. */
const normaliseOrigin = (value) => String(value ?? "").trim().replace(/\/+$/, "").toLowerCase();

/**
 * Origins the API answers when CORS_ORIGINS is not set. Without this, a deploy
 * that loses its environment variables (which happens: cPanel restarts the app
 * from a bare wrapper) leaves the preflight without an Allow-Origin header and
 * the browser reports a CORS error, which looks like a bug in the site.
 */
const DEFAULT_CORS_ORIGINS = ["https://masvale.cl", "https://www.masvale.cl"];

const createApp = ({ config, store, mailer, calendar, clock, startup }) => {
  const app = express();

  // "No list" must mean "the site", never "everyone".
  const configured = (config.corsOrigins ?? []).map(normaliseOrigin);
  const allowed = configured.length ? configured : DEFAULT_CORS_ORIGINS;
  const allowAny = allowed.includes("*");

  // Why the API refused an origin is invisible from the browser, so keep the
  // last few refusals and publish them in /health.
  const recentCorsRejections = [];

  app.disable("x-powered-by");

  // CORS first, before the body parser and before any route, so every answer —
  // including an OPTIONS preflight — carries the headers the browser needs.
  app.use((req, res, next) => {
    const origin = req.get("origin");
    const permit = origin && (allowAny || allowed.includes(normaliseOrigin(origin)));

    // Always vary on Origin, including for rejected requests, so no cache can
    // serve one origin's response to another.
    res.setHeader("Vary", "Origin");

    if (permit) {
      res.setHeader("Access-Control-Allow-Origin", allowAny ? "*" : origin);
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
      res.setHeader("Access-Control-Max-Age", "86400");
    } else if (origin) {
      recentCorsRejections.unshift({ at: new Date().toISOString(), origin });
      recentCorsRejections.length = Math.min(recentCorsRejections.length, 5);
      // Say it in the log: a missing origin here is invisible in the browser.
      console.warn(
        `[cors] origen no permitido: ${origin}. CORS_ORIGINS=${
          config.corsOrigins?.join(",") || `(sin definir; se usan ${allowed.join(",")})`
        }`
      );
    }

    // Answer preflights here, before anything else can fail.
    if (req.method === "OPTIONS") {
      res.statusCode = permit ? 204 : 403;
      if (!permit) res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(permit ? undefined : JSON.stringify({ error: `Origen no permitido: ${origin ?? "(sin origen)"}` }));
      return;
    }
    next();
  });

  // Bigger than the meeting/quote bodies need: the admin article editor uploads
  // pictures as base64 data URLs in JSON, which easily exceed 64 KB.
  app.use(express.json({ limit: "12mb" }));

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      calendar: config.calendar.enabled ? "google" : "disabled",
      mail: config.mail.enabled ? "smtp" : "dry-run",
      store: store.driver ?? "unknown",
      // Handy while setting this up: the origins the API will answer.
      corsOrigins: config.corsOrigins,
      corsAccepted: allowed,
      corsRejections: recentCorsRejections,
      // Environment as the app sees it inside Passenger: if PORT is missing here
      // the host is not injecting the app's variables.
      env: {
        node: process.version,
        port: process.env.PORT ?? null,
        appEnv: process.env.NODE_ENV ?? null,
        dbConfigured: Boolean(config.db?.enabled),
        dbName: config.db?.name ?? null,
        smtpConfigured: Boolean(config.mail?.enabled),
      },
      detail: startup?.pending ?? null,
      startup: startup?.lastError ?? null,
      uptimeSeconds: Math.round(process.uptime()),
      startedAt: startup?.startedAt ?? null,
    });
  });

  // Article pictures uploaded through the admin editor. Mounted only when the
  // directory is configured (the tests build the app without it).
  if (config.uploadsDir) {
    app.use("/uploads", express.static(config.uploadsDir));
  }

  // Standalone pages that are not part of the React SPA (e.g. /sitio/testSilogice).
  const sitioDir = join(__dirname, "sitio");
  if (existsSync(join(sitioDir, "testSilogice", "index.html"))) {
    app.use("/sitio", express.static(sitioDir));
  }

  app.use("/api", createRoutes({ config, store, mailer, calendar, clock }));

  // Serve the built React frontend from the same origin and fall back to the
  // shell for client-side routes. The API, /health and /uploads above win, so a
  // missing /api route still gets the JSON 404 instead of index.html.
  if (config.buildDir && existsSync(join(config.buildDir, "index.html"))) {
    app.use(express.static(config.buildDir));
    app.use((req, res, next) => {
      if (
        req.method !== "GET" ||
        req.path.startsWith("/api") ||
        req.path.startsWith("/health") ||
        req.path.startsWith("/uploads")
      ) {
        return next();
      }
      res.sendFile(join(config.buildDir, "index.html"));
    });
  }

  app.use((_req, res) => {
    res.status(404).json({ error: "Ruta no encontrada." });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((error, _req, res, _next) => {
    const status = error.status ?? 500;
    if (status >= 500) console.error("[api]", error);
    res.status(status).json({
      error: error.status ? error.message : "Error interno del servidor.",
      ...(error.details ? { details: error.details } : {}),
    });
  });

  return app;
};

module.exports = { createApp };
module.exports.default = createApp;
