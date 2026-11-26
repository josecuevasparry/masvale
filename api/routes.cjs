/**
 * HTTP routes for the Masvale API (CommonJS, for cPanel's require()-based
 * Node.js App loader).
 *
 * Dependencies are injected, so tests drive the real routing logic with fake
 * storage, mail and calendar.
 */
const { Router } = require("express");
const { appendFile, mkdir, writeFile } = require("node:fs/promises");
const { join } = require("node:path");
const { randomUUID } = require("node:crypto");
const { zonedDateTime, weekdayOf } = require("./calendar.cjs");

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

const httpError = (status, message, details) => {
  const error = new Error(message);
  error.status = status;
  if (details) error.details = details;
  return error;
};

const str = (value, { field, max = 200, required = true }) => {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text && required) throw httpError(400, `Falta ${field}.`);
  if (text.length > max) throw httpError(400, `${field} es demasiado largo.`);
  return text;
};

const validateContact = (body) => ({
  organization: str(body.organization, { field: "la organización o empresa" }),
  name: str(body.name, { field: "tu nombre", max: 120 }),
  email: str(body.email, { field: "tu email", max: 160 }).toLowerCase(),
});

const assertEmail = (email) => {
  if (!EMAIL.test(email)) throw httpError(400, "El email no parece válido.");
};

/**
 * The product a request is about used to travel only inside `source`
 * ("web:<título del catálogo>"). Rows stored before the dedicated field existed
 * are read back from there, so the panel and the mails show the product for old
 * meetings and quotations too.
 */
const productFromSource = (source) => {
  const text = typeof source === "string" ? source.trim() : "";
  if (!text.toLowerCase().startsWith("web:")) return "";
  return text.slice(4).trim().slice(0, 200);
};

const assertNotPast = (start, { minLeadHours }) => {
  const earliest = Date.now() + minLeadHours * 3600000;
  if (start.getTime() < earliest) {
    throw httpError(
      400,
      `Elige un horario con al menos ${minLeadHours} horas de anticipación.`
    );
  }
};

const assertWithinWindow = (start, { maxDaysAhead }) => {
  const limit = Date.now() + maxDaysAhead * 24 * 3600000;
  if (start.getTime() > limit) {
    throw httpError(400, `Puedes agendar hasta ${maxDaysAhead} días hacia adelante.`);
  }
};

/** "Método Silogice: ..." -> "metodo-silogice-..." (slug like WordPress). */
const slugify = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 200);

/** Accepts YYYY-MM-DD or a full ISO datetime; returns ISO or null. */
const normalizePublishedAt = (value) => {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const text = String(value).trim();
  if (DATE.test(text)) return new Date(`${text}T12:00:00Z`).toISOString();
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    throw httpError(400, "publishedAt no es una fecha válida (YYYY-MM-DD).");
  }
  return parsed.toISOString();
};

/** Menu order: by sortOrder, then newest first, then title. */
const sortArticles = (rows) =>
  [...rows].sort((a, b) => {
    const order = Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0);
    if (order !== 0) return order;
    const pa = a.publishedAt || a.createdAt || "";
    const pb = b.publishedAt || b.createdAt || "";
    if (pa !== pb) return pb.localeCompare(pa);
    return (a.title ?? "").localeCompare(b.title ?? "");
  });

