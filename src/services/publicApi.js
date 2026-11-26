/**
 * Client for the Masvale API.
 *
 * The site is served from cPanel while the API runs on its own host, so the
 * base URL comes from REACT_APP_API_URL. When it is empty the requests go to
 * the same origin (use the dev proxy or a same-host deployment).
 *
 * Errors are normalised into ApiError with the message the API returned, so the
 * forms can show something useful to the visitor.
 */

const RAW_BASE = process.env.REACT_APP_API_URL ?? "";
export const API_BASE = RAW_BASE.replace(/\/+$/, "");

export class ApiError extends Error {
  constructor(message, { status, details } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

/**
 * Order of hosts to try for a request: the configured API first, then the site's
 * own origin. The second is a fallback for the cPanel case where the API
 * subdomain is not answering but the same host still routes /api to Node; a
 * request that failed to connect never reached the server, so retrying it is
 * safe even for a POST.
 */
export const requestTargets = (configured = API_BASE, origin = window.location.origin) => {
  const list = [];
  if (configured) list.push({ base: configured, path: (path) => `${configured}${path}` });
  // No point in asking the same host twice.
  if (!configured || configured !== origin) {
    list.push({ base: origin, path: (path) => `${origin}${path}` });
  }
  return list;
};

export const request = async (rawPath, { method = "GET", body, token, signal } = {}) => {
  const origin = window.location.origin;
  const targets = requestTargets(API_BASE, origin);
  let response;
  for (const target of targets) {
    try {
      response = await fetch(target.path(rawPath), {
        method,
        signal,
        headers: {
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      break;
    } catch (attemptError) {
      if (attemptError.name === "AbortError") throw attemptError;
    }
  }

  if (!response) {
    // Every host failed to answer: the host is down, the DNS fails or the
    // connection is blocked. That is a problem of the service, not of the
    // visitor's connection, so the message says where to look.
    const first = targets[0].base;
    throw new ApiError(
      `No pudimos conectar con la API (${first}). ` +
        `Revisa que el servicio esté arriba: ${first}/health. ` +
        "Si esa dirección no responde, la web seguirá fallando aunque tu conexión esté bien."
    );
  }

  // Read as text first: when the request never reaches the API (a static host
  // answering with its SPA page, a WAF, a proxy error) the body is not JSON, and
  // knowing that is what makes the failure diagnosable.
  const raw = await response.text().catch(() => "");
  let payload = null;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new ApiError(payload?.error || `Error ${response.status}`, {
      status: response.status,
      details: payload?.details,
    });
  }

  if (payload === null) {
    throw new ApiError(describeEmptyAnswer(response, raw), { status: response.status });
  }

  return payload;
};

/** Explains a 2xx whose body is not the JSON we expect. */
function describeEmptyAnswer(response, raw) {
  const where = `${API_BASE || window.location.origin}`;
  const type = response.headers?.get?.("content-type") ?? "";
  const looksLikeHtml = /^\s*(<!doctype|<html)/i.test(raw);

  if (looksLikeHtml) {
    return `La dirección ${where} respondió con una página HTML a una llamada de la API, así que la petición no llegó al servicio. Revisa que REACT_APP_API_URL apunte al API (subdominio del "Setup Node.js App") y no al sitio.`;
  }
  if (raw.trim() === "") {
    return `La API en ${where} respondió ${response.status} sin cuerpo. Revisa el log de la aplicación Node en cPanel (pestaña de errores).`;
  }
  return `La API en ${where} respondió algo inesperado (${type || "sin content-type"}): ${raw
    .slice(0, 120)
    .replace(/\s+/g, " ")}`;
}

export const api = {
  config: () => request("/api/config"),

  /**
   * Visible catalogue items. Returns `{ count, catalog }`. The caller falls back
   * to the bundled catalogue when this is unavailable (older API or no API).
   */
  catalog: () => request("/api/catalog"),

  /** Published blog articles, in menu order. Returns `{ count, articles }`. */
  articles: () => request("/api/articles"),

  /** One published article by its slug. Returns `{ article }`. */
  article: (slug) => request(`/api/articles/${encodeURIComponent(slug)}`),

  /** Dates in the next `days` that accept meetings. */
  meetingDays: ({ from, days = 60 } = {}) => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    params.set("days", String(days));
    return request(`/api/meetings/days?${params}`);
  },

  /** Availability for one date. */
  availability: (date, { signal } = {}) =>
    request(`/api/meetings/availability?date=${encodeURIComponent(date)}`, { signal }),

  /**
   * Book a meeting.
   *
   * Accepts both shapes an installation may answer with: `{ meeting: {...} }`
   * (the API in masvale-api.zip) or the meeting object on its own (older builds).
   * On a mismatch it throws with the keys that did arrive, so the cause is
   * visible instead of a generic failure.
   */
  createMeeting: async (payload) => {
    const response = await request("/api/meetings", { method: "POST", body: payload });
    const meeting = response?.meeting ?? response;
    if (!meeting || typeof meeting !== "object" || !meeting.id) {
      throw new ApiError(
        `La API no devolvió la reunión (${describeResponse(response)}). Revisa que la API desplegada sea la del zip masvale-api.zip.`
      );
    }
    return { ...response, meeting, calendarEventCreated: response?.calendarEventCreated };
  },

  /** Ask for a quotation. Same tolerance for the response shape as above. */
  createQuote: async (payload) => {
    const response = await request("/api/quotes", { method: "POST", body: payload });
    const quote = response?.quote ?? response;
    if (!quote || typeof quote !== "object" || !quote.id) {
      throw new ApiError(
        `La API no devolvió la solicitud (${describeResponse(response)}). Revisa que la API desplegada sea la del zip masvale-api.zip.`
      );
    }
    return { ...response, quote };
  },

  admin: {
    meetings: ({ from, to } = {}, token) => {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const query = params.toString();
      return request(`/api/admin/meetings${query ? `?${query}` : ""}`, { token });
    },
    quotes: (token) => request("/api/admin/quotes", { token }),
    setMeetingStatus: (id, status, token) =>
      request(`/api/admin/meetings/${id}`, {
        method: "PATCH",
        token,
        body: { status },
      }),

    /** All articles, drafts and hidden included. Returns `{ count, articles }`. */
    articles: (token) => request("/api/admin/articles", { token }),
    createArticle: (payload, token) =>
      request("/api/admin/articles", { method: "POST", body: payload, token }),
    updateArticle: (slug, payload, token) =>
      request(`/api/admin/articles/${encodeURIComponent(slug)}`, {
        method: "PATCH",
        body: payload,
        token,
      }),
    deleteArticle: (slug, token) =>
      request(`/api/admin/articles/${encodeURIComponent(slug)}`, {
        method: "DELETE",
        token,
      }),

    /** Upload a picture as a base64 data URL; returns `{ url, name }`. */
    uploadImage: (dataUrl, token) =>
      request("/api/admin/uploads", { method: "POST", body: { dataUrl }, token }),
  },
};

/** Short description of a response body, for error messages. */
function describeResponse(response) {
  if (response === null) return "respuesta vacía";
  if (response === undefined) return "sin respuesta";
  if (typeof response !== "object") return `respuesta ${typeof response}`;
  const keys = Object.keys(response);
  return keys.length ? `claves: ${keys.slice(0, 6).join(", ")}` : "objeto vacío";
}

export default api;
