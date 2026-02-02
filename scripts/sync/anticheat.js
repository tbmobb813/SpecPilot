#!/usr/bin/env node
/**
 * Anti-Cheat Status Sync Script (Supabase version)
 *
 * Fetches game anti-cheat status from areweanticheatyet.com
 * and stores it in Supabase for verdict integration.
 *
 * Usage:
 *   npm run sync:anticheat
 *   npm run sync:anticheat -- --limit=100
 *   npm run sync:anticheat -- --verbose
 */

const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env.local') });
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

// AreWeAntiCheatYet provides a JSON API
const AWACY_API_URL = 'https://raw.githubusercontent.com/AreWeAntiCheatYet/AreWeAntiCheatYet/refs/heads/master/games.json';

const UPSERT_BATCH_SIZE = 100;

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
  'VAC': 'Other',
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

  const response = await axios.get(AWACY_API_URL, {
    timeout: 30000,
    headers: {
      'User-Agent': 'SpecPilot/1.0 (game-compatibility-checker)'
    }
  });

  return response.data;
}

async function main() {
  const args = process.argv.slice(2);
  let limit = null;
  let verbose = false;

  for (const arg of args) {
    if (arg.startsWith('--limit=')) {
      limit = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--verbose' || arg === '-v') {
      verbose = true;
    }
  }

  // Initialize Supabase
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Error: Missing Supabase credentials');
    console.log('Set SUPABASE_URL and SUPABASE_SERVICE_KEY in .env.local');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
  });

  console.log('Connected to Supabase:', supabaseUrl);

  try {
    // Fetch data
    const games = await fetchAntiCheatData();
    console.log(`Fetched ${games.length} games from AWACY`);

    const now = new Date().toISOString();
    let processed = 0;
    let inserted = 0;
    let skipped = 0;

    const pendingUpserts = [];

    for (const game of games) {
      // Skip games without Steam ID
      if (!game.storeIds?.steam) {
        skipped++;
        continue;
      }

      const steamId = parseInt(game.storeIds.steam, 10);
      if (isNaN(steamId)) {
        skipped++;
        continue;
      }

      // Get the primary anti-cheat
      const antiCheatList = game.anticheats || [];
      const primaryAntiCheat = antiCheatList[0] || 'Unknown';

      // Get Linux status
      const status = normalizeStatus(game.status);

      // Build notes
      let notes = '';
      if (game.updates && Array.isArray(game.updates) && game.updates.length > 0) {
        notes = game.updates
          .filter(u => u && (u.date || u.name))
          .map(u => `[${u.date || 'unknown'}] ${u.name || 'update'}`)
          .join('; ');
      }
      if (game.notes && typeof game.notes === 'string') {
        notes = notes ? `${notes}; ${game.notes}` : game.notes;
      }

      // Source URL
      let sourceUrl = null;
      if (game.url && typeof game.url === 'string') {
        sourceUrl = game.url;
      } else if (game.slug || game.name) {
        sourceUrl = `https://areweanticheatyet.com/game/${encodeURIComponent(game.slug || game.name || 'unknown')}`;
      }

      pendingUpserts.push({
        steam_id: steamId,
        game_name: (game.name && typeof game.name === 'string') ? game.name : 'Unknown',
        anti_cheat_type: normalizeAntiCheat(primaryAntiCheat),
        linux_status: status,
        notes: (notes && notes.length > 0) ? notes : null,
        source: 'areweanticheatyet',
        source_url: sourceUrl,
        last_updated: now
      });

      if (verbose) {
        console.log(`  [${status.toUpperCase()}] ${game.name} (${primaryAntiCheat})`);
      }

      processed++;
      inserted++;

      if (limit && processed >= limit) {
        break;
      }

      // Batch upsert
      if (pendingUpserts.length >= UPSERT_BATCH_SIZE) {
        const { error } = await supabase
          .from('anti_cheat_status')
          .upsert(pendingUpserts, { onConflict: 'steam_id' });

        if (error) {
          console.error('Upsert error:', error.message);
        }
        pendingUpserts.length = 0;

        console.log(`  Progress: ${processed} processed`);
      }
    }

    // Final upsert
    if (pendingUpserts.length > 0) {
      const { error } = await supabase
        .from('anti_cheat_status')
        .upsert(pendingUpserts, { onConflict: 'steam_id' });

      if (error) {
        console.error('Final upsert error:', error.message);
      }
    }

    // Update metadata
    await supabase
      .from('metadata')
      .upsert({ key: 'last_anticheat_sync', value: now }, { onConflict: 'key' });

    console.log('\n--- Anti-Cheat Sync Complete ---');
    console.log(`Total games from AWACY: ${games.length}`);
    console.log(`Processed: ${processed}`);
    console.log(`Inserted/Updated: ${inserted}`);
    console.log(`Skipped (no Steam ID): ${skipped}`);

    // Summary stats
    const { data: stats } = await supabase
      .from('anti_cheat_status')
      .select('linux_status, anti_cheat_type');

    if (stats) {
      const statusCounts = stats.reduce((acc, row) => {
        acc[row.linux_status] = (acc[row.linux_status] || 0) + 1;
        return acc;
      }, {});

      const typeCounts = stats.reduce((acc, row) => {
        acc[row.anti_cheat_type] = (acc[row.anti_cheat_type] || 0) + 1;
        return acc;
      }, {});

      console.log('\nBy Linux Status:');
      for (const [status, count] of Object.entries(statusCounts).sort((a, b) => b[1] - a[1])) {
        console.log(`  ${status}: ${count}`);
      }

      console.log('\nBy Anti-Cheat Type:');
      for (const [type, count] of Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).slice(0, 10)) {
        console.log(`  ${type}: ${count}`);
      }
    }

  } catch (err) {
    console.error('Sync failed:', err.message);
    process.exit(1);
  }
}

main();
