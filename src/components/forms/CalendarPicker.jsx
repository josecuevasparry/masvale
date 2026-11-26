import { useEffect, useState } from "react";
import publicApi from "../../services/publicApi";

const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];

const isoToday = () => new Date().toISOString().slice(0, 10);

/** Calendar month grid, restricted to the days the API says are bookable. */
const monthMatrix = (year, month) => {
  const first = new Date(Date.UTC(year, month, 1));
  const startWeekday = (first.getUTCDay() + 6) % 7; // Monday first
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells = Array.from({ length: startWeekday }, () => null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(
      `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    );
  }
  return cells;
};

const dayNumber = (iso) => Number(iso.slice(8, 10));

const prettyDate = (iso) => {
  const [year, month, day] = iso.split("-").map(Number);
  return `${day} de ${MONTHS[month - 1]} de ${year}`;
};

/**
 * Date grid + time slots. `bookableDays` is the list the API offers, so closed
 * days, holidays and fully booked days simply are not clickable.
 */
export default function CalendarPicker({
  bookableDays = [],
  date,
  time,
  onDate,
  onTime,
  slots = [],
  loadingSlots = false,
  error = "",
  timezone = "",
}) {
  const today = isoToday();
  const initial = date || bookableDays[0] || today;
  const [month, setMonth] = useState(() => {
    const [year, monthNumber] = initial.split("-").map(Number);
    return { year, month: monthNumber - 1 };
  });

  // Keep the visible month around the chosen date.
  useEffect(() => {
    if (!date) return;
    const [year, monthNumber] = date.split("-").map(Number);
    setMonth({ year, month: monthNumber - 1 });
  }, [date]);

  const cells = monthMatrix(month.year, month.month);
  const step = (delta) => {
    const next = new Date(Date.UTC(month.year, month.month + delta, 1));
    setMonth({ year: next.getUTCFullYear(), month: next.getUTCMonth() });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl border border-slate-200 p-3">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label="Mes anterior"
            className="rounded-full px-2 py-1 text-sm font-semibold text-[#264F9E] hover:bg-slate-100"
          >
            ‹
          </button>
          <span className="text-sm font-semibold capitalize text-slate-700">
            {MONTHS[month.month]} {month.year}
          </span>
          <button
            type="button"
            onClick={() => step(1)}
            aria-label="Mes siguiente"
            className="rounded-full px-2 py-1 text-sm font-semibold text-[#264F9E] hover:bg-slate-100"
          >
            ›
          </button>
        </div>

        <div className="mt-2 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-slate-400">
          {WEEKDAYS.map((day, index) => (
            <span key={`${day}-${index}`}>{day}</span>
          ))}
        </div>

        <div className="mt-1 grid grid-cols-7 gap-1">
          {cells.map((iso, index) => {
            if (!iso) return <span key={`empty-${index}`} />;
            const enabled = bookableDays.includes(iso);
            const selected = iso === date;
            return (
              <button
                key={iso}
                type="button"
                disabled={!enabled}
                data-testid={`day-${iso}`}
                onClick={() => {
                  onDate(iso);
                  onTime("");
                }}
                aria-pressed={selected}
                aria-label={prettyDate(iso)}
                className={`rounded-lg py-1.5 text-xs font-semibold transition ${
                  selected
                    ? "bg-[#264F9E] text-white"
                    : enabled
                      ? "text-slate-700 hover:bg-[#264F9E]/10"
                      : "cursor-not-allowed text-slate-300"
                }`}
              >
                {dayNumber(iso)}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-1 text-xs font-semibold text-slate-600">
          Horarios disponibles{timezone ? ` (${timezone})` : ""}
        </p>

        {error && <p className="text-xs text-red-600">{error}</p>}

        {!error && loadingSlots && (
          <p className="text-xs text-slate-500">Cargando horarios…</p>
        )}

        {!error && !loadingSlots && slots.length === 0 && (
          <p className="text-xs text-slate-500">
            No quedan horarios para ese día. Prueba con otra fecha.
          </p>
        )}

        {!error && slots.length > 0 && (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {slots.map((slot) => (
              <button
                key={slot.start}
                type="button"
                disabled={!slot.available}
                data-testid={`slot-${slot.label}`}
                onClick={() => onTime(slot.label)}
                aria-pressed={time === slot.label}
                className={`rounded-lg border px-2 py-1.5 text-xs font-semibold transition ${
                  time === slot.label
                    ? "border-[#264F9E] bg-[#264F9E] text-white"
                    : slot.available
                      ? "border-slate-300 text-slate-700 hover:border-[#264F9E]"
                      : "cursor-not-allowed border-slate-200 text-slate-300 line-through"
                }`}
              >
                {slot.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Loads the bookable days once, for the month grid. */
export const useBookableDays = ({ days = 60 } = {}) => {
  const [state, setState] = useState({ days: [], loading: true, error: "" });

  useEffect(() => {
    const controller = new AbortController();
    publicApi
      .meetingDays({ days })
      .then((data) => setState({ days: data.days ?? [], loading: false, error: "" }))
      .catch((error) => {
        if (error.name === "AbortError") return;
        setState({
          days: [],
          loading: false,
          error: error.message || "No pudimos cargar el calendario.",
        });
      });
    return () => controller.abort();
  }, [days]);

  return state;
};

/** Loads the slots of one date. */
export const useSlots = (date) => {
  const [state, setState] = useState({ slots: [], loading: false, error: "" });

  useEffect(() => {
    if (!date) {
      setState({ slots: [], loading: false, error: "" });
      return undefined;
    }
    const controller = new AbortController();
    setState({ slots: [], loading: true, error: "" });
    publicApi
      .availability(date, { signal: controller.signal })
      .then((data) =>
        setState({ slots: data.slots ?? [], loading: false, error: "" })
      )
      .catch((error) => {
        if (error.name === "AbortError") return;
        setState({ slots: [], loading: false, error: error.message || "Error" });
      });
    return () => controller.abort();
  }, [date]);

  return state;
};

export { prettyDate };
