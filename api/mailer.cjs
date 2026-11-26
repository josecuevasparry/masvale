/**
 * Transactional email for the API (CommonJS, for cPanel's require()-based loader).
 *
 * Two messages per submission:
 *   - to the person who asked: "we received your request";
 *   - to the Masvale inbox: who asked, for what, and when.
 *
 * Without SMTP credentials configured the messages are logged instead of sent,
 * so the whole flow can be exercised in development.
 */

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (char) => {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return map[char];
  });

const layout = (siteName, heading, rows, footer = "") => `<!doctype html>
<html lang="es"><body style="margin:0;background:#f5fafd;font-family:Helvetica,Arial,sans-serif;color:#1e293b">
  <div style="max-width:560px;margin:0 auto;padding:24px">
    <div style="background:#264F9E;color:#fff;padding:20px 24px;border-radius:16px 16px 0 0">
      <p style="margin:0;font-size:13px;letter-spacing:.08em;text-transform:uppercase;opacity:.85">${escapeHtml(
        siteName
      )}</p>
      <h1 style="margin:6px 0 0;font-size:20px">${escapeHtml(heading)}</h1>
    </div>
    <div style="background:#fff;padding:24px;border-radius:0 0 16px 16px">
      <table style="width:100%;border-collapse:collapse;font-size:14px">${rows
        .map(([label, value]) =>
          // A row with an empty label is a full-width sentence, not a field.
          label
            ? `<tr>
        <td style="padding:6px 0;color:#64748b;vertical-align:top">${escapeHtml(label)}</td>
        <td style="padding:6px 0;font-weight:600">${escapeHtml(value)}</td>
      </tr>`
            : `<tr>
        <td colspan="2" style="padding:6px 0 10px;line-height:1.5">${escapeHtml(value)}</td>
      </tr>`
        )
        .join("")}</table>
      ${footer}
    </div>
  </div>
</body></html>`;

const textFrom = (heading, rows, footer = "", paragraphs = []) =>
  [
    heading,
    "",
    ...paragraphs,
    ...(paragraphs.length ? [""] : []),
    ...rows.map(([label, value]) => `${label}: ${value}`),
    footer ? `\n${footer}` : "",
  ]
    .filter((line) => line !== undefined && line !== null)
    .join("\n");

/**
 * Confirmation sentence for a booked meeting:
 *
 *   "[nombre], hemos agendado una reunión contigo para el [fecha y hora] en que
 *    conversaremos sobre [producto] para tu organización [organización]."
 *
 * When the meeting was not booked from a catalogue card there is no product, and
 * the sentence stays true by talking about Masvale in general.
 */
const MEETING_PRODUCT_FALLBACK = "los productos y servicios de Masvale";

/** "jueves, 15 de octubre de 2026 · 10:30 hrs (45 min)" -> "... · 10:30 hrs". */
const withoutDuration = (label) => String(label ?? "").replace(/\s*\([^)]*\)\s*$/, "");

const meetingGreeting = (meeting) => {
  const when = meeting.startLabel ? ` para el ${withoutDuration(meeting.startLabel)}` : "";
  const about = meeting.product || MEETING_PRODUCT_FALLBACK;
  const organization = meeting.organization ? ` para tu organización ${meeting.organization}` : "";
  return `${meeting.name}, hemos agendado una reunión contigo${when} en que conversaremos sobre ${about}${organization}.`;
};

const rowSets = {
  meeting: (meeting, config) => [
    ["Tipo", "Reunión"],
    ...(meeting.product ? [["Producto", meeting.product]] : []),
    ["Organización o empresa", meeting.organization],
    ["Nombre", meeting.name],
    ["Email", meeting.email],
    ["Modalidad", meeting.mode === "online" ? "Online (videollamada)" : "Presencial"],
    ...(meeting.mode === "online"
      ? []
      : [["Lugar", meeting.location || config.meetings.defaultLocation]]),
    ["Fecha y hora", meeting.startLabel],
    ["Duración", `${config.meetings.durationMinutes} minutos`],
    ...(meeting.notes ? [["Comentarios", meeting.notes]] : []),
  ],
  quote: (quote) => [
    ["Tipo", "Cotización"],
    ...(quote.product ? [["Producto", quote.product]] : []),
    ["Organización o empresa", quote.organization],
    ["Nombre", quote.name],
    ["Email", quote.email],
    ...(quote.notes ? [["Consulta", quote.notes]] : []),
  ],
};

