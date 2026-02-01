/**
 * Anti-Cheat Status Sync Script
 *
 * Fetches game anti-cheat status from areweanticheatyet.com
 * and stores it in the local database for verdict integration.
 *
 * Usage:
 *   npm run sync:anticheat
 *   node scripts/sync/anticheat.js --limit=100
 */

const axios = require('axios');
const Database = require('better-sqlite3');
const path = require('path');

// AreWeAntiCheatYet provides a JSON API
const AWACY_API_URL = 'https://raw.githubusercontent.com/AreWeAntiCheatYet/AreWeAntiCheatYet/refs/heads/master/games.json';

// Database path
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../src-tauri/intelligence.db');

// Map AWACY status values to our schema
const STATUS_MAP = {
  'Supported': 'supported',
  'Running': 'supported',
  'Planned': 'unknown',
  'Broken': 'broken',
  'Denied': 'denied',
  'Unknown': 'unknown',
  '': 'unknown'
};

// Map anti-cheat names
const ANTICHEAT_MAP = {
  'Easy Anti-Cheat': 'EasyAntiCheat',
  'EAC': 'EasyAntiCheat',
  'BattlEye': 'BattlEye',
  'Vanguard': 'Vanguard',
  'PunkBuster': 'PunkBuster',
  'nProtect GameGuard': 'NProtect',
  'GameGuard': 'NProtect',
  'Denuvo Anti-Cheat': 'Denuvo',
  'RICOCHET': 'Other',
  'Arbiter': 'Other',
  'XIGNCODE3': 'Other',
  'Treyarch Anti-Cheat': 'Other',
  'VAC': 'Other', // Valve Anti-Cheat works on Linux
  'Warden': 'Other',
};

function normalizeAntiCheat(name) {
  if (!name) return 'Other';
  return ANTICHEAT_MAP[name] || 'Other';
}

function normalizeStatus(status) {
  if (!status) return 'unknown';
  return STATUS_MAP[status] || 'unknown';
}

async function fetchAntiCheatData() {
  console.log('Fetching anti-cheat data from AreWeAntiCheatYet...');

  try {
    const response = await axios.get(AWACY_API_URL, {
      timeout: 30000,
      headers: {
        'User-Agent': 'SpecPilot/1.0 (game-compatibility-checker)'
      }
    });

    return response.data;
  } catch (error) {
    console.error('Failed to fetch AWACY data:', error.message);
    throw error;
  }
}

function initDatabase(db) {
  // Create table if not exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS anti_cheat_status (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      steam_id INTEGER UNIQUE,
      game_name TEXT,
      anti_cheat_type TEXT,
      linux_status TEXT,
      notes TEXT,
      source TEXT,
      source_url TEXT,
      last_updated DATETIME,
      created_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE INDEX IF NOT EXISTS idx_anticheat_steam ON anti_cheat_status(steam_id);
    CREATE INDEX IF NOT EXISTS idx_anticheat_type ON anti_cheat_status(anti_cheat_type);
    CREATE INDEX IF NOT EXISTS idx_anticheat_status ON anti_cheat_status(linux_status);
  `);
}

async function syncAntiCheat(options = {}) {
  const { limit, verbose } = options;

  // Fetch data
  const games = await fetchAntiCheatData();
  console.log(`Fetched ${games.length} games from AWACY`);

  // Open database
  const db = new Database(DB_PATH);
  initDatabase(db);

  // Prepare upsert statement
  const upsert = db.prepare(`
    INSERT INTO anti_cheat_status (
      steam_id, game_name, anti_cheat_type, linux_status, notes, source, source_url, last_updated
    ) VALUES (
      @steam_id, @game_name, @anti_cheat_type, @linux_status, @notes, @source, @source_url, @last_updated
    )
    ON CONFLICT(steam_id) DO UPDATE SET
      game_name = @game_name,
      anti_cheat_type = @anti_cheat_type,
      linux_status = @linux_status,
      notes = @notes,
      source = @source,
      source_url = @source_url,
      last_updated = @last_updated
  `);

  let processed = 0;
  let inserted = 0;
  let skipped = 0;

  const insertMany = db.transaction((items) => {
    for (const game of items) {
      // Skip games without Steam ID (we can't match them)
      if (!game.storeIds?.steam) {
        skipped++;
        continue;
      }

      const steamId = parseInt(game.storeIds.steam, 10);
      if (isNaN(steamId)) {
        skipped++;
        continue;
      }

      // Get the primary anti-cheat (first one listed)
      const antiCheatList = game.anticheats || [];
      const primaryAntiCheat = antiCheatList[0] || 'Unknown';

      // Get Linux status
      const status = normalizeStatus(game.status);

      // Build notes from updates array
      let notes = '';
      if (game.updates && game.updates.length > 0) {
        notes = game.updates.map(u => `[${u.date}] ${u.name}`).join('; ');
      }
      if (game.notes) {
        notes = notes ? `${notes}; ${game.notes}` : game.notes;
      }

      const record = {
        steam_id: steamId,
        game_name: game.name || 'Unknown',
        anti_cheat_type: normalizeAntiCheat(primaryAntiCheat),
        linux_status: status,
        notes: notes || null,
        source: 'areweanticheatyet',
        source_url: game.url || `https://areweanticheatyet.com/game/${encodeURIComponent(game.slug || game.name)}`,
        last_updated: new Date().toISOString()
      };

      try {
        upsert.run(record);
        inserted++;

        if (verbose) {
          console.log(`  [${status.toUpperCase()}] ${game.name} (${primaryAntiCheat})`);
        }
      } catch (err) {
        console.error(`Failed to insert ${game.name}:`, err.message);
      }

      processed++;

      if (limit && processed >= limit) {
        break;
      }
    }
  });

  // Process in batches
  const batchSize = 100;
  for (let i = 0; i < games.length; i += batchSize) {
    const batch = games.slice(i, i + batchSize);
    insertMany(batch);

    if (limit && processed >= limit) {
      break;
    }
  }

  db.close();

  console.log('\n--- Sync Summary ---');
  console.log(`Total games from AWACY: ${games.length}`);
  console.log(`Processed: ${processed}`);
  console.log(`Inserted/Updated: ${inserted}`);
  console.log(`Skipped (no Steam ID): ${skipped}`);

  return { processed, inserted, skipped };
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    limit: null,
    verbose: false
  };

  for (const arg of args) {
    if (arg.startsWith('--limit=')) {
      options.limit = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    }
  }

  return options;
}

// Main execution
if (require.main === module) {
  const options = parseArgs();

  syncAntiCheat(options)
    .then((result) => {
      console.log('\nSync completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\nSync failed:', error.message);
      process.exit(1);
    });
}

module.exports = { syncAntiCheat, fetchAntiCheatData };
