/**
 * Google Calendar integration.
 *
 * Auth, in order of preference:
 *   1. a service account key (GOOGLE_SERVICE_ACCOUNT_JSON / _FILE);
 *   2. OAuth2 with a long-lived refresh token (GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN).
 *
 * With neither configured the API still works: it books the meeting, sends the
 * mail and stores it, and simply skips the calendar event.
 *
 * Timezone maths is done with Intl, so no date library is needed.
 *
 * CommonJS: cPanel's Node.js App loads the API with require().
 */

const iso = (date) => new Date(date).toISOString();

/** UTC offset of a timezone at a given instant, in minutes. */
const timezoneOffsetMinutes = (timeZone, at = new Date()) => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(at).map((part) => [part.type, part.value])
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second)
  );
  return (asUtc - at.getTime()) / 60000;
};

/** Calendar date (YYYY-MM-DD) of an instant, as seen in a timezone. */
const localDateIn = (timeZone, at = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);

/** Weekday (1=Mon..7=Sun) of a YYYY-MM-DD calendar date. */
const weekdayOf = (date) => {
  const [year, month, day] = date.split("-").map(Number);
  const dayIndex = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0=Sun
  return dayIndex === 0 ? 7 : dayIndex;
};

/** "2026-03-04" + "09:30" in a timezone -> UTC Date. */
const zonedDateTime = (timeZone, date, time) => {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const naive = Date.UTC(year, month - 1, day, hour, minute, 0);
  // Two passes settle the offset even across a DST boundary.
  let guess = new Date(naive - timezoneOffsetMinutes(timeZone, new Date(naive)) * 60000);
  guess = new Date(naive - timezoneOffsetMinutes(timeZone, guess) * 60000);
  return guess;
};

const humanLabel = (timeZone, start, durationMinutes) =>
  `${new Intl.DateTimeFormat("es-CL", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(start)} · ${new Intl.DateTimeFormat("es-CL", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(start)} hrs (${durationMinutes} min)`;

const createCalendar = (config) => {
  const { timezone, id: calendarId, durationMinutes } = {
    timezone: config.calendar.timezone,
    id: config.calendar.id,
    durationMinutes: config.meetings.durationMinutes,
  };

  let clientPromise = null;

  const getClient = async () => {
    if (!config.calendar.enabled) return null;
    if (!clientPromise) {
      clientPromise = (async () => {
        const { google } = require("googleapis");
        if (config.calendar.serviceAccount) {
          const auth = new google.auth.JWT({
            email: config.calendar.serviceAccount.client_email,
            key: config.calendar.serviceAccount.private_key,
            scopes: ["https://www.googleapis.com/auth/calendar"],
          });
          return google.calendar({ version: "v3", auth });
        }
        const auth = new google.auth.OAuth2(
          config.calendar.oauth.clientId,
          config.calendar.oauth.clientSecret
        );
        auth.setCredentials({ refresh_token: config.calendar.oauth.refreshToken });
        return google.calendar({ version: "v3", auth });
      })();
    }
    return clientPromise;
  };

  /** Slot grid for one calendar day, using the configured business hours. */
  const slotsForDate = (date) => {
    const { startHour, endHour, slotMinutes } = config.meetings;
    if (!config.meetings.weekdays.includes(weekdayOf(date))) return [];
    const slots = [];
    for (
      let minutes = startHour * 60;
      minutes + durationMinutes <= endHour * 60;
      minutes += slotMinutes
    ) {
      const hour = String(Math.floor(minutes / 60)).padStart(2, "0");
      const minute = String(minutes % 60).padStart(2, "0");
      const start = zonedDateTime(timezone, date, `${hour}:${minute}`);
      slots.push({
        start: iso(start),
        end: iso(new Date(start.getTime() + durationMinutes * 60000)),
        label: new Intl.DateTimeFormat("es-CL", {
          timeZone: timezone,
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).format(start),
      });
    }
    return slots;
  };

  const busyRanges = async (from, to) => {
    const calendar = await getClient();
    if (!calendar) return [];
    const response = await calendar.freebusy.query({
      requestBody: {
        timeMin: iso(from),
        timeMax: iso(to),
        timeZone: timezone,
        items: [{ id: calendarId }],
      },
    });
    const busy = response.data?.calendars?.[calendarId]?.busy ?? [];
    return busy.map((range) => ({ start: range.start, end: range.end }));
  };

  const overlaps = (start, end, ranges) =>
    ranges.some(
      (range) => new Date(range.start) < new Date(end) && new Date(range.end) > new Date(start)
    );

  /** Bookable slots for one date, with the taken ones marked. */
  const availability = async (date) => {
    const slots = slotsForDate(date);
    if (slots.length === 0) return [];

    const from = new Date(slots[0].start);
    const to = new Date(slots[slots.length - 1].end);
    const busy = await busyRanges(from, to);
    const earliest = new Date(Date.now() + config.meetings.minLeadHours * 3600000);

    return slots.map((slot) => ({
      ...slot,
      available: !overlaps(slot.start, slot.end, busy) && new Date(slot.start) >= earliest,
    }));
  };

  return {
    enabled: config.calendar.enabled,
    timezone,
    durationMinutes,

    slotsForDate,
    availability,

    /** UTC range covering a local date, used for calendar queries. */
    dayRange: (date) => {
      const start = zonedDateTime(timezone, date, "00:00");
      return { from: start, to: new Date(start.getTime() + 24 * 3600000) };
    },

    isBookable: (date) => slotsForDate(date).length > 0,

    async ensureFree(startIso, endIso) {
      if (!config.calendar.enabled) return true;
      const busy = await busyRanges(new Date(startIso), new Date(endIso));
      return !overlaps(startIso, endIso, busy);
    },

    humanLabel: (startIso) => humanLabel(timezone, new Date(startIso), durationMinutes),

    /**
     * Creates the calendar event for the admin agenda.
     * @returns {Promise<{id: string, htmlLink: string} | null>}
     */
    async createEvent({ meeting }) {
      const calendar = await getClient();
      if (!calendar) return null;

      const isOnline = meeting.mode === "online";
      const description = [
        `Solicitado desde ${config.site.name}`,
        "",
        `Organización o empresa: ${meeting.organization}`,
        `Nombre: ${meeting.name}`,
        `Email: ${meeting.email}`,
        meeting.notes ? `Comentarios: ${meeting.notes}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      const requestBody = {
        summary: `Reunión Masvale · ${meeting.organization}`,
        description,
        start: { dateTime: meeting.startDateTime, timeZone: timezone },
        end: { dateTime: meeting.endDateTime, timeZone: timezone },
        location: isOnline ? "Videollamada (enlace por confirmar)" : meeting.location,
        attendees: [{ email: meeting.email, displayName: meeting.name }],
        conferenceData: isOnline
          ? {
              createRequest: {
                requestId: meeting.id ?? `masvale-${Date.now()}`,
                conferenceSolutionKey: { type: "hangoutsMeet" },
              },
            }
          : undefined,
        reminders: { useDefault: true },
      };

      const response = await calendar.events.insert({
        calendarId,
        conferenceDataVersion: isOnline ? 1 : 0,
        sendUpdates: "all",
        requestBody,
      });

      return {
        id: response.data?.id ?? null,
        htmlLink: response.data?.htmlLink ?? null,
        meetLink: response.data?.hangoutLink ?? null,
      };
    },
  };
};

module.exports = {
  createCalendar,
  timezoneOffsetMinutes,
  localDateIn,
  weekdayOf,
  zonedDateTime,
};
module.exports.default = createCalendar;
