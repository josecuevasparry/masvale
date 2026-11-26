import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import publicApi from "../services/publicApi";

const TOKEN_KEY = "masvale_admin_token";

const STATUS_STYLES = {
  pendiente: "bg-amber-100 text-amber-800",
  confirmada: "bg-emerald-100 text-emerald-800",
  realizada: "bg-slate-200 text-slate-700",
  cancelada: "bg-red-100 text-red-700",
};

const isoDate = (date) => date.toISOString().slice(0, 10);

const prettyDay = (iso) =>
  new Intl.DateTimeFormat("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "America/Santiago",
  }).format(new Date(`${iso}T12:00:00Z`));

const prettyTime = (iso) =>
  new Intl.DateTimeFormat("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Santiago",
  }).format(new Date(iso));

/**
 * Admin agenda: every meeting booked from the site, grouped by day, with the
 * status the team works through. Quotes are listed underneath.
 */
export default function AgendaPage() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) ?? "");
  const [draftToken, setDraftToken] = useState("");
  const [meetings, setMeetings] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [range, setRange] = useState(() => {
    const from = new Date();
    const to = new Date(from.getTime() + 30 * 24 * 3600000);
    return { from: isoDate(from), to: isoDate(to) };
  });
  const [state, setState] = useState({ loading: false, error: "" });
  const [busyId, setBusyId] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setState({ loading: true, error: "" });
    try {
      const [agenda, quoteList] = await Promise.all([
        publicApi.admin.meetings(range, token),
        publicApi.admin.quotes(token),
      ]);
      setMeetings(agenda.meetings ?? []);
      setQuotes(quoteList.quotes ?? []);
      setState({ loading: false, error: "" });
    } catch (error) {
      setState({ loading: false, error: error.message || "No pudimos cargar la agenda." });
    }
  }, [token, range]);

  useEffect(() => {
    load();
  }, [load]);

  const signIn = (event) => {
    event.preventDefault();
    localStorage.setItem(TOKEN_KEY, draftToken.trim());
    setToken(draftToken.trim());
    setDraftToken("");
  };

  const signOut = () => {
    localStorage.removeItem(TOKEN_KEY);
    setToken("");
    setMeetings([]);
    setQuotes([]);
  };

  const setStatus = async (meeting, status) => {
    setBusyId(meeting.id);
    try {
      const response = await publicApi.admin.setMeetingStatus(meeting.id, status, token);
      setMeetings((current) =>
        current.map((row) => (row.id === meeting.id ? response.meeting : row))
      );
    } catch (error) {
      setState((current) => ({ ...current, error: error.message }));
    } finally {
      setBusyId("");
    }
  };

  const byDay = useMemo(() => {
    const groups = new Map();
    [...meetings]
      .sort((a, b) => (a.startDateTime ?? "").localeCompare(b.startDateTime ?? ""))
      .forEach((meeting) => {
        const day = (meeting.startDateTime ?? meeting.createdAt).slice(0, 10);
        if (!groups.has(day)) groups.set(day, []);
        groups.get(day).push(meeting);
      });
    return [...groups.entries()];
  }, [meetings]);

  if (!token) {
    return (
      <div className="min-h-screen bg-[#f5fafd] px-4 py-10">
        <form
          onSubmit={signIn}
          className="mx-auto flex w-full max-w-sm flex-col gap-3 rounded-2xl bg-white p-6 shadow-lg"
        >
          <h1 className="text-xl font-semibold text-[#264F9E]">Agenda Masvale</h1>
          <p className="text-sm text-slate-600">
            Ingresa la clave de administración para ver las reuniones agendadas.
          </p>
          <input
            type="password"
            value={draftToken}
            onChange={(event) => setDraftToken(event.target.value)}
            placeholder="ADMIN_TOKEN"
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#264F9E] focus:ring-2 focus:ring-[#264F9E]/20"
          />
          <button
            type="submit"
            className="rounded-full bg-[#264F9E] px-6 py-3 text-sm font-semibold text-white hover:bg-[#1d3f80]"
          >
            Entrar
          </button>
          <Link to="/" className="text-center text-xs text-slate-500 underline">
            Volver al sitio
          </Link>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5fafd] px-4 py-8">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-[#264F9E]">Agenda Masvale</h1>
            <p className="text-sm text-slate-600">
              Reuniones solicitadas desde el sitio y solicitudes de cotización.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/"
              className="rounded-full border border-[#264F9E] px-4 py-2 text-xs font-semibold text-[#264F9E] hover:bg-[#264F9E] hover:text-white"
            >
              Ver el sitio
            </Link>
            <Link
              to="/admin/articulos"
              className="rounded-full border border-[#264F9E] px-4 py-2 text-xs font-semibold text-[#264F9E] hover:bg-[#264F9E] hover:text-white"
            >
              Artículos
            </Link>
            <button
              type="button"
              onClick={signOut}
              className="rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
            >
              Salir
            </button>
          </div>
        </header>

        <div className="flex flex-wrap items-end gap-3 rounded-2xl bg-white p-4 shadow-sm">
          <label className="text-xs font-semibold text-slate-600">
            Desde
            <input
              type="date"
              value={range.from}
              onChange={(event) => setRange((r) => ({ ...r, from: event.target.value }))}
              className="mt-1 block rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Hasta
            <input
              type="date"
              value={range.to}
              onChange={(event) => setRange((r) => ({ ...r, to: event.target.value }))}
              className="mt-1 block rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <button
            type="button"
            onClick={load}
            className="rounded-full bg-[#264F9E] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#1d3f80]"
          >
            Actualizar
          </button>
          {state.loading && <span className="text-xs text-slate-500">Cargando…</span>}
        </div>

        {state.error && (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</p>
        )}

        {!state.loading && byDay.length === 0 && (
          <p className="rounded-2xl bg-white p-6 text-sm text-slate-500 shadow-sm">
            No hay reuniones en ese rango de fechas.
          </p>
        )}

        {byDay.map(([day, rows]) => (
          <section key={day} className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[#264F9E]">
              {prettyDay(day)} · {rows.length} {rows.length === 1 ? "reunión" : "reuniones"}
            </h2>
            <div className="flex flex-col gap-3">
              {rows.map((meeting) => (
                <article
                  key={meeting.id}
                  data-testid="agenda-meeting"
                  className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[#264F9E]">
                        {prettyTime(meeting.startDateTime)} · {meeting.organization}
                      </p>
                      <p className="text-sm text-slate-700">
                        {meeting.name} ·{" "}
                        <a className="underline" href={`mailto:${meeting.email}`}>
                          {meeting.email}
                        </a>
                      </p>
                      <p className="text-xs text-slate-500">
                        {meeting.mode === "online" ? "Online" : `Presencial · ${meeting.location}`}
                        {meeting.notes ? ` · ${meeting.notes}` : ""}
                      </p>
                      {meeting.calendarEvent?.htmlLink && (
                        <a
                          href={meeting.calendarEvent.htmlLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-semibold text-[#264F9E] underline"
                        >
                          Ver en Google Calendar
                        </a>
                      )}
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase ${
                        STATUS_STYLES[meeting.status] ?? "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {meeting.status}
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {["confirmada", "realizada", "cancelada"].map((status) => (
                      <button
                        key={status}
                        type="button"
                        disabled={busyId === meeting.id || meeting.status === status}
                        onClick={() => setStatus(meeting, status)}
                        className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-[#264F9E] hover:text-[#264F9E] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Marcar {status}
                      </button>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[#264F9E]">
            Solicitudes de cotización · {quotes.length}
          </h2>
          {quotes.length === 0 ? (
            <p className="rounded-2xl bg-white p-6 text-sm text-slate-500 shadow-sm">
              Todavía no hay solicitudes de cotización.
            </p>
          ) : (
            quotes.map((quote) => (
              <article
                key={quote.id}
                data-testid="agenda-quote"
                className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100"
              >
                <p className="text-sm font-semibold text-[#264F9E]">
                  {quote.organization} · {quote.users} usuarios
                </p>
                <p className="text-sm text-slate-700">
                  {quote.name} ·{" "}
                  <a className="underline" href={`mailto:${quote.email}`}>
                    {quote.email}
                  </a>
                </p>
                <p className="text-xs text-slate-500">
                  {(quote.intents ?? []).join(", ")}
                  {quote.additionalServices ? ` · ${quote.additionalServices}` : ""}
                  {quote.notes ? ` · ${quote.notes}` : ""}
                </p>
                <p className="mt-1 text-[11px] text-slate-400">
                  Solicitada el {new Date(quote.createdAt).toLocaleString("es-CL")}
                </p>
              </article>
            ))
          )}
        </section>
      </div>
    </div>
  );
}
