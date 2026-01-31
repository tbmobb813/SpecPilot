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

  -- Game metadata
  genre TEXT,
  release_year INTEGER,
  header_image TEXT,

  -- Raw requirements text from Steam
  requirements_min_raw TEXT,
  requirements_rec_raw TEXT,

  -- Parsed minimum requirements
  min_cpu_cores INTEGER,
  min_cpu_clock_ghz REAL,
  min_cpu_text TEXT,           -- Original CPU text for display
  min_ram_mb INTEGER,
  min_gpu_vram_mb INTEGER,
  min_gpu_text TEXT,           -- Original GPU text for display
  min_storage_gb INTEGER,
  min_os TEXT,

  -- Parsed recommended requirements
  rec_cpu_cores INTEGER,
  rec_cpu_clock_ghz REAL,
  rec_cpu_text TEXT,
  rec_ram_mb INTEGER,
  rec_gpu_vram_mb INTEGER,
  rec_gpu_text TEXT,
  rec_storage_gb INTEGER,
  rec_os TEXT,

  -- Legacy JSON columns (for backwards compat)
  requirements_min JSON,
  requirements_rec JSON,

  data_source TEXT,
  requirements_parsed INTEGER DEFAULT 0,  -- 1 if successfully parsed
  created_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_games_steam ON games(steam_id);
CREATE INDEX IF NOT EXISTS idx_games_genre ON games(genre);
CREATE INDEX IF NOT EXISTS idx_games_year ON games(release_year);

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

-- Community performance reports (Phase 4)
CREATE TABLE IF NOT EXISTS performance_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER,

  -- Hardware (anonymized)
  hardware_hash TEXT,
  gpu_model TEXT,
  gpu_tier INTEGER,
  cpu_model TEXT,
  cpu_tier INTEGER,
  ram_gb INTEGER,

  -- Settings used
  resolution TEXT,        -- "1080p", "1440p", "4K"
  preset TEXT,            -- "Low", "Medium", "High", "Ultra", "Custom"
  target_fps INTEGER,     -- 30, 60, 120

  -- Specific settings tweaks (JSON)
  settings_details JSON,

  -- Performance results
  avg_fps REAL,
  min_fps REAL,
  stability TEXT,         -- "stable", "some_drops", "unstable"

  -- Meta
  notes TEXT,
  upvotes INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),

  FOREIGN KEY(game_id) REFERENCES games(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_perf_game ON performance_reports(game_id);
CREATE INDEX IF NOT EXISTS idx_perf_gpu ON performance_reports(gpu_tier);

-- Curated benchmark data from YouTube channels
CREATE TABLE IF NOT EXISTS benchmark_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER,
  gpu_model TEXT,
  cpu_model TEXT,
  resolution TEXT,
  preset TEXT,
  avg_fps REAL,
  min_fps REAL,
  source TEXT,            -- "hardware_unboxed", "gamers_nexus", "digital_foundry"
  source_url TEXT,
  video_date DATE,
  created_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),

  FOREIGN KEY(game_id) REFERENCES games(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_bench_game ON benchmark_sources(game_id);
CREATE INDEX IF NOT EXISTS idx_bench_gpu ON benchmark_sources(gpu_model);

-- Simple version table
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);

INSERT OR IGNORE INTO meta(key, value) VALUES ('schema_version','2');
