-- Sample rows matching the design's placeholders. No images: they render as the design's empty boxes.
-- Each table is only seeded while empty, so running this against production never touches real data.
-- Multi-row VALUES rather than UNION ALL: D1 caps compound SELECTs at a few terms.

INSERT INTO featured (title, placement, position)
WITH v (title, placement, position) AS (VALUES
  ('Best recent piece', '[Placement]', 1),
  ('Anime piece',       '[Placement]', 2),
  ('Video game piece',  '[Placement]', 3),
  ('New school piece',  '[Placement]', 4),
  ('Samurai piece',     '[Placement]', 5),
  ('Healed piece',      '[Placement]', 6)
)
SELECT title, placement, position FROM v WHERE NOT EXISTS (SELECT 1 FROM featured);

INSERT INTO flash (name, price, taken, position)
WITH v (name, price, position) AS (VALUES
  ('[Name]', '[PRICE]', 1),
  ('[Name]', '[PRICE]', 2),
  ('[Name]', '[PRICE]', 3),
  ('[Name]', '[PRICE]', 4),
  ('[Name]', '[PRICE]', 5)
)
SELECT name, price, 0, position FROM v WHERE NOT EXISTS (SELECT 1 FROM flash);
