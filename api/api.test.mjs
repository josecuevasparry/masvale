/**
 * API tests. Uses Node's built-in runner so they run outside Create React App:
 *
 *   npm run test:api
 *
 * The app is exercised end to end over HTTP against in-memory fakes for email,
 * Google Calendar and storage, so nothing external is touched.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

// The API itself is CommonJS (cPanel's Node.js App loader uses require), and
// Node's ESM interop lets these tests import it directly, so what is tested is
// exactly what is deployed.
import { createApp } from "./app.cjs";
import { loadConfig } from "./config.cjs";
import { zonedDateTime, weekdayOf } from "./calendar.cjs";

const TIMEZONE = "America/Santiago";
const ADMIN_TOKEN = "test-token";

const testConfig = () =>
  loadConfig({
    NODE_ENV: "test",
    ADMIN_TOKEN,
    ADMIN_EMAIL: "josecuevasparry@masvale.cl",
    SMTP_HOST: "",
    SMTP_USER: "",
    SMTP_FROM: "",
    // Includes the www host with a trailing slash on purpose: the API must
    // normalise it, because the site is served from https://www.masvale.cl.
    CORS_ORIGINS: "https://masvale.cl, https://www.masvale.cl/",
    CALENDAR_TIMEZONE: TIMEZONE,
    GOOGLE_CALENDAR_DISABLED: "true",
  });

/** In-memory stand-in for api/store.mjs.
 *
 * Every read is async, exactly like the MySQL store: the routes must await them
 * or the responses come back as `{}` (a bug the JSON store used to hide because
 * its reads were synchronous).
 */
const fakeStore = () => {
  const rows = { meetings: [], quotes: [], catalog: [], articles: [] };
  let seq = 0;
  const collection = (name) => ({
    async all() {
      return [...rows[name]];
    },
    async findById(id) {
      return rows[name].find((row) => row.id === id) ?? null;
    },
    async insert(record) {
      const row = { id: `id-${++seq}`, createdAt: new Date().toISOString(), ...record };
      rows[name].push(row);
      return row;
    },
    async update(id, patch) {
      const index = rows[name].findIndex((row) => row.id === id);
      if (index === -1) return null;
      rows[name][index] = { ...rows[name][index], ...patch };
      return rows[name][index];
    },
    async between(from, to) {
      return rows[name]
        .filter((row) => row.startDateTime >= from && row.startDateTime < to)
        .sort((a, b) => a.startDateTime.localeCompare(b.startDateTime));
    },
    async remove(id) {
      const index = rows[name].findIndex((row) => row.id === id);
      if (index === -1) return false;
      rows[name].splice(index, 1);
      return true;
    },
  });
  return {
    rows,
    meetings: collection("meetings"),
    quotes: collection("quotes"),
    articles: collection("articles"),
    catalog: {
      async all({ visibleOnly = false } = {}) {
        return rows.catalog
          .filter((row) => !visibleOnly || row.visible !== false)
          .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      },
      async findById(id) {
        return rows.catalog.find((row) => row.id === id) ?? null;
      },
    },
  };
};

const fakeMailer = () => {
  const sent = [];
  const requests = [];
  return {
    sent,
    requests,
    async sendRequest({ kind, record }) {
      requests.push(record);
      sent.push({ kind, to: record.email, subject: `confirmacion:${kind}` });
      if (kind === "meeting") {
        sent.push({ kind, to: "josecuevasparry@masvale.cl", subject: `interno:${kind}` });
        return { confirmation: {}, internal: {} };
      }
      return { confirmation: {} };
    },
  };
};

const fakeCalendar = ({ busy = [] } = {}) => {
  const events = [];
  return {
    events,
    enabled: true,
    timezone: TIMEZONE,
    durationMinutes: 45,
    isBookable: () => true,
    dayRange: (date) => {
      const start = zonedDateTime(TIMEZONE, date, "00:00");
      return { from: start, to: new Date(start.getTime() + 24 * 3600000) };
    },
    humanLabel: (startIso) => `label:${startIso}`,
    async availability(date) {
      const start = zonedDateTime(TIMEZONE, date, "09:00");
      return [
        {
          start: start.toISOString(),
          end: new Date(start.getTime() + 45 * 60000).toISOString(),
          label: "09:00",
          available: busy.length === 0 && weekdayOf(date) <= 5,
        },
      ];
    },
    async ensureFree(startIso, endIso) {
      return !busy.some(
        (range) =>
          new Date(range.start) < new Date(endIso) && new Date(range.end) > new Date(startIso)
      );
    },
    async createEvent({ meeting }) {
      const event = { id: "evt-1", htmlLink: "https://calendar.google.com/evt-1", meetLink: null };
      events.push({ meeting, event });
      return event;
    },
  };
};

