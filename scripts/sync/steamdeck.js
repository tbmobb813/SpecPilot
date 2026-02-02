#!/usr/bin/env node
/**
 * Steam Deck Compatibility Sync
 *
 * Fetches Steam Deck verified/playable status from Steam's API
 * and stores it in the steamdeck_compatibility table.
 *
 * Usage:
 *   npm run sync:steamdeck                    # Sync all games in DB
 *   npm run sync:steamdeck -- --popular       # Sync only games with ProtonDB reports (~30k)
 *   npm run sync:steamdeck -- --limit=100     # Sync first 100 games
 *   npm run sync:steamdeck -- --appid=1091500 # Sync specific app
 *   npm run sync:steamdeck -- --popular --limit=1000  # Combine flags
 */

const axios = require('axios');
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', '..', 'src-tauri', 'intelligence.db');

// Rate limiting: Steam API allows ~200 requests per 5 minutes
const RATE_LIMIT_DELAY_MS = 1500; // 1.5 seconds between requests
const BATCH_SIZE = 50;
const BATCH_DELAY_MS = 5000; // 5 second pause between batches

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch Steam Deck compatibility status from Steam's Deck compatibility API
 * Uses the ajaxgetdeckappcompatibilityreport endpoint which has the actual Deck data
 */
async function fetchDeckStatus(appId, retryCount = 0) {
  const MAX_RETRIES = 3;
  const BASE_BACKOFF_MS = 30000; // 30 seconds
  const MAX_BACKOFF_MS = 300000; // 5 minutes

  try {
    const url = `https://store.steampowered.com/saleaction/ajaxgetdeckappcompatibilityreport?nAppID=${appId}`;
    const resp = await axios.get(url, {
      timeout: 15000,
      headers: {
        'User-Agent': 'SpecPilot/1.0 (Game Compatibility Checker)'
      }
    });

    if (!resp.data || resp.data.success !== 1 || !resp.data.results) {
      return null;
    }

    const results = resp.data.results;

    let status = 'unknown';
    let tested = false;
    let notes = null;

    // resolved_category: 0 = Unknown, 1 = Unsupported, 2 = Playable, 3 = Verified
    if (results.resolved_category !== undefined) {
      switch (results.resolved_category) {
        case 3:
          status = 'verified';
          tested = true;
          break;
        case 2:
          status = 'playable';
          tested = true;
          break;
        case 1:
          status = 'unsupported';
          tested = true;
          break;
        default:
          status = 'unknown';
          tested = false;
      }
    }

    // Extract test result notes from loc_tokens
    if (results.resolved_items && Array.isArray(results.resolved_items)) {
      const notesList = results.resolved_items
        .map(item => {
          // Convert loc_token to readable text
          // e.g. "#SteamDeckVerified_TestResult_DefaultControllerConfigFullyFunctional"
          const token = item.loc_token || '';
          return token
            .replace('#SteamDeckVerified_TestResult_', '')
            .replace('#SteamOS_TestResult_', '')
            .replace(/([A-Z])/g, ' $1')
            .trim();
        })
        .filter(Boolean);

      if (notesList.length > 0) {
        notes = notesList.join('; ');
      }
    }

    return {
      status,
      tested,
      notes
    };
  } catch (err) {
    if (err.response && err.response.status === 429) {
      if (retryCount >= MAX_RETRIES) {
        console.warn(`Rate limited on app ${appId}, max retries (${MAX_RETRIES}) exceeded`);
        return null;
      }

      const backoffMs = Math.min(BASE_BACKOFF_MS * Math.pow(2, retryCount), MAX_BACKOFF_MS);
      console.warn(`Rate limited on app ${appId}, retry ${retryCount + 1}/${MAX_RETRIES} after ${backoffMs / 1000}s...`);
      await sleep(backoffMs);
      return fetchDeckStatus(appId, retryCount + 1);
    }

    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
      if (retryCount < MAX_RETRIES) {
        const backoffMs = Math.min(BASE_BACKOFF_MS * Math.pow(2, retryCount), MAX_BACKOFF_MS);
        console.warn(`Timeout on app ${appId}, retry ${retryCount + 1}/${MAX_RETRIES} after ${backoffMs / 1000}s...`);
        await sleep(backoffMs);
        return fetchDeckStatus(appId, retryCount + 1);
      }
    }

    return null;
  }
}

/**
 * Alternative: Fetch from ProtonDB's Steam Deck reports
 * ProtonDB includes Steam Deck specific reports
 */
async function fetchProtonDBDeckReports(appId) {
  try {
    const url = `https://www.protondb.com/api/v1/reports/summaries/${appId}.json`;
    const resp = await axios.get(url, { timeout: 10000 });

    if (resp.data && resp.data.steamDeck) {
      const deckData = resp.data.steamDeck;
      return {
        status: deckData.tier || 'unknown',
        tested: deckData.total > 0,
        notes: `${deckData.total} user reports`
      };
    }
    return null;
  } catch {
    return null;
  }
}

