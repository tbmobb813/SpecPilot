#!/usr/bin/env node
/**
 * Database Seeder for SpecPilot
 *
 * Initializes the database and populates it with:
 * - Popular games from data/popular-games.json
 * - Optionally fetches requirements from Steam
 *
 * Usage:
 *   npm run db:seed                    # Full seed (games + requirements)
 *   npm run db:seed -- --games-only    # Only insert games, no Steam fetch
 *   npm run db:seed -- --limit=20      # Limit Steam API calls
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const DB_PATH = path.join(__dirname, '..', 'src-tauri', 'intelligence.db');
const SCHEMA_PATH = path.join(__dirname, '..', 'src-tauri', 'src', 'database', 'schema.sql');
const GAMES_PATH = path.join(__dirname, '..', 'data', 'popular-games.json');

// Rate limiting for Steam API
const RATE_LIMIT_DELAY_MS = 1500;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function initDatabase() {
  console.log('Initializing database...');

  // Ensure directory exists
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const db = new Database(DB_PATH);

  // Read and execute schema
  if (fs.existsSync(SCHEMA_PATH)) {
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
    db.exec(schema);
    console.log('Schema applied from:', SCHEMA_PATH);
  } else {
    console.warn('Schema file not found, creating minimal tables...');
    db.exec(`
      CREATE TABLE IF NOT EXISTS games (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        steam_id INTEGER UNIQUE,
        name TEXT NOT NULL,
        genre TEXT,
        release_year INTEGER,
        header_image TEXT,
        requirements_min_raw TEXT,
        requirements_rec_raw TEXT,
        min_cpu_cores INTEGER,
        min_cpu_clock_ghz REAL,
        min_cpu_text TEXT,
        min_ram_mb INTEGER,
        min_gpu_vram_mb INTEGER,
        min_gpu_text TEXT,
        min_storage_gb INTEGER,
        min_os TEXT,
        rec_cpu_cores INTEGER,
        rec_cpu_clock_ghz REAL,
        rec_cpu_text TEXT,
        rec_ram_mb INTEGER,
        rec_gpu_vram_mb INTEGER,
        rec_gpu_text TEXT,
        rec_storage_gb INTEGER,
        rec_os TEXT,
        data_source TEXT,
        requirements_parsed INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        updated_at DATETIME
      );
      CREATE INDEX IF NOT EXISTS idx_games_steam ON games(steam_id);
    `);
  }

  return db;
}

function loadGames() {
  if (!fs.existsSync(GAMES_PATH)) {
    console.error('Games file not found:', GAMES_PATH);
    return [];
  }

  const data = fs.readFileSync(GAMES_PATH, 'utf8');
  return JSON.parse(data);
}

async function fetchSteamDetails(appId) {
  try {
    const url = `https://store.steampowered.com/api/appdetails?appids=${appId}&l=english`;
    const resp = await axios.get(url, {
      timeout: 15000,
      headers: {
        'User-Agent': 'SpecPilot/1.0 (Game Compatibility Checker)',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    if (!resp.data || !resp.data[appId] || !resp.data[appId].success) {
      return null;
    }

    return resp.data[appId].data;
  } catch (err) {
    if (err.response && err.response.status === 429) {
      console.warn(`Rate limited, waiting 30s...`);
      await sleep(30000);
      return fetchSteamDetails(appId);
    }
    return null;
  }
}

function parseRam(text) {
  if (!text) return null;
  const gbMatch = text.match(/(\d+)\s*GB\s*(RAM|memory)?/i);
  if (gbMatch) return parseInt(gbMatch[1], 10) * 1024;
  const mbMatch = text.match(/(\d+)\s*MB\s*(RAM|memory)?/i);
  if (mbMatch) return parseInt(mbMatch[1], 10);
  return null;
}

function parseStorage(text) {
  if (!text) return null;
  const match = text.match(/(\d+)\s*GB\s*(available|space|storage)?/i);
  if (match) return parseInt(match[1], 10);
  return null;
}

function parseVram(text) {
  if (!text) return null;
  const gbMatch = text.match(/(\d+)\s*GB\s*(VRAM|video|dedicated)?/i);
  if (gbMatch) return parseInt(gbMatch[1], 10) * 1024;
  const mbMatch = text.match(/(\d+)\s*MB\s*(VRAM|video)?/i);
  if (mbMatch) return parseInt(mbMatch[1], 10);
  return null;
}

function extractCpuText(html) {
  if (!html) return null;
  const match = html.match(/Processor[:\s]*([^<\n]+)/i);
  return match ? match[1].trim() : null;
}

function extractGpuText(html) {
  if (!html) return null;
  const match = html.match(/Graphics[:\s]*([^<\n]+)/i);
  return match ? match[1].trim() : null;
}

function extractRamText(html) {
  if (!html) return null;
  const match = html.match(/Memory[:\s]*([^<\n]+)/i);
  return match ? match[1].trim() : null;
}

function extractStorageText(html) {
  if (!html) return null;
  const match = html.match(/Storage[:\s]*([^<\n]+)/i);
  if (match) return match[1].trim();
  const hd = html.match(/Hard Drive[:\s]*([^<\n]+)/i);
  return hd ? hd[1].trim() : null;
}

async function seedGames(db, games, options = {}) {
  const { fetchRequirements = true, limit = null, verbose = false } = options;

  const insertGame = db.prepare(`
    INSERT INTO games (
      steam_id, name, genre, release_year, header_image,
      requirements_min_raw, requirements_rec_raw,
      min_cpu_text, min_ram_mb, min_gpu_text, min_gpu_vram_mb, min_storage_gb, min_os,
      rec_cpu_text, rec_ram_mb, rec_gpu_text, rec_gpu_vram_mb, rec_storage_gb, rec_os,
      data_source, requirements_parsed, updated_at
    ) VALUES (
      @steam_id, @name, @genre, @release_year, @header_image,
      @requirements_min_raw, @requirements_rec_raw,
      @min_cpu_text, @min_ram_mb, @min_gpu_text, @min_gpu_vram_mb, @min_storage_gb, @min_os,
      @rec_cpu_text, @rec_ram_mb, @rec_gpu_text, @rec_gpu_vram_mb, @rec_storage_gb, @rec_os,
      @data_source, @requirements_parsed, @updated_at
    )
    ON CONFLICT(steam_id) DO UPDATE SET
      name = @name,
      genre = COALESCE(@genre, genre),
      release_year = COALESCE(@release_year, release_year),
      header_image = COALESCE(@header_image, header_image),
      requirements_min_raw = COALESCE(@requirements_min_raw, requirements_min_raw),
      requirements_rec_raw = COALESCE(@requirements_rec_raw, requirements_rec_raw),
      min_cpu_text = COALESCE(@min_cpu_text, min_cpu_text),
      min_ram_mb = COALESCE(@min_ram_mb, min_ram_mb),
      min_gpu_text = COALESCE(@min_gpu_text, min_gpu_text),
      min_gpu_vram_mb = COALESCE(@min_gpu_vram_mb, min_gpu_vram_mb),
      min_storage_gb = COALESCE(@min_storage_gb, min_storage_gb),
      min_os = COALESCE(@min_os, min_os),
      rec_cpu_text = COALESCE(@rec_cpu_text, rec_cpu_text),
      rec_ram_mb = COALESCE(@rec_ram_mb, rec_ram_mb),
      rec_gpu_text = COALESCE(@rec_gpu_text, rec_gpu_text),
      rec_gpu_vram_mb = COALESCE(@rec_gpu_vram_mb, rec_gpu_vram_mb),
      rec_storage_gb = COALESCE(@rec_storage_gb, rec_storage_gb),
      rec_os = COALESCE(@rec_os, rec_os),
      data_source = @data_source,
      requirements_parsed = @requirements_parsed,
      updated_at = @updated_at
  `);

  let processed = 0;
  let fetched = 0;
  let failed = 0;

  const gamesToProcess = limit ? games.slice(0, limit) : games;

  for (const game of gamesToProcess) {
    processed++;
    const steamId = game.steam_id;

    let record = {
      steam_id: steamId,
      name: game.name || `Game ${steamId}`,
      genre: null,
      release_year: null,
      header_image: null,
      requirements_min_raw: null,
      requirements_rec_raw: null,
      min_cpu_text: null,
      min_ram_mb: null,
      min_gpu_text: null,
      min_gpu_vram_mb: null,
      min_storage_gb: null,
      min_os: null,
      rec_cpu_text: null,
      rec_ram_mb: null,
      rec_gpu_text: null,
      rec_gpu_vram_mb: null,
      rec_storage_gb: null,
      rec_os: null,
      data_source: 'seed',
      requirements_parsed: 0,
      updated_at: new Date().toISOString()
    };

    if (fetchRequirements) {
      process.stdout.write(`[${processed}/${gamesToProcess.length}] Fetching ${game.name || steamId}... `);

      const details = await fetchSteamDetails(steamId);

      if (details) {
        record.name = details.name || record.name;
        record.header_image = details.header_image || null;
        record.genre = details.genres ? details.genres.map(g => g.description).join(', ') : null;
        record.release_year = details.release_date?.date
          ? new Date(details.release_date.date).getFullYear() || null
          : null;

        // Parse requirements
        const pcReqs = details.pc_requirements || {};

        if (pcReqs.minimum) {
          record.requirements_min_raw = pcReqs.minimum;
          record.min_cpu_text = extractCpuText(pcReqs.minimum);
          record.min_gpu_text = extractGpuText(pcReqs.minimum);
          record.min_ram_mb = parseRam(extractRamText(pcReqs.minimum));
          record.min_storage_gb = parseStorage(extractStorageText(pcReqs.minimum));
          record.min_gpu_vram_mb = parseVram(pcReqs.minimum);
        }

        if (pcReqs.recommended) {
          record.requirements_rec_raw = pcReqs.recommended;
          record.rec_cpu_text = extractCpuText(pcReqs.recommended);
          record.rec_gpu_text = extractGpuText(pcReqs.recommended);
          record.rec_ram_mb = parseRam(extractRamText(pcReqs.recommended));
          record.rec_storage_gb = parseStorage(extractStorageText(pcReqs.recommended));
          record.rec_gpu_vram_mb = parseVram(pcReqs.recommended);
        }

        record.data_source = 'steam';
        record.requirements_parsed = (record.min_ram_mb || record.rec_ram_mb) ? 1 : 0;

        console.log(`OK (${record.min_ram_mb || '?'}MB RAM, ${record.min_storage_gb || '?'}GB storage)`);
        fetched++;
      } else {
        console.log('FAILED');
        failed++;
      }

      await sleep(RATE_LIMIT_DELAY_MS);
    }

    try {
      insertGame.run(record);
    } catch (err) {
      console.error(`Failed to insert ${game.name}:`, err.message);
    }
  }

  return { processed, fetched, failed };
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    gamesOnly: false,
    limit: null,
    verbose: false
  };

  for (const arg of args) {
    if (arg === '--games-only') {
      options.gamesOnly = true;
    } else if (arg.startsWith('--limit=')) {
      options.limit = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    }
  }

  return options;
}

async function main() {
  const options = parseArgs();

  console.log('=== SpecPilot Database Seeder ===\n');

  // Initialize database
  const db = initDatabase();
  console.log('Database initialized at:', DB_PATH);
  console.log('');

  // Load games
  const games = loadGames();
  console.log(`Loaded ${games.length} games from:`, GAMES_PATH);
  console.log('');

  // Seed games
  console.log('Seeding games...');
  const result = await seedGames(db, games, {
    fetchRequirements: !options.gamesOnly,
    limit: options.limit,
    verbose: options.verbose
  });

  console.log('\n=== Seed Summary ===');
  console.log(`Processed: ${result.processed}`);
  console.log(`Fetched from Steam: ${result.fetched}`);
  console.log(`Failed: ${result.failed}`);

  // Count final records
  const count = db.prepare('SELECT COUNT(*) as count FROM games').get();
  console.log(`\nTotal games in database: ${count.count}`);

  const withReqs = db.prepare('SELECT COUNT(*) as count FROM games WHERE requirements_parsed = 1').get();
  console.log(`Games with parsed requirements: ${withReqs.count}`);

  db.close();
  console.log('\nDone!');
}

main().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
