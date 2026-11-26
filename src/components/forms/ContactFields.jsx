/**
 * Organization, name and email: the three fields both request forms ask for.
 * Shared so the wording and behaviour stay identical.
 *
 * Each input carries its own id, so the label is properly associated.
 */
const FIELD =
  "w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-[#264F9E] focus:ring-2 focus:ring-[#264F9E]/20";

export const CONTACT_FIELDS = [
  { name: "organization", label: "Organización o empresa", type: "text", autoComplete: "organization" },
  { name: "name", label: "Tu nombre", type: "text", autoComplete: "name" },
  { name: "email", label: "Tu email", type: "email", autoComplete: "email" },
];

export default function ContactFields({ values, errors, onChange, disabled, idPrefix = "contact" }) {
  return (
    <div className="flex flex-col gap-3">
      {CONTACT_FIELDS.map(({ name, label, type, autoComplete }) => {
        const id = `${idPrefix}-${name}`;
        const errorId = `${id}-error`;
        return (
          <div key={name}>
            <label htmlFor={id} className="mb-1 block text-xs font-semibold text-slate-600">
              {label}
            </label>
            <input
              id={id}
              name={name}
              type={type}
              value={values[name] ?? ""}
              onChange={(event) => onChange(name, event.target.value)}
              disabled={disabled}
              autoComplete={autoComplete}
              aria-invalid={Boolean(errors[name])}
              aria-describedby={errors[name] ? errorId : undefined}
              className={`${FIELD} ${errors[name] ? "border-red-400" : ""}`}
            />
            {errors[name] && (
              <span id={errorId} className="mt-1 block text-xs text-red-600">
                {errors[name]}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
