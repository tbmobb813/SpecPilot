#!/usr/bin/env node
/**
 * Steam Deck Compatibility Sync (Supabase version)
 *
 * Fetches Steam Deck verified/playable status from Steam's API
 * and stores it in Supabase steamdeck_compatibility table.
 *
 * Usage:
 *   npm run sync:steamdeck                    # Sync all games in DB
 *   npm run sync:steamdeck -- --popular       # Sync only games with ProtonDB reports (~30k)
 *   npm run sync:steamdeck -- --limit=100     # Sync first 100 games
 *   npm run sync:steamdeck -- --appid=1091500 # Sync specific app
 *   npm run sync:steamdeck -- --popular --limit=1000  # Combine flags
 */

const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env.local') });
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

// Rate limiting: Steam API allows ~200 requests per 5 minutes
const RATE_LIMIT_DELAY_MS = 1500; // 1.5 seconds between requests
const BATCH_SIZE = 50;
const BATCH_DELAY_MS = 5000; // 5 second pause between batches
const UPSERT_BATCH_SIZE = 100; // Rows per Supabase upsert

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

  // Initialize Supabase client
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
    // Get games to sync from Supabase
    let games = [];

    if (specificAppId) {
      const { data, error } = await supabase
        .from('games')
        .select('id, steam_id, name')
        .eq('steam_id', specificAppId);

      if (error) throw error;
      games = data || [];
    } else if (popularOnly) {
      // Get games with ProtonDB reports (not 'unknown'), ordered by report count
      // Join through game_id since proton_compatibility.steam_id may be null
      const { data, error } = await supabase
        .from('proton_compatibility')
        .select('game_id, protondb_rating, total_reports, games!inner(id, steam_id, name)')
        .neq('protondb_rating', 'unknown')
        .order('total_reports', { ascending: false })
        .limit(limit || 30000);

      if (error) throw error;

      // Flatten the result, filtering out games without steam_id
      games = (data || [])
        .filter(row => row.games && row.games.steam_id)
        .map(row => ({
          id: row.games.id,
          steam_id: row.games.steam_id,
          name: row.games.name
        }));

      console.log(`Syncing popular games only (with ProtonDB reports)...`);
    } else {
      let query = supabase
        .from('games')
        .select('id, steam_id, name')
        .not('steam_id', 'is', null);

      if (limit) {
        query = query.limit(limit);
      }

      const { data, error } = await query;
      if (error) throw error;
      games = data || [];
    }

    if (games.length === 0) {
      console.log('No games found to sync.');
      return;
    }

    console.log(`Syncing Steam Deck compatibility for ${games.length} games...`);

    let synced = 0;
    let failed = 0;
    let batched = 0;
    const pendingUpserts = [];

    for (let i = 0; i < games.length; i++) {
      const game = games[i];

      // Try Steam API
      const deckInfo = await fetchDeckStatus(game.steam_id);

      if (deckInfo) {
        pendingUpserts.push({
          steam_id: game.steam_id,
          deck_status: deckInfo.status,
          deck_tested: deckInfo.tested,
          notes: deckInfo.notes || null,
          last_synced: new Date().toISOString()
        });
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

      // Batch upsert to Supabase
      if (pendingUpserts.length >= UPSERT_BATCH_SIZE) {
        const { error } = await supabase
          .from('steamdeck_compatibility')
          .upsert(pendingUpserts, { onConflict: 'steam_id' });

        if (error) {
          console.error('  Upsert error:', error.message);
        }
        pendingUpserts.length = 0;
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

    // Final upsert for remaining records
    if (pendingUpserts.length > 0) {
      const { error } = await supabase
        .from('steamdeck_compatibility')
        .upsert(pendingUpserts, { onConflict: 'steam_id' });

      if (error) {
        console.error('  Final upsert error:', error.message);
      }
    }

    console.log('\n--- Steam Deck Sync Complete ---');
    console.log(`Total games: ${games.length}`);
    console.log(`Successfully synced: ${synced}`);
    console.log(`Failed/unavailable: ${failed}`);

    // Summary stats from Supabase
    const { data: stats, error: statsError } = await supabase
      .from('steamdeck_compatibility')
      .select('deck_status')
      .not('deck_status', 'is', null);

    if (!statsError && stats) {
      const counts = stats.reduce((acc, row) => {
        acc[row.deck_status] = (acc[row.deck_status] || 0) + 1;
        return acc;
      }, {});

      console.log('\nDeck Compatibility Breakdown:');
      const emoji = {
        'verified': '✅',
        'playable': '🟡',
        'unsupported': '❌',
        'unknown': '❓'
      };
      for (const [status, count] of Object.entries(counts)) {
        console.log(`  ${emoji[status] || '❓'} ${status}: ${count}`);
      }
    }

    // Update metadata
    await supabase
      .from('metadata')
      .upsert({ key: 'last_steamdeck_sync', value: new Date().toISOString() }, { onConflict: 'key' });

  } catch (err) {
    console.error('Sync failed:', err.message);
    process.exit(1);
  }
}

main();