/** A future date that falls on one of the configured weekdays. */
const futureWeekday = (weekdays = [1, 2, 3, 4, 5]) => {
  const [year, month, day] = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date(Date.now() + 3 * 24 * 3600000))
    .split("-")
    .map(Number);
  const probe = new Date(Date.UTC(year, month - 1, day));
  for (let i = 0; i < 7; i += 1) {
    const iso = new Intl.DateTimeFormat("en-CA", {
      timeZone: TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(probe.getTime() + i * 24 * 3600000));
    const [y, m, d] = iso.split("-").map(Number);
    const weekday = weekdayOf(iso);
    if (weekdays.includes(weekday)) return { date: iso, weekday, y, m, d };
  }
  throw new Error("No bookable weekday found in the next week");
};

let server;
let baseUrl;
let store;
let mailer;
let calendar;
const extraServers = [];

/** Starts the app on an ephemeral port and returns its base URL. */
const startApp = async (deps = {}) => {
  const app = createApp({
    config: deps.config ?? testConfig(),
    store: deps.store ?? store ?? fakeStore(),
    mailer: deps.mailer ?? mailer ?? fakeMailer(),
    calendar: deps.calendar ?? calendar ?? fakeCalendar(),
    startup: deps.startup,
  });
  const instance = await new Promise((resolve) => {
    const started = app.listen(0, "127.0.0.1", () => resolve(started));
  });
  extraServers.push(instance);
  return `http://127.0.0.1:${instance.address().port}`;
};

const api = async (path, { headers, ...options } = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(headers ?? {}) },
  });
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
};

before(async () => {
  store = fakeStore();
  mailer = fakeMailer();
  calendar = fakeCalendar();
  baseUrl = await startApp({ store, mailer, calendar });
});

after(async () => {
  await Promise.all(
    extraServers.map((instance) => new Promise((resolve) => instance.close(resolve)))
  );
});

test("health and config describe the running modes", async () => {
  const health = await api("/health");
  assert.equal(health.status, 200);
  assert.equal(health.body.ok, true);
  assert.equal(health.body.calendar, "disabled");

  const config = await api("/api/config");
  assert.equal(config.status, 200);
  assert.equal(config.body.timezone, TIMEZONE);
  assert.equal(config.body.durationMinutes, 45);
});

test("health publishes the environment so a broken deploy is visible", async () => {
  // When the host fails to inject the app's environment (or the app cannot be
  // built at all) the only way to tell from outside is what /health reports.
  const health = await api("/health");
  assert.equal(health.status, 200);
  assert.ok(health.body.env, "/health debe informar el entorno");
  assert.equal(typeof health.body.env.node, "string");
  assert.equal(health.body.env.dbConfigured, false); // this config has no DB_*
  assert.ok(Array.isArray(health.body.corsRejections));
  assert.equal(health.body.detail, null); // started normally
  assert.equal(health.body.startup, null);
  assert.equal(typeof health.body.uptimeSeconds, "number");
});

test("availability lists slots for a weekday", async () => {
  const { date } = futureWeekday();
  const response = await api(`/api/meetings/availability?date=${date}`);
  assert.equal(response.status, 200);
  assert.equal(response.body.date, date);
  assert.equal(response.body.slots.length, 1);
  assert.equal(response.body.slots[0].available, true);
});

test("availability rejects a malformed date", async () => {
  const response = await api("/api/meetings/availability?date=mañana");
  assert.equal(response.status, 400);
  assert.match(response.body.error, /YYYY-MM-DD/);
});

test("a meeting needs organization, name and a valid email", async () => {
  const { date } = futureWeekday();
  const response = await api("/api/meetings", {
    method: "POST",
    body: JSON.stringify({ date, time: "10:00", mode: "online", email: "no-es-email" }),
  });
  assert.equal(response.status, 400);
  assert.match(response.body.error, /organización|nombre|email/);
});