const createRoutes = ({ config, store, mailer, calendar, clock = () => new Date() }) => {
  const router = Router();

  const requireAdmin = (req, res, next) => {
    if (!config.adminToken) {
      return next(httpError(503, "El API no tiene ADMIN_TOKEN configurado."));
    }
    const header = req.get("authorization") || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (token !== config.adminToken) return next(httpError(401, "No autorizado."));
    return next();
  };

  const asyncRoute = (handler) => (req, res, next) =>
    Promise.resolve(handler(req, res, next)).catch(next);

  // ---------------------------------------------------------------- meetings

  /** Which slots are bookable on a given day. */
  router.get(
    "/meetings/availability",
    asyncRoute(async (req, res) => {
      const date = str(req.query.date, { field: "la fecha", max: 10 });
      if (!DATE.test(date)) throw httpError(400, "La fecha debe ser YYYY-MM-DD.");

      const { from } = calendar.dayRange(date);
      assertWithinWindow(from, config.meetings);

      const slots = await calendar.availability(date);
      res.json({
        date,
        timezone: calendar.timezone,
        durationMinutes: calendar.durationMinutes,
        bookable: calendar.isBookable(date),
        slots,
      });
    })
  );

  /** Which days in a window accept meetings, for the month picker. */
  router.get(
    "/meetings/days",
    asyncRoute(async (req, res) => {
      const from = str(req.query.from, { field: "la fecha inicial", max: 10, required: false });
      const days = Number(req.query.days || 60);
      const start = from ? new Date(`${from}T12:00:00Z`) : new Date();
      if (Number.isNaN(start.getTime())) throw httpError(400, "La fecha inicial no es válida.");

      const out = [];
      for (let index = 0; index < Math.min(Math.max(days, 1), 120); index += 1) {
        const date = new Intl.DateTimeFormat("en-CA", {
          timeZone: calendar.timezone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date(start.getTime() + index * 24 * 3600000));
        if (!calendar.isBookable(date)) continue;
        out.push(date);
      }
      res.json({ days: out, timezone: calendar.timezone });
    })
  );

  /** Book a meeting: stores it, books the calendar, mails both parties. */
  router.post(
    "/meetings",
    asyncRoute(async (req, res) => {
      const contact = validateContact(req.body);
      assertEmail(contact.email);

      const mode = req.body.mode === "online" ? "online" : "presencial";
      const date = str(req.body.date, { field: "la fecha", max: 10 });
      const time = str(req.body.time, { field: "la hora", max: 5 });
      if (!DATE.test(date)) throw httpError(400, "La fecha debe ser YYYY-MM-DD.");
      if (!TIME.test(time)) throw httpError(400, "La hora debe ser HH:MM.");
      if (!config.meetings.weekdays.includes(weekdayOf(date))) {
        throw httpError(400, "Ese día no atendemos reuniones.");
      }

      const start = zonedDateTime(calendar.timezone, date, time);
      assertNotPast(start, config.meetings);
      assertWithinWindow(start, config.meetings);

      const end = new Date(start.getTime() + calendar.durationMinutes * 60000);
      const location =
        mode === "online"
          ? "Videollamada"
          : str(req.body.location, { field: "el lugar", required: false }) ||
            config.meetings.defaultLocation;

      const free = await calendar.ensureFree(start.toISOString(), end.toISOString());
      if (!free) {
        throw httpError(409, "Ese horario ya está tomado. Elige otro, por favor.");
      }

      const record = await store.meetings.insert({
        kind: "meeting",
        ...contact,
        // What the meeting is about, taken from the catalogue card it was booked
        // from. Falls back to `source` for bookings made before this field.
        product:
          str(req.body.product, { field: "el producto", max: 200, required: false }) ||
          productFromSource(req.body.source),
        mode,
        location,
        startDateTime: start.toISOString(),
        endDateTime: end.toISOString(),
        startLabel: calendar.humanLabel(start.toISOString()),
        notes: str(req.body.notes, { field: "los comentarios", max: 1000, required: false }) || "",
        source: str(req.body.source, { field: "el origen", max: 80, required: false }) || "web",
        status: "pendiente",
      });

      let event = null;
      let calendarError = null;
      try {
        event = await calendar.createEvent({ meeting: record });
        if (event) await store.meetings.update(record.id, { calendarEvent: event });
      } catch (error) {
        calendarError = error.message;
        console.error("[calendar] no se pudo crear el evento:", error.message);
      }

      const mails = await mailer.sendRequest({
        kind: "meeting",
        record,
        startLabel: record.startLabel,
      });

      res.status(201).json({
        meeting: { ...record, calendarEvent: event },
        calendarEventCreated: Boolean(event),
        calendarError,
        mailSent: {
          confirmation: !mails.confirmation?.dryRun,
          internal: !mails.internal?.dryRun,
        },
      });
    })
  );

  // ------------------------------------------------------------------ quotes

  /** Quote request: users, what they want, plus the shared contact fields. */
  router.post(
    "/quotes",
    asyncRoute(async (req, res) => {
      const contact = validateContact(req.body);
      assertEmail(contact.email);

      // Users and intents are no longer asked in the form: keep them optional for
      // older clients that still send them, but never fail a request for it.
      const users = Number.isInteger(Number(req.body.users))
        ? Math.max(0, Math.min(100000, Number(req.body.users)))
        : 0;
      const allowed = ["comprar", "arrendar", "servicios"];
      const intents = (Array.isArray(req.body.intents) ? req.body.intents : [])
        .map((value) => String(value))
        .filter((value) => allowed.includes(value));

      const record = await store.quotes.insert({
        kind: "quote",
        ...contact,
        // What the request is about: the catalogue item the form was opened from.
        // Falls back to `source` for requests sent before this field existed.
        product:
          str(req.body.product, { field: "el producto", max: 200, required: false }) ||
          productFromSource(req.body.source),
        users,
        intents,
        additionalServices:
          str(req.body.additionalServices, {
            field: "los servicios adicionales",
            max: 1000,
            required: false,
          }) || "",
        notes:
          str(req.body.notes, { field: "tu consulta", max: 1000, required: false }) ||
          str(req.body.requirements, { field: "tu consulta", max: 1000, required: false }) ||
          "",
        source: str(req.body.source, { field: "el origen", max: 80, required: false }) || "web",
        status: "pendiente",
      });

      const mails = await mailer.sendRequest({ kind: "quote", record });

      res.status(201).json({
        quote: record,
        mailSent: {
          confirmation: !mails.confirmation?.dryRun,
        },
      });
    })
  );

  // ------------------------------------------------------------- admin views

  /** Agenda: meetings between two local dates, for the admin calendar. */
  router.get(
    "/admin/meetings",
    requireAdmin,
    asyncRoute(async (req, res) => {
      const from = req.query.from ? String(req.query.from) : null;
      const to = req.query.to ? String(req.query.to) : null;

      if ((from && !DATE.test(from)) || (to && !DATE.test(to))) {
        throw httpError(400, "Las fechas deben ser YYYY-MM-DD.");
      }

      // Rows are stored in UTC, so the local day has to be converted before
      // comparing; otherwise a meeting can fall outside its own day. `to` is
      // inclusive, matching what the agenda asks for.
      let rows;
      if (from && to) {
        const start = calendar.dayRange(from).from;
        const end = calendar.dayRange(to).to;
        rows = await store.meetings.between(start.toISOString(), end.toISOString());
      } else {
        rows = await store.meetings.all();
      }

      res.json({
        count: rows.length,
        // Bookings made before `product` existed only carry it inside `source`.
        meetings: rows.map((meeting) => ({
          ...meeting,
          product: meeting.product || productFromSource(meeting.source) || undefined,
        })),
      });
    })
  );

  router.get(
    "/admin/quotes",
    requireAdmin,
    asyncRoute(async (_req, res) => {
      const rows = await store.quotes.all();
      // Rows stored before `product` existed only carry it inside `source`.
      res.json({
        count: rows.length,
        quotes: rows.map((quote) => ({
          ...quote,
          product: quote.product || productFromSource(quote.source) || undefined,
        })),
      });
    })
  );

  /** Move a meeting along: pendiente -> confirmada / realizada / cancelada. */
  router.patch(
    "/admin/meetings/:id",
    requireAdmin,
    asyncRoute(async (req, res) => {
      const allowed = ["pendiente", "confirmada", "realizada", "cancelada"];
      const status = String(req.body?.status ?? "");
      if (!allowed.includes(status)) {
        throw httpError(400, `status debe ser uno de: ${allowed.join(", ")}.`);
      }
      const updated = await store.meetings.update(req.params.id, {
        status,
        statusUpdatedAt: clock().toISOString(),
      });
      if (!updated) throw httpError(404, "No encontramos esa reunión.");
      res.json({ meeting: updated });
    })
  );

  /** Small payload the site uses to render the agenda UI state. */
  router.get(
    "/config",
    asyncRoute(async (_req, res) => {
      res.json({
        siteName: config.site.name,
        timezone: calendar.timezone,
        durationMinutes: calendar.durationMinutes,
        mode: calendar.enabled ? "google-calendar" : "local",
        maxDaysAhead: config.meetings.maxDaysAhead,
        minLeadHours: config.meetings.minLeadHours,
      });
    })
  );

  // ------------------------------------------------------------- catalogue

  /** Products shown on the site. Public: only the visible ones. */
  router.get(
    "/catalog",
    asyncRoute(async (_req, res) => {
      const items = await store.catalog.all({ visibleOnly: true });
      res.json({ count: items.length, catalog: items });
    })
  );

  /** Everything, hidden included, for the admin. */
  router.get(
    "/admin/catalog",
    requireAdmin,
    asyncRoute(async (_req, res) => {
      const items = await store.catalog.all();
      res.json({ count: items.length, catalog: items });
    })
  );

  // ------------------------------------------------------------- articles

  const validateArticle = (body) => ({
    title: str(body.title, { field: "el título", max: 200 }),
    excerpt: str(body.excerpt, { field: "el resumen", max: 2000, required: false }) || "",
    content: str(body.content, { field: "el contenido", max: 200000, required: false }) || "",
    picture: str(body.picture, { field: "la imagen", max: 500, required: false }) || undefined,
    pictureAlt:
      str(body.pictureAlt, { field: "el texto alternativo", max: 255, required: false }) || undefined,
    visible: body.visible !== false,
    sortOrder: Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : 0,
    publishedAt: normalizePublishedAt(body.publishedAt),
  });

  /** A slug derived from the title that no existing article uses yet. */
  const uniqueSlug = async (title) => {
    const base = slugify(title) || "articulo";
    let candidate = base;
    let index = 2;
    while (await store.articles.findById(candidate)) {
      candidate = `${base}-${index}`;
      index += 1;
    }
    return candidate;
  };

  const uploadUrl = (req, name) => {
    const proto = req.get("x-forwarded-proto") || req.protocol || "http";
    const host = req.get("x-forwarded-host") || req.get("host") || "";
    return `${proto}://${host}/uploads/${name}`;
  };

  /** Public blog: the articles the menu links to. */
  router.get(
    "/articles",
    asyncRoute(async (_req, res) => {
      const rows = await store.articles.all();
      const articles = sortArticles(rows.filter((article) => article.visible !== false));
      res.json({ count: articles.length, articles });
    })
  );

  router.get(
    "/articles/:slug",
    asyncRoute(async (req, res) => {
      const article = await store.articles.findById(req.params.slug);
      if (!article || article.visible === false) {
        throw httpError(404, "No encontramos ese artículo.");
      }
      res.json({ article });
    })
  );

  /** Everything, drafts and hidden included, for the admin. */
  router.get(
    "/admin/articles",
    requireAdmin,
    asyncRoute(async (_req, res) => {
      const rows = await store.articles.all();
      const articles = sortArticles(rows);
      res.json({ count: articles.length, articles });
    })
  );

  /** Create an article; the slug comes from the title. */
  router.post(
    "/admin/articles",
    requireAdmin,
    asyncRoute(async (req, res) => {
      const record = validateArticle(req.body);
      const slug = await uniqueSlug(record.title);
      const created = await store.articles.insert({ id: slug, ...record });
      res.status(201).json({ article: created });
    })
  );

  /** Edit an article by its slug (the slug itself is immutable). */
  router.patch(
    "/admin/articles/:slug",
    requireAdmin,
    asyncRoute(async (req, res) => {
      const current = await store.articles.findById(req.params.slug);
      if (!current) throw httpError(404, "No encontramos ese artículo.");
      const patch = validateArticle({ ...current, ...req.body });
      const updated = await store.articles.update(req.params.slug, patch);
      res.json({ article: updated });
    })
  );

  router.delete(
    "/admin/articles/:slug",
    requireAdmin,
    asyncRoute(async (req, res) => {
      const removed = await store.articles.remove(req.params.slug);
      if (!removed) throw httpError(404, "No encontramos ese artículo.");
      res.json({ ok: true });
    })
  );

  /** Picture upload for the editor: a base64 data URL, stored under /uploads. */
  router.post(
    "/admin/uploads",
    requireAdmin,
    asyncRoute(async (req, res) => {
      const dataUrl = String(req.body?.dataUrl ?? "").trim();
      const match = /^data:(image\/(?:png|jpe?g|gif|webp));base64,([A-Za-z0-9+/=\s]+)$/.exec(
        dataUrl
      );
      if (!match) {
        throw httpError(400, "La imagen debe ser un data URL (png, jpg, gif o webp).");
      }
      const buffer = Buffer.from(match[2].replace(/\s/g, ""), "base64");
      if (buffer.length === 0) throw httpError(400, "La imagen está vacía.");
      if (buffer.length > config.uploadsMaxBytes) {
        throw httpError(413, "La imagen es demasiado grande (máximo 8 MB).");
      }
      const ext = {
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/gif": "gif",
        "image/webp": "webp",
      }[match[1]];
      const name = `${randomUUID()}.${ext}`;
      await mkdir(config.uploadsDir, { recursive: true });
      await writeFile(join(config.uploadsDir, name), buffer);
      res.status(201).json({ url: uploadUrl(req, name), name });
    })
  );

  /** Test Silogice: record a visitor's answers (one JSON line per submission). */
  router.post(
    "/test-silogice",
    asyncRoute(async (req, res) => {
      const answers = Array.isArray(req.body?.answers) ? req.body.answers.slice(0, 60) : [];
      const score = Number(req.body?.score);
      const record = {
        submittedAt: clock().toISOString(),
        answers,
        score: Number.isFinite(score) ? score : null,
      };
      const file = join(config.dataDir, "test-silogice.jsonl");
      await mkdir(config.dataDir, { recursive: true });
      await appendFile(file, `${JSON.stringify(record)}\n`, "utf8");
      res.status(201).json({ ok: true });
    })
  );

  return router;
};

module.exports = { createRoutes, productFromSource };
module.exports.default = createRoutes;
