-- Media rows point at an R2 prefix (r2_key); variants live at <r2_key>/<width>.webp|avif.
-- r2_key is NULL only for seeded placeholders, which render as empty design boxes.

CREATE TABLE portrait (
  id         INTEGER PRIMARY KEY CHECK (id = 1),
  r2_key     TEXT    NOT NULL,
  width      INTEGER NOT NULL,
  height     INTEGER NOT NULL,
  updated_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE featured (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  r2_key     TEXT,
  title      TEXT    NOT NULL DEFAULT '',
  placement  TEXT    NOT NULL DEFAULT '',
  position   INTEGER NOT NULL,
  width      INTEGER,
  height     INTEGER,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX featured_position ON featured (position);

CREATE TABLE flash (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  r2_key     TEXT,
  name       TEXT    NOT NULL DEFAULT '',
  price      TEXT    NOT NULL DEFAULT '',
  taken      INTEGER NOT NULL DEFAULT 0 CHECK (taken IN (0, 1)),
  position   INTEGER NOT NULL,
  width      INTEGER,
  height     INTEGER,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX flash_position ON flash (position);

CREATE TABLE ig_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ran_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ok         INTEGER NOT NULL CHECK (ok IN (0, 1)),
  error_code TEXT,
  message    TEXT,
  posts      INTEGER NOT NULL DEFAULT 0
);