test("booking a meeting stores it, mails both parties and creates the event", async () => {
  const { date } = futureWeekday();
  const before = mailer.sent.length;

  const response = await api("/api/meetings", {
    method: "POST",
    body: JSON.stringify({
      organization: "Constructora Andes",
      name: "Ana Pérez",
      email: "ANA@example.com",
      mode: "online",
      date,
      time: "10:00",
      notes: "Queremos revisar la app",
    }),
  });

  assert.equal(response.status, 201);
  assert.equal(response.body.calendarEventCreated, true);
  assert.equal(response.body.meeting.email, "ana@example.com"); // normalised
  assert.equal(response.body.meeting.status, "pendiente");
  assert.equal(response.body.meeting.mode, "online");

  // Stored with its calendar event.
  const stored = store.rows.meetings.at(-1);
  assert.equal(stored.organization, "Constructora Andes");
  assert.equal(stored.calendarEvent.id, "evt-1");
  assert.ok(stored.startLabel.startsWith("label:"));

  // Requester + internal copy.
  assert.equal(mailer.sent.length, before + 2);
  const [confirmation, internal] = mailer.sent.slice(-2);
  assert.deepEqual(confirmation, {
    kind: "meeting",
    to: "ana@example.com",
    subject: "confirmacion:meeting",
  });
  assert.deepEqual(internal, {
    kind: "meeting",
    to: "josecuevasparry@masvale.cl",
    subject: "interno:meeting",
  });
});

