/**
 * Validation shared by the request forms. Mirrors the API rules so the visitor
 * gets an answer before a round trip, and the API stays the source of truth.
 */
export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const isEmail = (value) => EMAIL.test(String(value ?? "").trim());

export const required = (value, label) =>
  String(value ?? "").trim() ? null : `Ingresa ${label}.`;

/** Organization, name and email, asked for by both forms. */
export const validateContact = ({ organization, name, email }) =>
  required(organization, "la organización o empresa") ??
  required(name, "tu nombre") ??
  required(email, "tu email") ??
  (isEmail(email) ? null : "Revisa tu email: no parece válido.");

/**
 * Contact problems always belong to the email field, since the three fields are
 * filled together; the field name lets the form show the message in place.
 */
export const validateContactField = (values) => {
  const message = validateContact(values);
  return message ? { field: "email", message } : null;
};

export const validateMeeting = (values) =>
  validateContact(values) ??
  (values.date ? null : "Elige una fecha para la reunión.") ??
  (values.time ? null : "Elige un horario para la reunión.");

export const validateMeetingField = (values) => {
  const message = validateContact(values);
  if (message) return { field: "email", message };
  if (!values.date) return { field: "date", message: "Elige una fecha para la reunión." };
  if (!values.time) return { field: "time", message: "Elige un horario para la reunión." };
  return null;
};

export const validateQuote = (values) =>
  validateContact(values) ??
  (String(values.notes ?? "").trim()
    ? null
    : "Cuéntanos qué necesitas cotizar.");

export const validateQuoteField = (values) => {
  const contact = validateContactField(values);
  if (contact) return contact;
  if (!String(values.notes ?? "").trim()) {
    return { field: "notes", message: "Cuéntanos qué necesitas cotizar." };
  }
  return null;
};
