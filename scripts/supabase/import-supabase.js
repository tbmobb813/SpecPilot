#!/usr/bin/env node
/**
 * Import JSON data to Supabase
 *
 * Prerequisites:
 *   1. Run export-sqlite.js first
 *   2. Create Supabase project and run schema.sql
 *   3. Set environment variables:
 *      - SUPABASE_URL
 *      - SUPABASE_SERVICE_KEY (not anon key!)
 *
 * Usage:
 *   npm run import:supabase
 *   node scripts/supabase/import-supabase.js
 *
 * Options:
 *   --table=games        Import only specific table
 *   --dry-run            Show what would be imported without importing
 *   --batch-size=1000    Rows per batch (default: 1000)
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env.local') });
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const INPUT_DIR = path.join(__dirname, '..', '..', 'tmp', 'supabase-export');
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '1000', 10);

// Import order matters for foreign key constraints
const IMPORT_ORDER = [
  'games',            // Base table, no dependencies
  'proton_compatibility',  // Depends on games
  'steamdeck_compatibility',
  'anti_cheat_status',
  'gpus',
  'cpus'
];

// Parse command line args
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const specificTable = args.find(a => a.startsWith('--table='))?.split('=')[1];
const batchSize = parseInt(
  args.find(a => a.startsWith('--batch-size='))?.split('=')[1] || BATCH_SIZE,
  10
);

async function main() {
  // Validate environment
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Error: Missing environment variables');
    console.log('Required:');
    console.log('  SUPABASE_URL=https://<project>.supabase.co');
    console.log('  SUPABASE_SERVICE_KEY=eyJ...');
    console.log('\nCreate .env.local with these values (do NOT commit!)');
    process.exit(1);
  }

  // Check that we're using service key (not anon key)
  if (supabaseKey.length < 200) {
    console.warn('Warning: Key appears short. Make sure you\'re using SUPABASE_SERVICE_KEY, not ANON_KEY');
  }

  // Initialize Supabase client
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
  });

  console.log('Importing data to Supabase...');
  console.log(`  URL: ${supabaseUrl}`);
  console.log(`  Batch size: ${batchSize}`);
  if (dryRun) console.log('  Mode: DRY RUN (no changes will be made)');
  console.log('');

  const summary = [];
  const tables = specificTable ? [specificTable] : IMPORT_ORDER;

  for (const tableName of tables) {
    const inputPath = path.join(INPUT_DIR, `${tableName}.json`);

    // Check if file exists
    if (!fs.existsSync(inputPath)) {
      console.log(`  Skipping ${tableName} (no export file found)`);
      summary.push({ table: tableName, rows: 0, status: 'skipped' });
      continue;
    }

    try {
      // Read JSON data
      const rawData = fs.readFileSync(inputPath, 'utf-8');
      const rows = JSON.parse(rawData);

      if (rows.length === 0) {
        console.log(`  Skipping ${tableName} (empty)`);
        summary.push({ table: tableName, rows: 0, status: 'empty' });
        continue;
      }

      console.log(`  Importing ${tableName}: ${rows.length} rows...`);

      if (dryRun) {
        summary.push({ table: tableName, rows: rows.length, status: 'dry-run' });
        continue;
      }

      // Import in batches
      let imported = 0;
      let errors = 0;

      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);

        // Prepare rows for Supabase (remove SQLite id, let Supabase generate)
        const preparedBatch = batch.map(row => {
          const { id, ...rest } = row;
          return rest;
        });

        // Upsert to handle duplicates
        const { data, error } = await supabase
          .from(tableName)
          .upsert(preparedBatch, {
            onConflict: getConflictColumn(tableName),
            ignoreDuplicates: false
          });

        if (error) {
          console.error(`    Batch error at row ${i}: ${error.message}`);
          errors += batch.length;
        } else {
          imported += batch.length;
        }

        // Progress indicator
        if ((i + batchSize) % 10000 === 0 || i + batchSize >= rows.length) {
          const progress = Math.min(i + batchSize, rows.length);
          console.log(`    Progress: ${progress}/${rows.length}`);
        }

        // Small delay to avoid rate limiting
        await sleep(50);
      }

      console.log(`    Done: ${imported} imported, ${errors} errors`);
      summary.push({
        table: tableName,
        rows: rows.length,
        imported,
        errors,
        status: errors > 0 ? 'partial' : 'success'
      });

    } catch (err) {
      console.error(`  Error importing ${tableName}:`, err.message);
      summary.push({ table: tableName, rows: 0, status: 'error' });
    }
  }

  // Update metadata
  if (!dryRun) {
    await supabase.from('metadata').upsert([
      { key: 'last_import', value: new Date().toISOString() }
    ], { onConflict: 'key' });
  }

  // Print summary
  console.log('\n--- Import Summary ---');
  console.table(summary);

  if (dryRun) {
    console.log('\nThis was a dry run. No data was imported.');
    console.log('Run without --dry-run to actually import.');
  } else {
    console.log('\nImport complete!');
    console.log('Verify data in Supabase Dashboard: Table Editor');
  }
}

/**
 * Get the conflict column for upsert operations
 */
function getConflictColumn(tableName) {
  const conflictColumns = {
    games: 'steam_id',
    proton_compatibility: 'game_id',
    steamdeck_compatibility: 'steam_id',
    anti_cheat_status: 'steam_id',
    gpus: 'model',
    cpus: 'model'
  };
  return conflictColumns[tableName] || 'id';
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(err => {
  console.error('Import failed:', err);
  process.exit(1);
});