test("the meeting e-mail states the date, the product and the organization", async () => {
  const { createMailer } = await import("./mailer.cjs");
  const outbox = [];
  const mailerWithTransport = createMailer(
    loadConfig({
      ADMIN_EMAIL: "josecuevasparry@masvale.cl",
      SMTP_HOST: "smtp.example.com",
      SMTP_USER: "no-reply@masvale.cl",
      SMTP_FROM: "Masvale <no-reply@masvale.cl>",
      SMTP_PASS: "x",
      CALENDAR_TIMEZONE: TIMEZONE,
    }),
    {
      sendMail: async (message) => {
        outbox.push(message);
        return { accepted: [message.to] };
      },
    }
  );

  const startLabel = "jueves, 15 de octubre de 2026 · 10:30 hrs (45 min)";
  await mailerWithTransport.sendRequest({
    kind: "meeting",
    record: {
      organization: "Administración Los Robles",
      name: "Carla Díaz",
      email: "carla@example.com",
      product: "App de Administración de Condominios",
      mode: "online",
      startLabel,
      startDateTime: "2026-10-15T13:30:00.000Z",
      endDateTime: "2026-10-15T14:15:00.000Z",
    },
    startLabel,
  });

  const [confirmation, internal] = outbox;
  const expected =
    "Carla Díaz, hemos agendado una reunión contigo para el jueves, 15 de octubre de 2026 · 10:30 hrs " +
    "en que conversaremos sobre App de Administración de Condominios para tu organización Administración Los Robles.";

  assert.match(confirmation.text, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(internal.text, /hemos agendado una reunión contigo/);
  // The product is also a row of its own, so it is scannable in the message.
  assert.match(internal.text, /Producto: App de Administración de Condominios/);

  // Without a product (a booking not made from a card) the sentence still holds.
  outbox.length = 0;
  await mailerWithTransport.sendRequest({
    kind: "meeting",
    record: {
      organization: "Empresa",
      name: "Luis",
      email: "luis@example.com",
      mode: "online",
      startLabel,
    },
    startLabel,
  });
  assert.match(outbox[0].text, /conversaremos sobre los productos y servicios de Masvale/);
});

test("an in-person meeting keeps the default location", async () => {
  const { date } = futureWeekday();
  const response = await api("/api/meetings", {
    method: "POST",
    body: JSON.stringify({
      organization: "Colegio Sur",
      name: "Luis Soto",
      email: "luis@example.com",
      mode: "presencial",
      date,
      time: "11:30",
    }),
  });
  assert.equal(response.status, 201);
  assert.equal(response.body.meeting.location, "Oficina Masvale, Santiago");
});

test("a meeting records the product it was booked for", async () => {
  const { date } = futureWeekday();
  const response = await api("/api/meetings", {
    method: "POST",
    body: JSON.stringify({
      organization: "Administración Los Robles",
      name: "Carla Díaz",
      email: "carla.meeting@example.com",
      product: "App de Administración de Condominios",
      mode: "online",
      date,
      time: "12:15",
      source: "web:App de Administración de Condominios",
    }),
  });

  assert.equal(response.status, 201);
  assert.equal(response.body.meeting.product, "App de Administración de Condominios");
  assert.equal(
    mailer.requests.at(-1).product,
    "App de Administración de Condominios"
  );

  // A booking made before the field existed recovers it from `source`.
  const legacy = await api("/api/meetings", {
    method: "POST",
    body: JSON.stringify({
      organization: "Colegio Andes",
      name: "Ana Soto",
      email: "ana.meeting@example.com",
      mode: "online",
      date,
      time: "15:45",
      source: "web:App Escuela y Familia",
    }),
  });
  assert.equal(legacy.body.meeting.product, "App Escuela y Familia");

  // The admin agenda carries it too, for the calendar UI.
  const admin = await api("/api/admin/meetings", {
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
  });
  const listed = admin.body.meetings.find((meeting) => meeting.email === "ana.meeting@example.com");
  assert.equal(listed.product, "App Escuela y Familia");
});

test("a taken slot answers 409", async () => {
  const { date } = futureWeekday();
  const start = zonedDateTime(TIMEZONE, date, "10:00");
  const busyCalendar = fakeCalendar({
    busy: [
      { start: start.toISOString(), end: new Date(start.getTime() + 45 * 60000).toISOString() },
    ],
  });
  const busyUrl = await startApp({ calendar: busyCalendar });
  const response = await fetch(`${busyUrl}/api/meetings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      organization: "Empresa",
      name: "Persona",
      email: "p@example.com",
      mode: "online",
      date,
      time: "10:00",
    }),
  });
  assert.equal(response.status, 409);
  const body = await response.json();
  assert.match(body.error, /tomado/);
});

test("a quote needs only the contact and the question", async () => {
  // The form no longer asks for users or purchase intent: a request with just the
  // contact fields and the requirement must be accepted and stored.
  const response = await api("/api/quotes", {
    method: "POST",
    body: JSON.stringify({
      organization: "Empresa",
      name: "Persona",
      email: "p@example.com",
      notes: "Necesito una cotización para la app del condominio.",
      source: "web:App de Administración de Condominios",
    }),
  });
  assert.equal(response.status, 201);
  assert.equal(response.body.quote.users, 0);
  assert.deepEqual(response.body.quote.intents, []);
  assert.equal(response.body.quote.product, "App de Administración de Condominios");
  assert.equal(response.body.quote.notes, "Necesito una cotización para la app del condominio.");
});

test("a quote stores users, intents and mails both parties", async () => {
  const before = mailer.sent.length;
  const response = await api("/api/quotes", {
    method: "POST",
    body: JSON.stringify({
      organization: "Administración Los Robles",
      name: "Carla Díaz",
      email: "carla@example.com",
      product: "App de Administración de Condominios",
      users: 120,
      intents: ["comprar", "servicios"],
      additionalServices: "Capacitación a conserjes",
      source: "web:App de Administración de Condominios",
    }),
  });

  assert.equal(response.status, 201);
  assert.equal(response.body.quote.users, 120);
  assert.deepEqual(response.body.quote.intents, ["comprar", "servicios"]);
  assert.equal(response.body.quote.product, "App de Administración de Condominios");
  // Quotations are one message (to the person, team on Bcc), not two.
  assert.equal(mailer.sent.length, before + 1);

  // The product reaches the mailer, which is what turns it into the e-mail rows.
  assert.equal(mailer.requests.at(-1).product, "App de Administración de Condominios");

  assert.equal(store.rows.quotes.at(-1).organization, "Administración Los Robles");
});

test("the quotation e-mail goes to the person with the team on Bcc", async () => {
  // One message only: the requester receives it and the team reads the Bcc, so
  // there is no separate internal copy for quotations.
  const { createMailer } = await import("./mailer.cjs");
  const outbox = [];
  const mailerWithTransport = createMailer(
    loadConfig({
      ADMIN_EMAIL: "josecuevasparry@masvale.cl",
      QUOTE_BCC: "josecuevasparry@gmail.com",
      SMTP_HOST: "smtp.example.com",
      SMTP_USER: "no-reply@masvale.cl",
      SMTP_FROM: "Masvale <no-reply@masvale.cl>",
      SMTP_PASS: "x",
    }),
    {
      sendMail: async (message) => {
        outbox.push(message);
        return { accepted: [message.to] };
      },
    }
  );

  await mailerWithTransport.sendRequest({
    kind: "quote",
    record: {
      organization: "Administración Los Robles",
      name: "Carla Díaz",
      email: "carla@example.com",
      product: "App de Administración de Condominios",
      notes: "Necesito saber el precio para 30 departamentos.",
    },
  });

  assert.equal(outbox.length, 1);
  const [message] = outbox;
  assert.equal(message.to, "carla@example.com");
  assert.equal(message.bcc, "josecuevasparry@gmail.com");
  assert.match(message.text, /Producto: App de Administración de Condominios/);
  assert.match(message.text, /Consulta: Necesito saber el precio para 30 departamentos/);
  assert.match(message.text, /nos pondremos en contacto/i);
  assert.match(message.subject, /App de Administración de Condominios/);

  // Without a product (an old record) the row is simply absent, not "undefined".
  outbox.length = 0;
  await mailerWithTransport.sendRequest({
    kind: "quote",
    record: {
      organization: "Empresa",
      name: "Luis",
      email: "luis@example.com",
      notes: "Hola",
    },
  });
  assert.doesNotMatch(outbox[0].text, /Producto:/);
});

test("a quote without product falls back to the item in source", async () => {
  // The site used to send the product only inside `source`; those requests must
  // still show what they were for.
  const created = await api("/api/quotes", {
    method: "POST",
    body: JSON.stringify({
      organization: "Colegio Andes",
      name: "Ana Soto",
      email: "ana@example.com",
      users: 300,
      intents: ["arrendar"],
      source: "web:App Escuela y Familia",
    }),
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.quote.product, "App Escuela y Familia");

  // A generic source (no item) stays empty rather than becoming "web".
  const generic = await api("/api/quotes", {
    method: "POST",
    body: JSON.stringify({
      organization: "Empresa",
      name: "Luis",
      email: "luis@example.com",
      users: 5,
      intents: ["comprar"],
      source: "web",
    }),
  });
  assert.ok(!generic.body.quote.product);

  // What the admin panel returns carries the product too.
  const admin = await api("/api/admin/quotes", {
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
  });
  const listed = admin.body.quotes.find((quote) => quote.email === "ana@example.com");
  assert.equal(listed.product, "App Escuela y Familia");
});

test("the admin agenda requires the bearer token", async () => {
  const anonymous = await api("/api/admin/meetings");
  assert.equal(anonymous.status, 401);

  const wrong = await api("/api/admin/meetings", {
    headers: { Authorization: "Bearer nope" },
  });
  assert.equal(wrong.status, 401);
});

test("CORS allows the site's origins and blocks others", async () => {
  const health = await api("/health");
  assert.deepEqual(health.body.corsOrigins, ["https://masvale.cl", "https://www.masvale.cl"]);

  // Preflight from the www host (normalised: the env value had a trailing slash).
  const preflight = await fetch(`${baseUrl}/api/quotes`, {
    method: "OPTIONS",
    headers: {
      Origin: "https://www.masvale.cl",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type",
    },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), "https://www.masvale.cl");
  assert.match(preflight.headers.get("access-control-allow-methods"), /POST/);
  assert.equal(preflight.headers.get("vary"), "Origin");

  // The actual POST carries the header too, otherwise the browser discards it.
  const posted = await fetch(`${baseUrl}/api/quotes`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://masvale.cl" },
    body: JSON.stringify({
      organization: "CORS SpA",
      name: "Cors",
      email: "cors@example.com",
      users: 1,
      intents: ["comprar"],
    }),
  });
  assert.equal(posted.status, 201);
  assert.equal(posted.headers.get("access-control-allow-origin"), "https://masvale.cl");

  // An origin that is not on the list is refused with an explanation.
  const blocked = await fetch(`${baseUrl}/api/meetings/days`, {
    headers: { Origin: "https://evil.example" },
  });
  assert.equal(blocked.headers.get("access-control-allow-origin"), null);
  assert.equal(blocked.headers.get("vary"), "Origin");

  const blockedPreflight = await fetch(`${baseUrl}/api/quotes`, {
    method: "OPTIONS",
    headers: { Origin: "https://evil.example", "Access-Control-Request-Method": "POST" },
  });
  assert.equal(blockedPreflight.status, 403);
  assert.match((await blockedPreflight.json()).error, /Origen no permitido/);

  // The refusal is recorded, so /health can explain a browser-side CORS error
  // that would otherwise only say "no Access-Control-Allow-Origin header".
  const after = await api("/health");
  assert.equal(after.body.corsRejections[0].origin, "https://evil.example");
});

test("an app without CORS_ORIGINS still answers the site", async () => {
  // cPanel can restart the app from a wrapper that does not carry its environment
  // variables. With the list empty the API used to send no Allow-Origin header, so
  // every request from the site failed the browser's CORS check. The site's own
  // origins must be the fallback, never "allow everyone".
  const bare = { ...testConfig(), corsOrigins: [] };
  const bareUrl = await startApp({ config: bare });

  const preflight = await fetch(`${bareUrl}/api/quotes`, {
    method: "OPTIONS",
    headers: {
      Origin: "https://masvale.cl",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type",
    },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), "https://masvale.cl");

  const health = await (await fetch(`${bareUrl}/health`)).json();
  assert.deepEqual(health.corsOrigins, []);
  assert.deepEqual(health.corsAccepted, ["https://masvale.cl", "https://www.masvale.cl"]);

  const stranger = await fetch(`${bareUrl}/api/quotes`, {
    method: "OPTIONS",
    headers: { Origin: "https://evil.example", "Access-Control-Request-Method": "POST" },
  });
  assert.equal(stranger.status, 403);
  assert.equal(stranger.headers.get("access-control-allow-origin"), null);
});

test("MySQL credentials that fail do not take the API down", async () => {
  // Wrong credentials: the API must fall back to the JSON store instead of
  // crashing with ER_ACCESS_DENIED_ERROR, which the site shows as a 500.
  const { createStore } = await import("./store.cjs");
  const brokenConfig = loadConfig({
    DB_HOST: "127.0.0.1",
    DB_PORT: "3306",
    DB_USER: "usuario_inexistente",
    DB_PASSWORD: "mal",
    DB_NAME: "base_inexistente",
  });

  const originalError = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args.join(" "));
  try {
    const store = await createStore(brokenConfig);
    assert.equal(store.driver, "json");
    assert.ok(logged.some((line) => line.includes("MySQL no disponible")));
    // The reason depends on the environment: a wrong password is an access
    // denial, an offline MySQL is a connection refusal. Both are covered.
    assert.ok(
      logged.some(
        (line) => line.includes("DB_USER/DB_PASSWORD") || line.includes("ECONNREFUSED")
      )
    );

    // And it is usable, so the site keeps working while the DB is fixed.
    const row = await store.quotes.insert({
      organization: "Sin MySQL",
      name: "Prueba",
      email: "prueba@example.com",
      users: 1,
      intents: ["comprar"],
    });
    assert.ok(row.id);
  } finally {
    console.error = originalError;
  }
});

test("the admin agenda lists and filters meetings, and can update status", async () => {
  const headers = { Authorization: `Bearer ${ADMIN_TOKEN}` };
  const all = await api("/api/admin/meetings", { headers });
  assert.equal(all.status, 200);
  assert.ok(all.body.count >= 1);

  // Regression guard: the store reads are async, so a missing await used to
  // serialise the pending promise and return `{meetings:{}}` instead of rows.
  assert.ok(Array.isArray(all.body.meetings));
  assert.equal(all.body.meetings.length, all.body.count);
  assert.equal(typeof all.body.meetings[0].organization, "string");
  assert.ok(all.body.meetings[0].id);

  // The filter works on local days (rows are stored in UTC), and `to` is
  // inclusive: a meeting booked for that date must come back for that date.
  const { date } = futureWeekday();
  const booked = await api("/api/meetings", {
    method: "POST",
    body: JSON.stringify({
      organization: "Filtro SpA",
      name: "Pedro Filtro",
      email: "pedro@example.com",
      mode: "online",
      date,
      time: "10:00",
    }),
  });
  assert.equal(booked.status, 201);

  const filtered = await api(`/api/admin/meetings?from=${date}&to=${date}`, { headers });
  assert.equal(filtered.status, 200);
  assert.ok(Array.isArray(filtered.body.meetings));
  assert.ok(
    filtered.body.meetings.some((meeting) => meeting.id === booked.body.meeting.id),
    "the meeting booked for that local day must be listed for that day"
  );

  const badDate = await api("/api/admin/meetings?from=ayer&to=hoy", { headers });
  assert.equal(badDate.status, 400);

  const target = all.body.meetings[0];
  const updated = await api(`/api/admin/meetings/${target.id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ status: "confirmada" }),
  });
  assert.equal(updated.status, 200, JSON.stringify(updated.body));
  assert.equal(updated.body.meeting.status, "confirmada");

  const invalid = await api(`/api/admin/meetings/${target.id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ status: "inventado" }),
  });
  assert.equal(invalid.status, 400);
});

test("the admin quote list requires the token too", async () => {
  const anonymous = await api("/api/admin/quotes");
  assert.equal(anonymous.status, 401);

  const authorized = await api("/api/admin/quotes", {
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
  });
  assert.equal(authorized.status, 200);
  assert.ok(authorized.body.count >= 1);
  // Same async guard for quotes.
  assert.ok(Array.isArray(authorized.body.quotes));
  assert.equal(authorized.body.quotes.length, authorized.body.count);
  assert.ok(Array.isArray(authorized.body.quotes[0].intents));
});

test("the catalogue is read from the store, visible only in public", async () => {
  store.rows.catalog = [
    { id: "a", title: "Visible", category: "producto", visible: true, sortOrder: 1 },
    { id: "b", title: "Oculta", category: "producto", visible: false, sortOrder: 2 },
  ];

  const publicList = await api("/api/catalog");
  assert.equal(publicList.status, 200);
  assert.equal(publicList.body.count, 1);
  assert.equal(publicList.body.catalog[0].title, "Visible");

  const adminList = await api("/api/admin/catalog", {
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
  });
  assert.equal(adminList.status, 200);
  assert.equal(adminList.body.count, 2);
});

test("the admin catalogue list requires the token", async () => {
  const anonymous = await api("/api/admin/catalog");
  assert.equal(anonymous.status, 401);
});

test("articles are created with a slug from the title and served publicly", async () => {
  store.rows.articles = [];
  const headers = { Authorization: `Bearer ${ADMIN_TOKEN}` };

  const created = await api("/api/admin/articles", {
    method: "POST",
    headers,
    body: JSON.stringify({
      title: "Método Silogice: El lenguaje es la fórmula",
      content: "Primer párrafo.\n\nSegundo párrafo.",
      publishedAt: "2026-05-01",
    }),
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.article.id, "metodo-silogice-el-lenguaje-es-la-formula");
  assert.equal(created.body.article.visible, true);

  // Public list shows it, in the shape the menu expects.
  const list = await api("/api/articles");
  assert.equal(list.status, 200);
  assert.equal(list.body.count, 1);
  assert.equal(list.body.articles[0].title, "Método Silogice: El lenguaje es la fórmula");

  // The slug resolves to the article.
  const one = await api("/api/articles/metodo-silogice-el-lenguaje-es-la-formula");
  assert.equal(one.status, 200);
  assert.equal(one.body.article.content, "Primer párrafo.\n\nSegundo párrafo.");
});

test("an article can be edited and hidden, then deleted", async () => {
  const headers = { Authorization: `Bearer ${ADMIN_TOKEN}` };
  const created = await api("/api/admin/articles", {
    method: "POST",
    headers,
    body: JSON.stringify({ title: "La bondad del Eufemismo" }),
  });
  const slug = created.body.article.id;

  const updated = await api(`/api/admin/articles/${slug}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ visible: false, excerpt: "Resumen" }),
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.article.visible, false);
  assert.equal(updated.body.article.excerpt, "Resumen");

  // Hidden articles do not appear in the public list or resolve.
  const publicList = await api("/api/articles");
  assert.ok(!publicList.body.articles.some((a) => a.id === slug));
  const hidden = await api(`/api/articles/${slug}`);
  assert.equal(hidden.status, 404);

  const removed = await api(`/api/admin/articles/${slug}`, {
    method: "DELETE",
    headers,
  });
  assert.equal(removed.status, 200);
  assert.equal(removed.body.ok, true);
});

test("article endpoints require the admin token", async () => {
  const anonymous = await api("/api/admin/articles");
  assert.equal(anonymous.status, 401);

  const create = await api("/api/admin/articles", {
    method: "POST",
    body: JSON.stringify({ title: "Sin permiso" }),
  });
  assert.equal(create.status, 401);
});

test("an article needs a title", async () => {
  const response = await api("/api/admin/articles", {
    method: "POST",
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    body: JSON.stringify({ content: "Solo contenido" }),
  });
  assert.equal(response.status, 400);
  assert.match(response.body.error, /título/);
});