async function main() {
  const args = process.argv.slice(2);
  let limit = null;
  let specificAppId = null;
  let popularOnly = false;

  for (const arg of args) {
    if (arg.startsWith('--limit=')) {
      limit = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--appid=')) {
      specificAppId = arg.split('=')[1];
    } else if (arg === '--popular') {
      popularOnly = true;
    }
  }

  let db;
  try {
    db = new Database(dbPath);
  } catch (err) {
    console.error('Failed to open database:', err.message);
    console.log('Run "npm run intelligence:init" first to create the database.');
    process.exit(1);
  }

  try {
    // Ensure steamdeck_compatibility table exists
    db.exec(`
      CREATE TABLE IF NOT EXISTS steamdeck_compatibility (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        steam_id INTEGER UNIQUE,
        deck_status TEXT,
        deck_tested INTEGER DEFAULT 0,
        recommended_settings TEXT,
        notes TEXT,
        last_synced DATETIME,
        FOREIGN KEY(steam_id) REFERENCES games(steam_id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_steamdeck_game ON steamdeck_compatibility(steam_id);
      CREATE INDEX IF NOT EXISTS idx_steamdeck_status ON steamdeck_compatibility(deck_status);
    `);

    // Get games to sync
    let games;
    if (specificAppId) {
      games = db.prepare('SELECT id, steam_id, name FROM games WHERE steam_id = ?').all(specificAppId);
    } else if (popularOnly) {
      // Only sync games that have actual ProtonDB reports (not 'unknown')
      let query = `
        SELECT g.id, g.steam_id, g.name
        FROM games g
        JOIN proton_compatibility p ON g.id = p.game_id
        WHERE g.steam_id IS NOT NULL
          AND p.protondb_rating != 'unknown'
        ORDER BY p.total_reports DESC
      `;
      if (limit) {
        query += ` LIMIT ${limit}`;
      }
      games = db.prepare(query).all();
      console.log(`Syncing popular games only (with ProtonDB reports)...`);
    } else {
      let query = 'SELECT id, steam_id, name FROM games WHERE steam_id IS NOT NULL';
      if (limit) {
        query += ` LIMIT ${limit}`;
      }
      games = db.prepare(query).all();
    }

    if (games.length === 0) {
      console.log('No games found to sync. Add games first with ProtonDB sync or game import.');
      return;
    }

    console.log(`Syncing Steam Deck compatibility for ${games.length} games...`);

    const upsertStmt = db.prepare(`
      INSERT INTO steamdeck_compatibility (steam_id, deck_status, deck_tested, notes, last_synced)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(steam_id) DO UPDATE SET
        deck_status = excluded.deck_status,
        deck_tested = excluded.deck_tested,
        notes = excluded.notes,
        last_synced = excluded.last_synced
    `);

    let synced = 0;
    let failed = 0;
    let batched = 0;

    for (let i = 0; i < games.length; i++) {
      const game = games[i];

      // Try Steam API first
      let deckInfo = await fetchDeckStatus(game.steam_id);

      // Fallback to ProtonDB Steam Deck reports
      if (!deckInfo) {
        deckInfo = await fetchProtonDBDeckReports(game.steam_id);
      }

      if (deckInfo) {
        const now = new Date().toISOString();
        upsertStmt.run(
          game.steam_id,
          deckInfo.status,
          deckInfo.tested ? 1 : 0,
          deckInfo.notes || null,
          now
        );
        synced++;

        const statusEmoji = {
          'verified': '✅',
          'playable': '🟡',
          'unsupported': '❌',
          'unknown': '❓'
        };
        console.log(`  ${statusEmoji[deckInfo.status] || '❓'} ${game.name || game.steam_id}: ${deckInfo.status}`);
      } else {
        failed++;
      }

      // Rate limiting
      batched++;
      if (batched >= BATCH_SIZE) {
        console.log(`  Pausing after ${BATCH_SIZE} requests...`);
        await sleep(BATCH_DELAY_MS);
        batched = 0;
      } else {
        await sleep(RATE_LIMIT_DELAY_MS);
      }

      // Progress update
      if ((i + 1) % 25 === 0) {
        console.log(`  Progress: ${i + 1}/${games.length} (${synced} synced, ${failed} failed)`);
      }
    }

    console.log('\n--- Steam Deck Sync Complete ---');
    console.log(`Total games: ${games.length}`);
    console.log(`Successfully synced: ${synced}`);
    console.log(`Failed/unavailable: ${failed}`);

    // Summary stats
    const stats = db.prepare(`
      SELECT deck_status, COUNT(*) as count
      FROM steamdeck_compatibility
      GROUP BY deck_status
    `).all();

    console.log('\nDeck Compatibility Breakdown:');
    for (const stat of stats) {
      const emoji = {
        'verified': '✅',
        'playable': '🟡',
        'unsupported': '❌',
        'unknown': '❓'
      };
      console.log(`  ${emoji[stat.deck_status] || '❓'} ${stat.deck_status}: ${stat.count}`);
    }

  } catch (err) {
    console.error('Sync failed:', err.message);
    process.exit(1);
  } finally {
    db.close();
  }
}

main();
