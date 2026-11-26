import publicApi, { ApiError, request } from "./publicApi";

/**
 * The client must survive the response shapes different API builds answer with,
 * and say what arrived when it cannot. These tests pin that behaviour down,
 * because a shape mismatch is exactly what produces the
 * "La API no devolvió la solicitud" message in the forms.
 */
const jsonResponse = (payload, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => "application/json" },
  text: async () => (payload === null ? "" : JSON.stringify(payload)),
});

const htmlResponse = (body = "<!DOCTYPE html><html><body>app</body></html>", status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => "text/html" },
  text: async () => body,
});

const emptyResponse = (status = 200) => ({
  ok: true,
  status,
  headers: { get: () => null },
  text: async () => "",
});

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

const quote = { id: "q1", organization: "Colegio Sur", email: "a@b.cl", users: 10 };

test("a quote wrapped as { quote } is returned as the record", async () => {
  global.fetch = jest.fn().mockResolvedValue(jsonResponse({ quote, mailSent: {} }));

  const result = await publicApi.createQuote({});
  expect(result.quote).toEqual(quote);
  expect(global.fetch).toHaveBeenCalledWith(
    expect.stringContaining("/api/quotes"),
    expect.objectContaining({ method: "POST" })
  );
});

test("a bare quote record is accepted too (older API builds)", async () => {
  global.fetch = jest.fn().mockResolvedValue(jsonResponse(quote));

  const result = await publicApi.createQuote({});
  expect(result.quote).toEqual(quote);
});

test("a meeting wrapped as { meeting } is returned as the record", async () => {
  const meeting = { id: "m1", organization: "Andes", startLabel: "lunes" };
  global.fetch = jest
    .fn()
    .mockResolvedValue(jsonResponse({ meeting, calendarEventCreated: true }));

  const result = await publicApi.createMeeting({});
  expect(result.meeting).toEqual(meeting);
  expect(result.calendarEventCreated).toBe(true);
});

test("an HTML answer from the static site is reported as a misdirected request", async () => {
  global.fetch = jest.fn().mockResolvedValue(htmlResponse());

  await expect(publicApi.createQuote({})).rejects.toThrow(/respondió con una página HTML/);
  await expect(publicApi.createQuote({})).rejects.toThrow(/REACT_APP_API_URL/);
});

test("an empty 2xx body points at the Node log", async () => {
  global.fetch = jest.fn().mockResolvedValue(emptyResponse(200));

  await expect(publicApi.createQuote({})).rejects.toThrow(/sin cuerpo/);
  await expect(publicApi.createQuote({})).rejects.toThrow(/log de la aplicación Node/);
});

test("an unexpected body is quoted back", async () => {
  global.fetch = jest.fn().mockResolvedValue(htmlResponse("WAF blocked", 200));

  await expect(publicApi.createQuote({})).rejects.toThrow(/WAF blocked/);
});

test("an unusable response names the keys that arrived", async () => {
  global.fetch = jest.fn().mockResolvedValue(jsonResponse({ message: "hola" }));

  await expect(publicApi.createQuote({})).rejects.toBeInstanceOf(ApiError);
  await expect(publicApi.createQuote({})).rejects.toThrow(/claves: message/);

  global.fetch = jest.fn().mockResolvedValue(jsonResponse(null));
  await expect(publicApi.createQuote({})).rejects.toThrow(/sin cuerpo/);

  global.fetch = jest.fn().mockResolvedValue(jsonResponse({}));
  await expect(publicApi.createMeeting({})).rejects.toThrow(/objeto vacío/);
});

test("an HTTP error keeps the message the API sent", async () => {
  global.fetch = jest
    .fn()
    .mockResolvedValue(jsonResponse({ error: "Ese horario ya está tomado." }, 409));

  await expect(publicApi.createMeeting({})).rejects.toThrow("Ese horario ya está tomado.");
});

test("a network failure is reported as a connection problem", async () => {
  global.fetch = jest.fn().mockRejectedValue(new TypeError("Failed to fetch"));

  // The message must not blame the visitor's connection: it points at the API.
  await expect(request("/api/config")).rejects.toThrow(/No pudimos conectar con la API/);
  await expect(request("/api/config")).rejects.toThrow(/servicio esté arriba/i);
  await expect(request("/api/config")).rejects.toThrow(/\/health/);
});

test("when the API host fails, the request is retried on the site's own origin", async () => {
  // This is the cPanel case where api.masvale.cl is not answering but the same
  // host still routes /api to Node. A failed fetch never reached the server, so
  // the retry is safe even for a POST.
  global.fetch = jest
    .fn()
    .mockRejectedValueOnce(new TypeError("Failed to fetch"))
    .mockResolvedValueOnce(jsonResponse({ quote, mailSent: {} }));

  const result = await publicApi.createQuote({ organization: "Sur" });
  expect(result.quote).toEqual(quote);
  expect(global.fetch).toHaveBeenCalledTimes(2);

  const firstUrl = String(global.fetch.mock.calls[0][0]);
  const secondUrl = String(global.fetch.mock.calls[1][0]);
  expect(firstUrl).toMatch(/\/api\/quotes$/);
  expect(secondUrl).toBe(`${window.location.origin}/api/quotes`);
});
