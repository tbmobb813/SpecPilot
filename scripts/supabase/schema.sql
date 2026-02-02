-- SpecPilot Supabase Schema
-- PostgreSQL-compatible schema for shared game data
-- Run this in Supabase SQL Editor or via CLI

-- Enable UUID extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-----------------------------------------------------------
-- GAMES TABLE
-- Core game catalog with Steam IDs and metadata
-----------------------------------------------------------
CREATE TABLE IF NOT EXISTS games (
  id BIGSERIAL PRIMARY KEY,
  steam_id BIGINT UNIQUE,
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
  min_cpu_text TEXT,
  min_ram_mb INTEGER,
  min_gpu_vram_mb INTEGER,
  min_gpu_text TEXT,
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
  requirements_min JSONB,
  requirements_rec JSONB,

  data_source TEXT,
  requirements_parsed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_games_steam_id ON games(steam_id);
CREATE INDEX IF NOT EXISTS idx_games_name ON games(name);
CREATE INDEX IF NOT EXISTS idx_games_genre ON games(genre);
CREATE INDEX IF NOT EXISTS idx_games_year ON games(release_year);

-- Full text search on game names
CREATE INDEX IF NOT EXISTS idx_games_name_search ON games USING gin(to_tsvector('english', name));

-----------------------------------------------------------
-- PROTON COMPATIBILITY
-- ProtonDB ratings and Linux compatibility
-----------------------------------------------------------
CREATE TABLE IF NOT EXISTS proton_compatibility (
  id BIGSERIAL PRIMARY KEY,
  game_id BIGINT REFERENCES games(id) ON DELETE CASCADE,
  steam_id BIGINT,  -- Redundant but useful for direct lookups
  protondb_rating TEXT,  -- 'platinum', 'gold', 'silver', 'bronze', 'borked', 'unknown'
  total_reports INTEGER DEFAULT 0,
  confidence TEXT,  -- 'strong', 'moderate', 'weak'
  trending_tier TEXT,
  last_synced TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(game_id),
  UNIQUE(steam_id)
);

CREATE INDEX IF NOT EXISTS idx_proton_game_id ON proton_compatibility(game_id);
CREATE INDEX IF NOT EXISTS idx_proton_steam_id ON proton_compatibility(steam_id);
CREATE INDEX IF NOT EXISTS idx_proton_rating ON proton_compatibility(protondb_rating);

-----------------------------------------------------------
-- STEAM DECK COMPATIBILITY
-- Valve's official verification status
-----------------------------------------------------------
CREATE TABLE IF NOT EXISTS steamdeck_compatibility (
  id BIGSERIAL PRIMARY KEY,
  steam_id BIGINT UNIQUE NOT NULL,
  deck_status TEXT,  -- 'verified', 'playable', 'unsupported', 'unknown'
  deck_tested BOOLEAN DEFAULT FALSE,
  recommended_settings JSONB,
  notes TEXT,
  last_synced TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_steamdeck_steam_id ON steamdeck_compatibility(steam_id);
CREATE INDEX IF NOT EXISTS idx_steamdeck_status ON steamdeck_compatibility(deck_status);

-----------------------------------------------------------
-- ANTI-CHEAT STATUS
-- Linux anti-cheat support from areweanticheatyet
-----------------------------------------------------------
CREATE TABLE IF NOT EXISTS anti_cheat_status (
  id BIGSERIAL PRIMARY KEY,
  steam_id BIGINT UNIQUE,
  game_name TEXT,
  anti_cheat_type TEXT,  -- 'EasyAntiCheat', 'BattlEye', 'Vanguard', etc.
  linux_status TEXT,  -- 'supported', 'denied', 'broken', 'unknown'
  notes TEXT,
  source TEXT,  -- 'areweanticheatyet', 'manual', etc.
  source_url TEXT,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_anticheat_steam_id ON anti_cheat_status(steam_id);
CREATE INDEX IF NOT EXISTS idx_anticheat_type ON anti_cheat_status(anti_cheat_type);
CREATE INDEX IF NOT EXISTS idx_anticheat_linux_status ON anti_cheat_status(linux_status);

-----------------------------------------------------------
-- GPU CATALOG
-- Hardware database for GPUs
-----------------------------------------------------------
CREATE TABLE IF NOT EXISTS gpus (
  id BIGSERIAL PRIMARY KEY,
  model TEXT UNIQUE NOT NULL,
  vendor TEXT,  -- 'Nvidia', 'AMD', 'Intel'
  vram_mb INTEGER,
  tdp_w INTEGER,
  release_year INTEGER,
  tier INTEGER,  -- 1-7 (Budget to Ultra)
  score REAL,  -- Normalized performance score (0-10000)

  -- Features
  ray_tracing BOOLEAN DEFAULT FALSE,
  dlss TEXT,  -- NULL, '2.0', '3.0'
  fsr TEXT,  -- NULL, '1.0', '2.0', '3.0'
  mesh_shaders BOOLEAN DEFAULT FALSE,

  -- Identifiers
  pci_id TEXT,

  data_source TEXT,
  verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gpus_model ON gpus(model);
CREATE INDEX IF NOT EXISTS idx_gpus_vendor ON gpus(vendor);
CREATE INDEX IF NOT EXISTS idx_gpus_tier ON gpus(tier);
CREATE INDEX IF NOT EXISTS idx_gpus_score ON gpus(score);

-----------------------------------------------------------
-- CPU CATALOG
-- Hardware database for CPUs
-----------------------------------------------------------
CREATE TABLE IF NOT EXISTS cpus (
  id BIGSERIAL PRIMARY KEY,
  model TEXT UNIQUE NOT NULL,
  vendor TEXT,  -- 'Intel', 'AMD'
  cores INTEGER,
  threads INTEGER,
  base_clock_ghz REAL,
  boost_clock_ghz REAL,
  architecture TEXT,
  tier INTEGER,  -- 1-7 (Budget to Ultra)
  score REAL,  -- Normalized performance score (0-10000)

  data_source TEXT,
  verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cpus_model ON cpus(model);
CREATE INDEX IF NOT EXISTS idx_cpus_vendor ON cpus(vendor);
CREATE INDEX IF NOT EXISTS idx_cpus_tier ON cpus(tier);
CREATE INDEX IF NOT EXISTS idx_cpus_score ON cpus(score);

-----------------------------------------------------------
-- METADATA TABLE
-- Schema version and sync timestamps
-----------------------------------------------------------
CREATE TABLE IF NOT EXISTS metadata (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO metadata (key, value) VALUES
  ('schema_version', '1'),
  ('last_protondb_sync', NULL),
  ('last_steamdeck_sync', NULL),
  ('last_anticheat_sync', NULL)
ON CONFLICT (key) DO NOTHING;

-----------------------------------------------------------
-- ROW LEVEL SECURITY (RLS)
-- Public read access, admin-only writes
-----------------------------------------------------------

-- Enable RLS on all tables
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE proton_compatibility ENABLE ROW LEVEL SECURITY;
ALTER TABLE steamdeck_compatibility ENABLE ROW LEVEL SECURITY;
ALTER TABLE anti_cheat_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE gpus ENABLE ROW LEVEL SECURITY;
ALTER TABLE cpus ENABLE ROW LEVEL SECURITY;
ALTER TABLE metadata ENABLE ROW LEVEL SECURITY;

-- Public read policies (anon key can read)
CREATE POLICY "Public read games" ON games FOR SELECT USING (true);
CREATE POLICY "Public read proton" ON proton_compatibility FOR SELECT USING (true);
CREATE POLICY "Public read steamdeck" ON steamdeck_compatibility FOR SELECT USING (true);
CREATE POLICY "Public read anticheat" ON anti_cheat_status FOR SELECT USING (true);
CREATE POLICY "Public read gpus" ON gpus FOR SELECT USING (true);
CREATE POLICY "Public read cpus" ON cpus FOR SELECT USING (true);
CREATE POLICY "Public read metadata" ON metadata FOR SELECT USING (true);

-- Service role can do everything (for sync scripts)
-- Note: Service role bypasses RLS by default, so no explicit policy needed

-----------------------------------------------------------
-- USEFUL VIEWS
-----------------------------------------------------------

-- Combined game view with all compatibility data
CREATE OR REPLACE VIEW games_full AS
SELECT
  g.*,
  p.protondb_rating,
  p.total_reports as proton_reports,
  p.confidence as proton_confidence,
  sd.deck_status,
  sd.deck_tested,
  sd.notes as deck_notes,
  ac.anti_cheat_type,
  ac.linux_status as anticheat_linux_status
FROM games g
LEFT JOIN proton_compatibility p ON g.id = p.game_id
LEFT JOIN steamdeck_compatibility sd ON g.steam_id = sd.steam_id
LEFT JOIN anti_cheat_status ac ON g.steam_id = ac.steam_id;

-- Popular games (with ProtonDB reports)
CREATE OR REPLACE VIEW popular_games AS
SELECT
  g.*,
  p.protondb_rating,
  p.total_reports
FROM games g
JOIN proton_compatibility p ON g.id = p.game_id
WHERE p.protondb_rating != 'unknown' AND p.total_reports > 0
ORDER BY p.total_reports DESC;

-----------------------------------------------------------
-- FUNCTIONS
-----------------------------------------------------------

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to tables with updated_at
CREATE TRIGGER games_updated_at
  BEFORE UPDATE ON games
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER gpus_updated_at
  BEFORE UPDATE ON gpus
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER cpus_updated_at
  BEFORE UPDATE ON cpus
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-----------------------------------------------------------
-- COMMENTS
-----------------------------------------------------------
COMMENT ON TABLE games IS 'Game catalog with Steam IDs and system requirements';
COMMENT ON TABLE proton_compatibility IS 'ProtonDB Linux compatibility ratings';
COMMENT ON TABLE steamdeck_compatibility IS 'Steam Deck verification status from Valve';
COMMENT ON TABLE anti_cheat_status IS 'Anti-cheat software and Linux support status';
COMMENT ON TABLE gpus IS 'GPU hardware catalog with performance tiers';
COMMENT ON TABLE cpus IS 'CPU hardware catalog with performance tiers';
