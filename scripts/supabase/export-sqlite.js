#!/usr/bin/env node
/**
 * Export SQLite data to JSON for Supabase import
 *
 * Usage:
 *   npm run export:sqlite-to-json
 *   node scripts/supabase/export-sqlite.js
 *
 * Output:
 *   tmp/supabase-export/games.json
 *   tmp/supabase-export/proton_compatibility.json
 *   tmp/supabase-export/steamdeck_compatibility.json
 *   tmp/supabase-export/anti_cheat_status.json
 *   tmp/supabase-export/gpus.json
 *   tmp/supabase-export/cpus.json
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', '..', 'src-tauri', 'intelligence.db');
const OUTPUT_DIR = path.join(__dirname, '..', '..', 'tmp', 'supabase-export');

// Tables to export
const TABLES = [
  {
    name: 'games',
    query: 'SELECT * FROM games',
    transform: (row) => ({
      ...row,
      requirements_parsed: Boolean(row.requirements_parsed),
      // Convert SQLite datetime strings to ISO format
      created_at: row.created_at || new Date().toISOString(),
      updated_at: row.updated_at || new Date().toISOString(),
    })
  },
  {
    name: 'proton_compatibility',
    query: 'SELECT * FROM proton_compatibility',
    transform: (row) => ({
      ...row,
      last_synced: row.last_synced || new Date().toISOString(),
    })
  },
  {
    name: 'steamdeck_compatibility',
    query: 'SELECT * FROM steamdeck_compatibility',
    transform: (row) => ({
      ...row,
      deck_tested: Boolean(row.deck_tested),
      last_synced: row.last_synced || new Date().toISOString(),
    })
  },
  {
    name: 'anti_cheat_status',
    query: 'SELECT * FROM anti_cheat_status',
    transform: (row) => ({
      ...row,
      last_updated: row.last_updated || new Date().toISOString(),
      created_at: row.created_at || new Date().toISOString(),
    })
  },
  {
    name: 'gpus',
    query: 'SELECT * FROM gpus',
    transform: (row) => ({
      ...row,
      verified: Boolean(row.verified),
      ray_tracing: Boolean(row.ray_tracing),
      mesh_shaders: Boolean(row.mesh_shaders),
      created_at: row.created_at || new Date().toISOString(),
      updated_at: row.updated_at || new Date().toISOString(),
    })
  },
  {
    name: 'cpus',
    query: 'SELECT * FROM cpus',
    transform: (row) => ({
      ...row,
      verified: Boolean(row.verified),
      created_at: row.created_at || new Date().toISOString(),
      updated_at: row.updated_at || new Date().toISOString(),
    })
  }
];

async function main() {
  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Open database
  let db;
  try {
    db = new Database(DB_PATH, { readonly: true });
  } catch (err) {
    console.error('Failed to open database:', err.message);
    console.log('Make sure the database exists at:', DB_PATH);
    process.exit(1);
  }

  console.log('Exporting SQLite data for Supabase import...\n');

  const summary = [];

  for (const table of TABLES) {
    try {
      // Check if table exists
      const tableExists = db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name=?
      `).get(table.name);

      if (!tableExists) {
        console.log(`  Skipping ${table.name} (table not found)`);
        summary.push({ table: table.name, rows: 0, status: 'skipped' });
        continue;
      }

      // Query data
      const rows = db.prepare(table.query).all();

      // Transform rows
      const transformed = rows.map(table.transform);

      // Write to JSON file
      const outputPath = path.join(OUTPUT_DIR, `${table.name}.json`);
      fs.writeFileSync(outputPath, JSON.stringify(transformed, null, 2));

      console.log(`  Exported ${table.name}: ${rows.length} rows`);
      summary.push({ table: table.name, rows: rows.length, status: 'exported' });

    } catch (err) {
      console.error(`  Error exporting ${table.name}:`, err.message);
      summary.push({ table: table.name, rows: 0, status: 'error' });
    }
  }

  db.close();

  // Print summary
  console.log('\n--- Export Summary ---');
  console.table(summary);
  console.log(`\nOutput directory: ${OUTPUT_DIR}`);
  console.log('\nNext steps:');
  console.log('  1. Create Supabase project and run schema.sql');
  console.log('  2. Set SUPABASE_URL and SUPABASE_SERVICE_KEY in .env.local');
  console.log('  3. Run: npm run import:supabase');
}

main().catch(console.error);
