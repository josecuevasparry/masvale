import { useState } from "react";
import publicApi from "../../services/publicApi";
import { validateMeeting } from "../../utils/formValidation";
import { modeLabel } from "../../utils/meetingMode";
import ContactFields from "./ContactFields";
import CalendarPicker, { prettyDate, useBookableDays, useSlots } from "./CalendarPicker";

const MODES = [
  {
    id: "online",
    label: "Online",
    hint: "Videollamada (te enviamos el enlace)",
    icon: (
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
        <path d="M1 5.5A2.5 2.5 0 0 1 3.5 3h6A2.5 2.5 0 0 1 12 5.5v9A2.5 2.5 0 0 1 9.5 17h-6A2.5 2.5 0 0 1 1 14.5v-9Z" />
        <path d="M13.5 8.2 16.9 6a1 1 0 0 1 1.6.8v6.4a1 1 0 0 1-1.6.8l-3.4-2.2V8.2Z" />
      </svg>
    ),
  },
  {
    id: "presencial",
    label: "Presencial",
    hint: "Nos vemos en la oficina",
    icon: (
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
        <path
          fillRule="evenodd"
          d="M10 18s6-5.2 6-9.5A6 6 0 0 0 4 8.5C4 12.8 10 18 10 18Zm0-7a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"
          clipRule="evenodd"
        />
      </svg>
    ),
  },
];

/**
 * Step 1: who is asking. Step 2: when and how the meeting happens, chosen from
 * the slots the API offers, with a summary to confirm. Step 3 books the calendar
 * and mails both sides.
 */
