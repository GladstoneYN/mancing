-- ============================================================
-- Cozy Fishing Game — SQLite Schema
-- ============================================================

-- Players table
CREATE TABLE IF NOT EXISTS players (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  session_token TEXT    UNIQUE,
  appearance    TEXT    NOT NULL DEFAULT '{"bodyColor":"#76d7c4","hat":"none","accessory":"none"}',
  coins         INTEGER NOT NULL DEFAULT 100,
  equipped_rod  TEXT    NOT NULL DEFAULT 'bamboo_rod',
  equipped_cosmetics TEXT NOT NULL DEFAULT '{}',
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  last_login    TEXT    NOT NULL DEFAULT (datetime('now')),
  last_position_x REAL   NOT NULL DEFAULT 0.0,
  last_position_y REAL   NOT NULL DEFAULT 0.0,
  last_position_z REAL   NOT NULL DEFAULT 8.0
);

-- Inventory table
CREATE TABLE IF NOT EXISTS inventory (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id   INTEGER NOT NULL,
  item_type   TEXT    NOT NULL CHECK (item_type IN ('fish', 'rod', 'bait', 'tackle', 'cosmetic')),
  item_id     TEXT    NOT NULL,
  quantity    INTEGER NOT NULL DEFAULT 1,
  metadata    TEXT    NOT NULL DEFAULT '{}',
  obtained_at TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);

-- Fish log (collection / personal records)
CREATE TABLE IF NOT EXISTS fish_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id    INTEGER NOT NULL,
  fish_id      TEXT    NOT NULL,
  largest_size REAL    NOT NULL DEFAULT 0,
  total_caught INTEGER NOT NULL DEFAULT 0,
  first_caught TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (player_id, fish_id),
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);

-- Chat messages
CREATE TABLE IF NOT EXISTS chat_messages (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER NOT NULL,
  message   TEXT    NOT NULL,
  sent_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);

-- ─── Indexes ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_inventory_player    ON inventory(player_id);
CREATE INDEX IF NOT EXISTS idx_inventory_type      ON inventory(player_id, item_type);
CREATE INDEX IF NOT EXISTS idx_fish_log_player     ON fish_log(player_id);
CREATE INDEX IF NOT EXISTS idx_chat_sent           ON chat_messages(sent_at);
CREATE INDEX IF NOT EXISTS idx_players_session     ON players(session_token);
