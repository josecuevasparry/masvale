/**
 * Prints the exact e-mails a booking produces, without SMTP:
 *   node scripts/preview-meeting-mail.mjs
 */
import { loadConfig } from "../api/config.cjs";
import { createMailer } from "../api/mailer.cjs";

const config = loadConfig({
  ADMIN_EMAIL: "josecuevasparry@gmail.com",
  ADMIN_TOKEN: "preview",
  SMTP_HOST: "smtp.example.com",
  SMTP_USER: "no-reply@masvale.cl",
  SMTP_FROM: "Masvale <no-reply@masvale.cl>",
  SMTP_PASS: "x",
  CALENDAR_TIMEZONE: "America/Santiago",
});

const outbox = [];
const mailer = createMailer(config, {
  sendMail: async (message) => {
    outbox.push(message);
    return { accepted: [message.to] };
  },
});

await mailer.sendRequest({
  kind: "meeting",
  record: {
    organization: "Masvale Consultores",
    name: "JOSE PATRICIO",
    email: "josecuevasparry@gmail.com",
    product: "App de Administración de Condominios",
    mode: "online",
    startLabel: "jueves, 15 de octubre de 2026 · 10:30 hrs (45 min)",
  },
  startLabel: "jueves, 15 de octubre de 2026 · 10:30 hrs (45 min)",
});

const [confirmation, internal] = outbox;
console.log("=== PARA EL CLIENTE ===");
console.log(`Para:    ${confirmation.to}`);
console.log(`Asunto:  ${confirmation.subject}`);
console.log(confirmation.text);
console.log("\n=== COPIA INTERNA ===");
console.log(`Para:    ${internal.to}`);
console.log(`Asunto:  ${internal.subject}`);
console.log(internal.text);