/**
 * @param {object} config  loaded API config
 * @param {object} [transport] nodemailer transport (injected in tests)
 */
const createMailer = (config, transport) => {
  const from = config.mail.from || config.mail.user;

  const getTransport = async () => {
    if (transport) return transport;
    if (!config.mail.enabled) return null;
    const nodemailer = require("nodemailer");
    return nodemailer.createTransport({
      host: config.mail.host,
      port: config.mail.port,
      secure: config.mail.secure,
      auth: config.mail.user ? { user: config.mail.user, pass: config.mail.pass } : undefined,
    });
  };

  const send = async (message) => {
    const mailer = await getTransport();
    if (!mailer) {
      // eslint-disable-next-line no-console
      console.log(
        `[mail:dry-run] to=${message.to} subject="${message.subject}"` +
          (message.replyTo ? ` replyTo=${message.replyTo}` : "") +
          (message.bcc ? ` bcc=${message.bcc}` : "")
      );
      return { dryRun: true };
    }
    return mailer.sendMail({ from, ...message });
  };

  return {
    /**
     * Confirmation for the requester, plus (for meetings) an internal copy.
     * Quotation requests are a single message to the requester with the team
     * Bcc'd, so nothing else needs to be sent.
     * @returns {Promise<{confirmation: object, internal?: object}>}
     */
    async sendRequest({ kind, record, startLabel }) {
      const rows = rowSets[kind](record, config);
      const isMeeting = kind === "meeting";
      const heading = isMeeting
        ? "Recibimos tu solicitud de reunión"
        : "Recibimos tu solicitud de cotización";

      const thanks = isMeeting
        ? "Te confirmaremos la reunión por este mismo correo. Si necesitas cambiar la fecha, responde a este mensaje."
        : "Recibimos tu solicitud y nos pondremos en contacto contigo a la brevedad.";

      // Booked meetings open with the confirmation sentence; the rows carry the
      // details and the HTML layout prints it as a full-width paragraph.
      const greeting = isMeeting ? meetingGreeting(record) : "";
      const textParagraphs = greeting ? [greeting] : [];
      const htmlRows = greeting ? [["", greeting], ...rows] : rows;

      const confirmation = await send({
        to: record.email,
        replyTo: config.site.adminInbox,
        // Quotation requests go to the person only; the team reads the Bcc.
        bcc: isMeeting ? undefined : config.site.quoteBcc,
        subject: isMeeting
          ? `Recibimos tu solicitud de reunión — ${record.startLabel ?? startLabel ?? ""}`
          : `Recibimos tu solicitud — ${record.product || "Masvale"}`,
        text: textFrom(
          `Hola ${record.name}`,
          isMeeting ? [["Resumen", "Reunión agendada"], ...rows] : [["Resumen", "Cotización solicitada"], ...rows],
          thanks,
          textParagraphs
        ),
        html: layout(
          config.site.name,
          `Hola ${record.name}, recibimos tu solicitud`,
          htmlRows,
          `<p style="margin:16px 0 0;font-size:13px;color:#475569">${escapeHtml(thanks)}</p>`
        ),
      });

      // Meetings keep an internal copy; quotations are covered by the Bcc.
      if (!isMeeting) return { confirmation };

      const internal = await send({
        to: config.site.adminInbox,
        replyTo: record.email,
        subject: `Nueva reunión: ${record.organization} — ${record.startLabel ?? startLabel ?? ""}`,
        text: textFrom(`Nueva solicitud (reunión)`, rows, "", textParagraphs),
        html: layout(config.site.name, heading, htmlRows),
      });

      return { confirmation, internal };
    },
  };
};

module.exports = { createMailer };
module.exports.default = createMailer;
