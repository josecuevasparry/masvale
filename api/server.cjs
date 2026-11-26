/**
 * Masvale API entry point — CommonJS.
 *
 * cPanel's "Setup Node.js App" (Phusion Passenger) loads the startup file with
 * require(), so this module must be CJS. Start it here:
 *
 *   cPanel > Setup Node.js App > Application startup file: server.cjs
 *
 * Locally:
 *   npm run api        (node api/server.cjs)
 *
 * Passenger injects the port; otherwise PORT (default 4000) is used.
 *
 * Nothing here may throw before the app is listening: Passenger turns any
 * startup failure into a bare "Internal Server Error" page that says nothing
 * about the cause. Every failure path below ends either in a diagnostic JSON
 * answer or in a written report, never in a silent death.
 */
const { existsSync } = require("node:fs");
const { join, resolve } = require("node:path");

// Passenger runs with the app directory as working directory, but be explicit:
// a relative path here is how a startup file ends up writing its log into the
// wrong folder (or nowhere).
const here = __dirname;
const startedAt = new Date().toISOString();
/** Shared with the app so /health can report how the process was started. */
const startup = { startedAt, pending: null, lastError: null };

// Optional .env next to this file. On cPanel the variables come from the
// "Setup Node.js App" environment section instead, and Passenger injects them.
const envFile = resolve(here, ".env");
if (existsSync(envFile)) {
  try {
    require("dotenv").config({ path: envFile });
  } catch {
    console.warn("[env] dotenv no está instalado; se usan las variables del entorno.");
  }
}

/**
 * Startup diagnostics. When Passenger cannot boot the app the browser only shows
 * a generic "Internal Server Error", so the reason is written to
 * <app>/startup-error.log (next to this file) as well as stderr.
 */
const logStartupProblem = (error, phase = "arranque") => {
  const report = [
    `[startup] ${new Date().toISOString()} no se pudo iniciar el API (${phase})`,
    `  cwd: ${process.cwd()}`,
    `  archivo: ${__filename}`,
    `  node: ${process.version}`,
    `  PORT: ${process.env.PORT ?? "(sin definir)"}`,
    `  error: ${error?.code ?? ""} ${error?.stack ?? error}`,
    "",
  ].join("\n");

  startup.lastError = {
    at: new Date().toISOString(),
    phase,
    code: error?.code ?? null,
    message: String(error?.message ?? error),
  };

  try {
    require("node:fs").appendFileSync(resolve(here, "startup-error.log"), report);
  } catch {
    // si no se puede escribir, al menos va a stderr
  }
  process.stderr.write(report);
};

// Registered before anything can fail, so a failure while loading the app's own
// modules is reported too. No process.exit here: an uncaught exception during
// startup would otherwise kill the app with nothing but Passenger's 500 page.
process.on("uncaughtException", (error) => {
  logStartupProblem(error, "excepción no capturada");
});
process.on("unhandledRejection", (error) => {
  logStartupProblem(error, "promesa rechazada sin capturar");
});

/**
 * Last resort. If the app cannot be built at all, serve the reason as JSON
 * instead of leaving the browser with Passenger's blank 500 page. Getting this
 * answer already proves Passenger reached Node and the port is fine.
 */
const startDiagnosticServer = () => {
  // Use only Node's built-in http so this works even when the app's dependencies
  // (express, etc.) are missing. Without this, "npm install not run" shows up as
  // a blank Passenger 500 instead of a readable reason.
  const http = require("node:http");

  const payload = () =>
    JSON.stringify({
      ok: false,
      error: "El API no pudo iniciarse.",
      detail: startup.lastError?.message ?? "Motivo desconocido.",
      code: startup.lastError?.code ?? null,
      phase: startup.lastError?.phase ?? null,
      node: process.version,
      port: process.env.PORT ?? null,
      cwd: process.cwd(),
      archivo: __filename,
      startedAt,
    });

  const port = process.env.PORT || 4000;
  return new Promise((resolveListen) => {
    const server = http.createServer((_req, res) => {
      res.statusCode = 503;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(payload());
    });
    server.on("error", (error) => {
      logStartupProblem(error, "listen (modo diagnóstico)");
      resolveListen(null);
    });
    server.listen(port, () => {
      console.log(`Masvale API (modo diagnóstico) escuchando en http://localhost:${port}`);
      resolveListen(server);
    });
  });
};

/**
 * Boots the API. If MySQL or Google Calendar are misconfigured the app still
 * starts: the store falls back to JSON and the calendar to disabled.
 */
const start = async () => {
  const { loadConfig } = require("./config.cjs");
  const { createStore } = require("./store.cjs");
  const { createMailer } = require("./mailer.cjs");
  const { createCalendar } = require("./calendar.cjs");
  const { createApp } = require("./app.cjs");

  const config = loadConfig();
  // Everything lives inside this app folder (same-origin deploy): data and
  // uploads are subfolders, never siblings that could leak under public_html.
  config.dataDir = resolve(here, config.dataDir);
  config.uploadsDir = resolve(here, config.uploadsDir);
  // The built React frontend ships in build/ next to this file in production,
  // and in ../build in the local repo layout (api/ and build/ are siblings).
  config.buildDir = [
    resolve(here, "build"),
    resolve(here, "..", "build"),
  ].find((dir) => existsSync(join(dir, "index.html"))) || null;

  const store = await createStore(config);
  const mailer = createMailer(config);
  const calendar = createCalendar(config);
  const app = createApp({ config, store, mailer, calendar, startup });

  return new Promise((resolveStart) => {
    const server = app.listen(config.port, () => {
      console.log(`Masvale API escuchando en http://localhost:${config.port}`);
      console.log(
        `  modo calendario: ${config.calendar.enabled ? "Google Calendar" : "deshabilitado"}`
      );
      console.log(`  correo: ${config.mail.enabled ? `SMTP ${config.mail.host}` : "dry-run (sin SMTP)"}`);
      console.log(
        `  datos: ${store.driver === "mysql" ? `MySQL ${store.location}` : `JSON ${store.location}`}`
      );
      console.log(`  cors: ${config.corsOrigins.join(",") || "(cualquier origen)"}`);
      resolveStart(server);
    });
    server.on("error", (error) => {
      logStartupProblem(error, "listen");
      resolveStart(null);
    });
  });
};

// Passenger inspects the export and needs the app to be listening; returning the
// promise is fine. A rejection must not escape as an unhandled rejection, so it
// is caught here and answered with the diagnostic app instead.
const boot = async () => {
  startup.pending = true;
  try {
    const result = await start();
    startup.pending = false;
    return result;
  } catch (error) {
    startup.pending = false;
    logStartupProblem(error, "inicio del API");
    try {
      return await startDiagnosticServer();
    } catch (fallbackError) {
      logStartupProblem(fallbackError, "servidor de diagnóstico");
      return null;
    }
  }
};

module.exports = boot();
module.exports.start = start;
module.exports.diagnostic = startDiagnosticServer;