export default function MeetingForm({ item, onDone }) {
  const [step, setStep] = useState(1);
  const [values, setValues] = useState({
    organization: "",
    name: "",
    email: "",
    notes: "",
    mode: "online",
    location: "",
  });
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  /** True while the summary is waiting for the visitor's confirmation. */
  const [confirming, setConfirming] = useState(false);
  const [errors, setErrors] = useState({});
  const [feedback, setFeedback] = useState("");
  const [sending, setSending] = useState(false);

  const bookable = useBookableDays();
  const slots = useSlots(date);

  const setField = (name, value) => {
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
  };

  const goToCalendar = () => {
    const message = validateMeeting({ ...values, date: "pending", time: "pending" });
    if (message) {
      setErrors({ email: message });
      return;
    }
    setErrors({});
    setStep(2);
  };

  /** Step 3: show the summary (modality included) before anything is sent. */
  const goToConfirm = () => {
    const problem = validateMeeting({ ...values, date, time });
    if (problem) {
      setFeedback(problem);
      return;
    }
    setFeedback("");
    setConfirming(true);
  };

  const submit = async (event) => {
    event.preventDefault();
    const message = validateMeeting({ ...values, date, time });
    if (message) {
      setFeedback(message);
      setConfirming(false);
      return;
    }

    setSending(true);
    setFeedback("");
    try {
      const response = await publicApi.createMeeting({
        ...values,
        date,
        time,
        source: item?.title ? `web:${item.title}` : "web",
      });
      if (!response?.meeting) {
        // A 2xx with no body would otherwise crash the modal.
        throw new Error(
          "El servidor no devolvió la reunión. Revisa que la API esté actualizada e inténtalo de nuevo."
        );
      }
      setConfirming(false);
      onDone?.({
        kind: "meeting",
        record: response.meeting,
        calendarEventCreated: response.calendarEventCreated,
      });
    } catch (error) {
      setFeedback(error.message || "No pudimos agendar la reunión.");
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col gap-3">
      {step === 1 ? (
        <>
          <p className="text-xs text-slate-500">
            Cuéntanos quién eres y te mostramos el calendario.
          </p>
          <ContactFields values={values} errors={errors} onChange={setField} />
          <button
            type="button"
            onClick={goToCalendar}
            className="mt-1 inline-flex items-center justify-center rounded-full bg-[#264F9E] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#1d3f80]"
          >
            Ver el calendario
          </button>
        </>
      ) : (
        <>
          <p className="text-xs text-slate-500">
            {values.name}, elige el día y la hora que te acomoden.
          </p>

          <div>
            <p className="mb-1 text-xs font-semibold text-slate-600">
              ¿Cómo prefieres la reunión?
            </p>
            <div className="flex gap-2">
              {MODES.map((mode) => {
                const selected = values.mode === mode.id;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setField("mode", mode.id)}
                    aria-pressed={selected}
                    aria-label={mode.label}
                    data-testid={`mode-${mode.id}`}
                    className={`flex flex-1 items-start gap-2 rounded-xl border-2 px-3 py-2 text-left transition ${
                      selected
                        ? "border-[#264F9E] bg-[#264F9E] text-white shadow-sm"
                        : "border-slate-300 bg-white text-slate-600 hover:border-[#264F9E]"
                    }`}
                  >
                    <span className={selected ? "text-white" : "text-[#264F9E]"}>{mode.icon}</span>
                    <span className="min-w-0">
                      <span aria-hidden="true" className="block text-sm font-semibold">
                        {mode.label}
                      </span>
                      <span
                        aria-hidden="true"
                        className={`block text-[11px] leading-tight ${
                          selected ? "text-white/85" : "text-slate-500"
                        }`}
                      >
                        {mode.hint}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {values.mode === "presencial" && (
            <div className="shrink-0">
              <label
                htmlFor="meeting-location"
                className="mb-1 block text-xs font-semibold text-slate-600"
              >
                Lugar (opcional)
              </label>
              <input
                id="meeting-location"
                type="text"
                value={values.location}
                onChange={(event) => setField("location", event.target.value)}
                placeholder="Oficina Masvale, Santiago"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#264F9E] focus:ring-2 focus:ring-[#264F9E]/20"
              />
            </div>
          )}

          {bookable.error ? (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">
              {bookable.error}
            </p>
          ) : (
            <CalendarPicker
              bookableDays={bookable.days}
              date={date}
              time={time}
              onDate={setDate}
              onTime={setTime}
              slots={slots.slots}
              loadingSlots={slots.loading}
              error={slots.error}
            />
          )}

          <div className="shrink-0">
            <label
              htmlFor="meeting-notes"
              className="mb-1 block text-xs font-semibold text-slate-600"
            >
              Comentarios (opcional)
            </label>
            <textarea
              id="meeting-notes"
              rows={2}
              value={values.notes}
              onChange={(event) => setField("notes", event.target.value)}
              // `shrink-0` + an explicit minimum height: inside the scrolling
              // flex panel a field with no height is impossible to tap, which is
              // exactly how "the text field does not take text" looks.
              className="block min-h-[44px] w-full shrink-0 resize-y rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#264F9E] focus:ring-2 focus:ring-[#264F9E]/20"
            />
          </div>

          {date && time && (
            <div className="shrink-0 rounded-xl bg-[#264F9E]/5 px-3 py-2">
              <p className="text-xs font-semibold text-[#264F9E]">
                {prettyDate(date)} · {time} hrs
              </p>
              {/* The modality, always in view: online or in person is the detail
                  that is easiest to get wrong, so it never hides. */}
              <p data-testid="meeting-mode-summary" className="text-xs text-slate-600">
                Reunión {modeLabel(values.mode)}
                {values.mode === "presencial"
                  ? ` · ${values.location || "Oficina Masvale, Santiago"}`
                  : ""}
              </p>
            </div>
          )}

          {feedback && (
            <p role="alert" className="shrink-0 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">
              {feedback}
            </p>
          )}

          {/* Last stop: the type of meeting is repeated here and the booking is
              only sent after an explicit confirmation. */}
          {confirming && (
            <div
              data-testid="meeting-confirm"
              role="alert"
              aria-live="polite"
              className="shrink-0 rounded-2xl border-2 border-[#264F9E] bg-white p-3"
            >
              <p className="text-sm font-semibold text-[#264F9E]">
                ¿Confirmas esta reunión {modeLabel(values.mode)}?
              </p>
              <dl className="mt-2 text-xs text-slate-600">
                <div className="flex justify-between gap-3">
                  <dt>Modalidad</dt>
                  <dd className="font-semibold text-slate-800">{modeLabel(values.mode)}</dd>
                </div>
                {values.mode === "presencial" && (
                  <div className="flex justify-between gap-3">
                    <dt>Lugar</dt>
                    <dd className="font-semibold text-slate-800">
                      {values.location || "Oficina Masvale, Santiago"}
                    </dd>
                  </div>
                )}
                <div className="flex justify-between gap-3">
                  <dt>Fecha</dt>
                  <dd className="font-semibold text-slate-800">{prettyDate(date)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>Hora</dt>
                  <dd className="font-semibold text-slate-800">{time} hrs</dd>
                </div>
              </dl>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="rounded-full border-2 border-[#264F9E] px-4 py-2 text-xs font-semibold text-[#264F9E] transition-colors hover:bg-[#264F9E] hover:text-white"
                >
                  Cambiar
                </button>
                <button
                  type="submit"
                  disabled={sending}
                  className="flex-1 rounded-full bg-[#264F9E] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#1d3f80] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {sending ? "Agendando…" : "Sí, confirmar la reunión"}
                </button>
              </div>
            </div>
          )}

          <div className="mt-auto flex gap-2">
            <button
              type="button"
              onClick={() => {
                setConfirming(false);
                setStep(1);
              }}
              className="rounded-full border-2 border-[#264F9E] px-5 py-3 text-sm font-semibold text-[#264F9E] transition-colors hover:bg-[#264F9E] hover:text-white"
            >
              Volver
            </button>
            <button
              type="button"
              onClick={goToConfirm}
              disabled={confirming}
              className="flex-1 rounded-full bg-[#264F9E] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#1d3f80] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Agendar la reunión
            </button>
          </div>
        </>
      )}
    </form>
  );
}
