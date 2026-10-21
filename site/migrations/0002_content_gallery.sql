-- Editable site text. Missing keys fall back to the defaults in src/lib/content.ts.
CREATE TABLE content (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Portfolio pieces uploaded by hand, shown in their own section. Same shape as featured.
CREATE TABLE gallery (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  r2_key     TEXT,
  title      TEXT    NOT NULL DEFAULT '',
  placement  TEXT    NOT NULL DEFAULT '',
  position   INTEGER NOT NULL,
  width      INTEGER,
  height     INTEGER,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX gallery_position ON gallery (position);
