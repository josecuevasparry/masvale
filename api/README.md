# Masvale API

Node/Express service behind the two request buttons on the home page:

| Button | What happens |
| --- | --- |
| **Agendar una reunión** | Asks for organización/empresa, nombre and email, then a date and time (online or presencial). On submit: mails the requester a confirmation, mails `ADMIN_EMAIL` with who asked and when, and creates the event in Google Calendar so the admin agenda shows it. |
| **Solicitar cotización** | Asks for the same three fields plus number of users and whether they want to **comprar**, **arrendar** and/or **servicios adicionales**. Mails the requester and `ADMIN_EMAIL`. |

Requests are stored in **MySQL/MariaDB** (`meetings` and `quotes` tables). If no
database is configured the API falls back to JSON files under `DATA_DIR`, so a
quick local check still works without MySQL.

## Where it runs

The website is static and lives on cPanel; **this service needs a host that runs
Node** (Render, Railway, Fly.io, a VPS…). Point the site at it with
`REACT_APP_API_URL`, then deploy the site to cPanel as usual.

```
cPanel (static React)  --HTTPS-->  Node API (this folder)  -->  MySQL
                                          |                 -->  Google Calendar
                                          |                 -->  SMTP mailbox
                                          +--> DATA_DIR/*.json  (fallback only)
```

## Database

### Local (XAMPP)

XAMPP's MariaDB runs on `127.0.0.1:3306` with user `root` and an empty password.
Create the schema once:

```bash
npm run db:setup          # creates the database + tables, safe to re-run
```

Then `api/.env` (copy of `api/.env.example`) points at it:

```
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=masvale
```

Browse it at <http://localhost/phpmyadmin> → database `masvale` → tables
`meetings` and `quotes`.

### cPanel (production)

1. cPanel → **MySQL® Databases** → *Create New Database* (e.g. `agenda`) and a
   user with a strong password, then **Add User To Database** with *All
   Privileges*. cPanel prefixes both, so they end up like `masvale_agenda` and
   `masvale_user` — use those full names in the environment.
2. cPanel → **phpMyAdmin** → select the database → **Import** →
   `api/schema.sql`. The `CREATE DATABASE` line is commented out on purpose.
3. Set on the Node host:

```
DB_HOST=localhost            # or the host cPanel shows (often localhost)
DB_PORT=3306
DB_USER=masvale_user
DB_PASSWORD=…
DB_NAME=masvale_agenda
```

The two tables are identical locally and in production, so a dump from XAMPP
imports straight into cPanel and vice versa.

### Notes

- `start_datetime`, `end_datetime` and `created_at` are stored in **UTC**; the
  API converts using `CALENDAR_TIMEZONE`. In phpMyAdmin, read them as local time
  with `SELECT CONVERT_TZ(start_datetime, '+00:00', '-03:00')`.
- `intents` is a comma separated list (`comprar,arrendar,servicios`).
- `calendar_event_id` / `calendar_link` / `meet_link` hold the Google Calendar
  event once it is created.

## Endpoints

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/health` | – | Liveness plus which modes are active. |
| GET | `/api/config` | – | Timezone, meeting length, booking window. |
| GET | `/api/meetings/days?from=&days=` | – | Bookable dates for the month picker. |
| GET | `/api/meetings/availability?date=YYYY-MM-DD` | – | Slots for one day, each with `available`. |
| POST | `/api/meetings` | – | Book a meeting. |
| POST | `/api/quotes` | – | Request a quotation. |
| GET | `/api/articles` | – | Published blog articles, in menu order. |
| GET | `/api/articles/:slug` | – | One published article. |
| GET | `/api/admin/meetings?from=&to=` | Bearer | Agenda between two dates. |
| GET | `/api/admin/quotes` | Bearer | All quotation requests. |
| PATCH | `/api/admin/meetings/:id` | Bearer | Set `pendiente/confirmada/realizada/cancelada`. |
| GET | `/api/admin/articles` | Bearer | All articles, drafts and hidden included. |
| POST | `/api/admin/articles` | Bearer | Create an article (slug from the title). |
| PATCH | `/api/admin/articles/:slug` | Bearer | Edit an article. |
| DELETE | `/api/admin/articles/:slug` | Bearer | Delete an article. |
| POST | `/api/admin/uploads` | Bearer | Upload a picture (`{ "dataUrl": "data:image/…;base64,…" }`) → `{ url }`. |

`POST /api/meetings` body:

```json
{
  "organization": "Constructora Andes",
  "name": "Ana Pérez",
  "email": "ana@example.com",
  "mode": "online",
  "date": "2026-04-02",
  "time": "09:00",
  "location": "opcional, solo presencial",
  "notes": "opcional"
}
```

`POST /api/quotes` body:

```json
{
  "organization": "Administración Los Robles",
  "name": "Carla Díaz",
  "email": "carla@example.com",
  "users": 120,
  "intents": ["comprar", "servicios"],
  "additionalServices": "opcional",
  "notes": "opcional"
}
```

## Setup

```bash
npm install                 # nodemailer + mysql2 are used by the API
cp api/.env.example api/.env
$EDITOR api/.env
npm run db:setup            # create the database and tables
npm run api                 # http://localhost:4000
```

With no SMTP credentials the e-mails are printed to the console
(`[mail:dry-run]`) instead of being sent, so the flow can be tested locally.
With no Google credentials the meeting is still stored and mailed, only the
calendar event is skipped.

### Google Calendar credentials

Either option works; the service picks whichever is configured.

**A. Service account** (recommended — no token expiry)

1. Google Cloud Console → create a project → enable the **Google Calendar API**.
2. Create a **service account**, then a **JSON key**; download it.
3. In Google Calendar, share the agenda with the service account e-mail
   (`...@....iam.gserviceaccount.com`) with *Make changes to events*.
4. Set `GOOGLE_SERVICE_ACCOUNT_FILE=./api/google-service-account.json`
   (or paste the JSON as `GOOGLE_SERVICE_ACCOUNT_JSON`, base64 also works) and
   set `GOOGLE_CALENDAR_ID` to the calendar's address.

**B. OAuth refresh token** — set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and
`GOOGLE_REFRESH_TOKEN` obtained with the `https://www.googleapis.com/auth/calendar`
scope.

