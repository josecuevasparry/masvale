-- Masvale — MySQL / MariaDB schema.
--
-- Local (XAMPP):
--   C:\xampp\mysql\bin\mysql.exe -u root < api\schema.sql
--   or: npm run db:setup
--
-- cPanel: create the database and user in "MySQL Databases" (cPanel prefixes both
-- with your account name, e.g. masvale_agenda / masvale_user), then import this
-- file through phpMyAdmin > Import. The CREATE DATABASE line is commented out so
-- the import does not fight cPanel's naming.

-- CREATE DATABASE IF NOT EXISTS masvale
--   CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- USE masvale;

-- ---------------------------------------------------------------------------
-- Meetings booked from the site (the admin agenda).
--
-- start_datetime / end_datetime / created_at are stored in **UTC**; the API
-- converts them to and from the calendar timezone (CALENDAR_TIMEZONE). To read
-- them as Chilean time in phpMyAdmin:
--   SELECT CONVERT_TZ(start_datetime, '+00:00', '-03:00') AS start_local ...
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS meetings (
  id                CHAR(36)     NOT NULL,
  kind              VARCHAR(20)  NOT NULL DEFAULT 'meeting',
  organization      VARCHAR(200) NOT NULL,
  name              VARCHAR(120) NOT NULL,
  email             VARCHAR(160) NOT NULL,
  -- Producto o servicio por el que se agenda la reunión (título del catálogo).
  product           VARCHAR(200) NULL,
  mode              VARCHAR(20)  NOT NULL DEFAULT 'online',
  location          VARCHAR(255) NULL,
  start_datetime    DATETIME     NOT NULL,
  end_datetime      DATETIME     NOT NULL,
  start_label       VARCHAR(160) NULL,
  notes             TEXT         NULL,
  source            VARCHAR(80)  NULL,
  status            VARCHAR(20)  NOT NULL DEFAULT 'pendiente',
  calendar_event_id VARCHAR(255) NULL,
  calendar_link     VARCHAR(500) NULL,
  meet_link         VARCHAR(500) NULL,
  created_at        DATETIME     NOT NULL,
  updated_at        DATETIME     NULL,
  PRIMARY KEY (id),
  KEY idx_meetings_start (start_datetime),
  KEY idx_meetings_created (created_at),
  KEY idx_meetings_status (status)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;

-- Columnas agregadas después de la primera versión (el API las crea solo al
-- arrancar; quedan aquí para importarlas a mano si hiciera falta):
-- ALTER TABLE meetings ADD COLUMN product VARCHAR(200) NULL AFTER email;
-- ALTER TABLE quotes   ADD COLUMN product VARCHAR(200) NULL AFTER email;

-- ---------------------------------------------------------------------------
-- Quotation requests.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS quotes (
  id                  CHAR(36)     NOT NULL,
  kind                VARCHAR(20)  NOT NULL DEFAULT 'quote',
  organization        VARCHAR(200) NOT NULL,
  name                VARCHAR(120) NOT NULL,
  email               VARCHAR(160) NOT NULL,
  -- Producto o servicio por el que se cotiza, tal como aparece en el catálogo.
  product             VARCHAR(200) NULL,
  users               INT UNSIGNED NOT NULL,
  intents             VARCHAR(255) NOT NULL DEFAULT '',
  additional_services TEXT         NULL,
  notes               TEXT         NULL,
  source              VARCHAR(80)  NULL,
  status              VARCHAR(20)  NOT NULL DEFAULT 'pendiente',
  created_at          DATETIME     NOT NULL,
  updated_at          DATETIME     NULL,
  PRIMARY KEY (id),
  KEY idx_quotes_created (created_at),
  KEY idx_quotes_status (status)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Catalogue. The site reads its products from here; the JS file is only the
-- fallback when the API (or this table) is not available.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS catalog (
  id            VARCHAR(64)  NOT NULL,
  category      VARCHAR(40)  NOT NULL,
  title         VARCHAR(200) NOT NULL,
  description   TEXT         NULL,
  purchase_type VARCHAR(20)  NULL,
  media_type    VARCHAR(10)  NULL,
  media_src     VARCHAR(255) NULL,
  poster        VARCHAR(255) NULL,
  picture       VARCHAR(255) NULL,
  picture_alt   VARCHAR(255) NULL,
  visible       TINYINT(1)   NOT NULL DEFAULT 1,
  sort_order    INT          NOT NULL DEFAULT 0,
  created_at    DATETIME     NOT NULL,
  updated_at    DATETIME     NULL,
  PRIMARY KEY (id),
  KEY idx_catalog_visible (visible, sort_order)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Artículos del blog. El sitio los lee desde aquí; los enlaces del menú
-- apuntan a /articulos/<id> (el `id` es el slug, como en WordPress).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS articles (
  id            VARCHAR(200) NOT NULL,   -- slug (post_name)
  title         VARCHAR(200) NOT NULL,
  excerpt       TEXT         NULL,
  content       MEDIUMTEXT   NULL,
  picture       VARCHAR(500) NULL,
  picture_alt   VARCHAR(255) NULL,
  visible       TINYINT(1)   NOT NULL DEFAULT 1,
  published_at  DATETIME     NULL,
  sort_order    INT          NOT NULL DEFAULT 0,
  created_at    DATETIME     NOT NULL,
  updated_at    DATETIME     NULL,
  PRIMARY KEY (id),
  KEY idx_articles_visible (visible, sort_order, published_at)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;
