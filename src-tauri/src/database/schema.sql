-- Intelligence DB schema for SpecPilot

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS gpus (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  model TEXT NOT NULL UNIQUE,
  vendor TEXT,
  vram_mb INTEGER,
  tdp_w INTEGER,
  release_year INTEGER,
  tier INTEGER,
  score REAL,
  data_source TEXT,
  updated_at DATETIME,
  verified INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_gpus_model ON gpus(model);

CREATE TABLE IF NOT EXISTS cpus (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  model TEXT NOT NULL UNIQUE,
  cores INTEGER,
  threads INTEGER,
  base_clock_ghz REAL,
  boost_clock_ghz REAL,
  architecture TEXT,
  tier INTEGER,
  score REAL,
  data_source TEXT,
  created_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_cpus_model ON cpus(model);

CREATE TABLE IF NOT EXISTS games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  steam_id INTEGER UNIQUE,
  name TEXT NOT NULL,
  requirements_min JSON,
  requirements_rec JSON,
  data_source TEXT,
  created_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_games_steam ON games(steam_id);

CREATE TABLE IF NOT EXISTS proton_compatibility (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER,
  protondb_rating TEXT,
  total_reports INTEGER,
  last_synced DATETIME,
  FOREIGN KEY(game_id) REFERENCES games(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS telemetry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER,
  hardware_hash TEXT,
  avg_fps REAL,
  stable INTEGER,
  settings TEXT,
  predicted_verdict TEXT,
  created_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY(game_id) REFERENCES games(id) ON DELETE SET NULL
);

-- Steam Deck compatibility from Valve's verified program
CREATE TABLE IF NOT EXISTS steamdeck_compatibility (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER UNIQUE,
  deck_status TEXT,           -- 'verified', 'playable', 'unsupported', 'unknown'
  deck_tested INTEGER DEFAULT 0,
  recommended_settings TEXT,  -- JSON with recommended settings for Deck
  notes TEXT,
  last_synced DATETIME,
  FOREIGN KEY(game_id) REFERENCES games(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_steamdeck_game ON steamdeck_compatibility(game_id);
CREATE INDEX IF NOT EXISTS idx_steamdeck_status ON steamdeck_compatibility(deck_status);

-- Simple version table
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);

INSERT OR IGNORE INTO meta(key, value) VALUES ('schema_version','1');