### Booking rules

`MEETING_START_HOUR`/`MEETING_END_HOUR`, `MEETING_SLOT_MINUTES`,
`MEETING_DURATION_MINUTES`, `MEETING_WEEKDAYS`, `MEETING_MIN_LEAD_HOURS` and
`MEETING_MAX_DAYS_AHEAD` shape the slots the site offers. Busy time comes from
Google Calendar's free/busy, so a slot already taken (by you or by another
visitor) is shown as unavailable and rejected with HTTP 409 if it slips through.

## Admin agenda

The site has a page at **`/agenda`**. It asks for `ADMIN_TOKEN` and then lists
every meeting grouped by day with its status, plus all quotation requests. The
token is kept in `localStorage`, so it is typed once per browser. Keep it long
and random; rotate it by changing `ADMIN_TOKEN` on the server.

## Blog articles

The site's menu links (the old WordPress posts) read from the `articles` table,
with `id` as the slug: `/articulos/<slug>`. On first startup the table is seeded
with the seven Silogice posts (empty content), so the links resolve immediately.

The CRUD lives at **`/admin/articulos`** (same `ADMIN_TOKEN` as `/agenda`): list,
create, edit, delete and upload a picture per article. Uploaded pictures are
written to `UPLOADS_DIR` (default `./uploads`, served at `/uploads`) and the
uploaded URL is stored in the article's `picture`. On the static site set
`UPLOADS_MAX_BYTES` if you need a limit other than 8 MB.

## Tests

```bash
npm run test:api     # 12 tests: routing, validation, storing, mailing, auth
```

They run on Node's built-in test runner with in-memory fakes for mail, calendar
and storage, so nothing external is touched.

## Why CommonJS

The API is `.cjs` (require/module.exports), not ESM. cPanel's **Setup Node.js
App** runs the app through Phusion Passenger, which loads the startup file with
`require()`; pointing it at an ESM file fails with:

```
Error [ERR_REQUIRE_ESM]: require() of ES Module .../server.mjs not supported.
```

So the entry point is `server.cjs`. The tests (`api.test.mjs`) import these CJS
modules through Node's ESM interop, which means what is tested is exactly what
gets deployed.

## Deploying on cPanel ("Setup Node.js App")

1. Upload the contents of `deploy/masvale-api.zip` to a folder such as
   `/home/<user>/masvale-api` — outside `public_html` is safer.
2. **Setup Node.js App → Create Application**:
   - Application root: `masvale-api`
   - Application URL: the API subdomain (e.g. `api.masvale.cl`)
   - **Application startup file: `server.cjs`**
3. Press **Run NPM Install** (or `npm install --omit=dev` over SSH).
4. Add the environment variables (below) in the same screen. Do **not** set
   `PORT`: Passenger provides it.
5. **Restart**, then check `https://api.tu-dominio.cl/health`.

The tables are created on startup when they are missing; if the MySQL user
cannot create tables, import `api/schema.sql` in phpMyAdmin and restart.

## Deploying on a standalone Node host

1. Push this project to the host and set the variables from `api/.env`.
2. Build command: `npm install` · Start command: `npm run api`.
3. Set `CORS_ORIGINS` to your site's origins (`https://masvale.cl,https://www.masvale.cl`).
4. Point `DB_*` at the cPanel database (see **Database → cPanel** above). Shared
   hosts usually only accept local MySQL connections, so either run the API in
   the cPanel account or ask support to whitelist the host's IP.
5. On the site side, set `REACT_APP_API_URL=https://api.tu-dominio.cl` and
   regenerate the site package (`npm run package:deploy`).

Without `DB_*` the API keeps using JSON files, so remember to set `DATA_DIR` to a
persistent path in that case (most hosts wipe the filesystem on redeploy).
