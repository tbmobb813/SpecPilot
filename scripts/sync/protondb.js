#!/usr/bin/env node
/**
 * ProtonDB Sync Script (Supabase version)
 *
 * Fetches ProtonDB summaries and stores them in Supabase.
 *
 * Usage:
 *   npm run sync:protondb
 *   npm run sync:protondb -- --limit=1000
 */

const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env.local') });
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const UPSERT_BATCH_SIZE = 500;

async function main() {
  const args = process.argv.slice(2);
  let limit = null;

  for (const arg of args) {
    if (arg.startsWith('--limit=')) {
      limit = parseInt(arg.split('=')[1], 10);
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
    console.log('Fetching ProtonDB summaries...');

    const candidates = [
      'https://www.protondb.com/api/v1/reports/summaries/latest.json',
      'https://protondb.com/api/v1/reports/summaries/latest.json',
      'https://raw.githubusercontent.com/bdefore/protondb-data/main/reports/summaries/latest.json',
      'https://cdn.jsdelivr.net/gh/bdefore/protondb-data@main/reports/summaries/latest.json',
    ];

    let resp = null;
    let usedUrl = null;

    for (const u of candidates) {
      try {
        resp = await axios.get(u, { timeout: 30000 });
        if (resp && resp.status === 200 && resp.data && typeof resp.data === 'object') {
          usedUrl = u;
          break;
        }
      } catch (e) {
        console.warn('Endpoint', u, 'failed:', e.message);
      }
    }

    if (!resp || !resp.data) {
      console.error('Failed to fetch ProtonDB data from any endpoint');
      process.exit(1);
    }

    const data = resp.data;
    console.log('Fetched ProtonDB data from', usedUrl);

    const entries = Object.entries(data);
    const totalEntries = limit ? Math.min(entries.length, limit) : entries.length;
    console.log(`Processing ${totalEntries} ProtonDB entries...`);

    const now = new Date().toISOString();
    let processed = 0;
    let gamesCreated = 0;
    let protonUpdated = 0;

    // Process in batches
    const gamesToUpsert = [];
    const protonToUpsert = [];

    for (const [appId, report] of entries) {
      if (limit && processed >= limit) break;

      const steamId = parseInt(appId, 10);
      if (isNaN(steamId)) continue;

      const rating = report.tier || report.rating || 'unknown';
      const total = report.total || report.total_reports || 0;
      const gameName = report.title || report.name || `App ${appId}`;
      const confidence = report.confidence || null;
      const trendingTier = report.trendingTier || null;

      // Queue game upsert
      gamesToUpsert.push({
        steam_id: steamId,
        name: gameName,
        data_source: 'protondb-summaries',
        updated_at: now
      });

      processed++;

      // Batch upsert games
      if (gamesToUpsert.length >= UPSERT_BATCH_SIZE) {
        const { error } = await supabase
          .from('games')
          .upsert(gamesToUpsert, { onConflict: 'steam_id', ignoreDuplicates: false });

        if (error) {
          console.error('Games upsert error:', error.message);
        } else {
          gamesCreated += gamesToUpsert.length;
        }
        gamesToUpsert.length = 0;

        // Progress
        console.log(`  Progress: ${processed}/${totalEntries}`);
      }
    }

    // Final games upsert
    if (gamesToUpsert.length > 0) {
      const { error } = await supabase
        .from('games')
        .upsert(gamesToUpsert, { onConflict: 'steam_id', ignoreDuplicates: false });

      if (error) {
        console.error('Games upsert error:', error.message);
      } else {
        gamesCreated += gamesToUpsert.length;
      }
    }

    console.log(`\nGames processed: ${gamesCreated}`);
    console.log('Now updating proton_compatibility...');

    // Now fetch all games to get their IDs for proton_compatibility
    // Process in chunks to avoid memory issues
    processed = 0;

    for (const [appId, report] of entries) {
      if (limit && processed >= limit) break;

      const steamId = parseInt(appId, 10);
      if (isNaN(steamId)) continue;

      const rating = report.tier || report.rating || 'unknown';
      const total = report.total || report.total_reports || 0;
      const confidence = report.confidence || null;
      const trendingTier = report.trendingTier || null;

      // Get game ID
      const { data: gameData } = await supabase
        .from('games')
        .select('id')
        .eq('steam_id', steamId)
        .single();

      if (gameData) {
        protonToUpsert.push({
          game_id: gameData.id,
          steam_id: steamId,
          protondb_rating: rating,
          total_reports: total,
          confidence: confidence,
          trending_tier: trendingTier,
          last_synced: now
        });
      }

      processed++;

      // Batch upsert proton data
      if (protonToUpsert.length >= UPSERT_BATCH_SIZE) {
        const { error } = await supabase
          .from('proton_compatibility')
          .upsert(protonToUpsert, { onConflict: 'game_id' });

        if (error) {
          console.error('Proton upsert error:', error.message);
        } else {
          protonUpdated += protonToUpsert.length;
        }
        protonToUpsert.length = 0;

        console.log(`  Proton progress: ${processed}/${totalEntries}`);
      }
    }

    // Final proton upsert
    if (protonToUpsert.length > 0) {
      const { error } = await supabase
        .from('proton_compatibility')
        .upsert(protonToUpsert, { onConflict: 'game_id' });

      if (error) {
        console.error('Proton upsert error:', error.message);
      } else {
        protonUpdated += protonToUpsert.length;
      }
    }

    // Update metadata
    await supabase
      .from('metadata')
      .upsert({ key: 'last_protondb_sync', value: now }, { onConflict: 'key' });

    console.log('\n--- ProtonDB Sync Complete ---');
    console.log(`Total entries: ${totalEntries}`);
    console.log(`Games created/updated: ${gamesCreated}`);
    console.log(`Proton entries updated: ${protonUpdated}`);

  } catch (err) {
    console.error('Failed to sync ProtonDB:', err.message);
    process.exit(2);
  }
}

main();
