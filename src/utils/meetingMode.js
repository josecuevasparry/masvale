/**
 * Wording for the meeting modality, shared by the booking form and the
 * confirmation screen so what is chosen is what is shown and what the e-mail
 * says ("Online (videollamada)" / "Presencial").
 */
export const modeLabel = (mode) => (mode === "presencial" ? "Presencial" : "Online (videollamada)");

/** "jueves, 15 de octubre de 2026 · 10:30 hrs (45 min)" -> "... · 10:30 hrs". */
export const withoutDuration = (label) => String(label ?? "").replace(/\s*\([^)]*\)\s*$/, "");
