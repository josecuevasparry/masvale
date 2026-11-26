import { useState } from "react";
import publicApi from "../../services/publicApi";
import { validateQuoteField } from "../../utils/formValidation";
import ContactFields from "./ContactFields";

const FIELD =
  "w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-[#264F9E] focus:ring-2 focus:ring-[#264F9E]/20";

/**
 * Quotation request: who is asking, plus a single message with their special
 * requirements or questions. The catalogue item it was opened from travels in
 * `source`, so the team knows what the request is about without a form field.
 */
export default function QuoteForm({ item, onDone }) {
  const [values, setValues] = useState({
    organization: "",
    name: "",
    email: "",
    notes: "",
  });
  const [errors, setErrors] = useState({});
  const [feedback, setFeedback] = useState("");
  const [sending, setSending] = useState(false);

  const setField = (name, value) => {
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
  };

  const submit = async (event) => {
    event.preventDefault();
    const problem = validateQuoteField(values);
    if (problem) {
      // The message lives on the field itself.
      setErrors({ [problem.field]: problem.message });
      return;
    }
    setErrors({});

    setSending(true);
    setFeedback("");
    try {
      const response = await publicApi.createQuote({
        ...values,
        source: item?.title ? `web:${item.title}` : "web",
      });
      if (!response?.quote) {
        // A 2xx with no body would otherwise crash the modal.
        throw new Error(
          "El servidor no devolvió la solicitud. Revisa que la API esté actualizada e inténtalo de nuevo."
        );
      }
      onDone?.({ kind: "quote", record: response.quote });
    } catch (error) {
      setFeedback(error.message || "No pudimos enviar la solicitud de cotización.");
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col gap-3">
      <ContactFields values={values} errors={errors} onChange={setField} />

      <div>
        <label htmlFor="quote-notes" className="mb-1 block text-xs font-semibold text-slate-600">
          ¿Tienes algún requerimiento especial o consulta?
        </label>
        <textarea
          id="quote-notes"
          rows={4}
          value={values.notes}
          onChange={(event) => setField("notes", event.target.value)}
          placeholder="Cuéntanos qué necesitas y te lo cotizamos."
          className={`${FIELD} ${errors.notes ? "border-red-400" : ""}`}
        />
        {errors.notes && <span className="mt-1 block text-xs text-red-600">{errors.notes}</span>}
      </div>

      {feedback && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">{feedback}</p>
      )}

      <button
        type="submit"
        disabled={sending}
        className="mt-auto inline-flex items-center justify-center rounded-full bg-[#264F9E] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#1d3f80] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {sending ? "Enviando…" : "Solicitar cotización"}
      </button>
    </form>
  );
}
