#!/usr/bin/env node
/**
 * Import ProtonDB reports from local JSON file (reports_piiremoved.json)
 *
 * This script:
 * 1. Reads the full ProtonDB reports JSON (individual user reports)
 * 2. Aggregates reports per game to calculate ratings
 * 3. Updates games and proton_compatibility tables
 *
 * Usage: node scripts/sync/import_protondb_reports.js [path-to-json]
 * Default path: tmp/protondb-data/reports_piiremoved.json
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// Default path for ProtonDB reports
const DEFAULT_PATH = path.join(__dirname, '..', '..', 'tmp', 'protondb-data', 'reports_piiremoved.json');

const fp = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_PATH;
if (!fs.existsSync(fp)) {
  console.error('File not found:', fp);
  console.error('Usage: node import_protondb_reports.js [path-to-json]');
  console.error('Default path:', DEFAULT_PATH);
  process.exit(2);
}

console.log('=== ProtonDB Reports Import ===');
console.log('File:', fp);

console.log('\nReading JSON file (this may take a moment)...');
const startRead = Date.now();
const raw = fs.readFileSync(fp, 'utf8');
let arr;
try {
  arr = JSON.parse(raw);
} catch (e) {
  console.error('Invalid JSON:', e.message);
  process.exit(2);
}
console.log(`Read ${arr.length.toLocaleString()} reports in ${((Date.now() - startRead) / 1000).toFixed(1)}s`);

// Aggregate reports per game
console.log('\nAggregating reports per game...');
const counts = {}; // appId -> {total, yes, no, other, title}

for (const item of arr) {
  const appId = (item && item.app && item.app.steam && item.app.steam.appId) || (item && item.app && item.app.appId) || null;
  if (!appId) continue;

  const title = (item && item.app && item.app.title) || null;
  const verdict = ((item.responses && item.responses.verdict) || (item.responses && item.responses.notes && item.responses.notes.verdict) || '').toString().toLowerCase();

  if (!counts[appId]) {
    counts[appId] = { total: 0, yes: 0, no: 0, other: 0, title: title };
  }

  // Keep the best title (non-null, non-generic)
  if (title && !counts[appId].title) {
    counts[appId].title = title;
  }

  counts[appId].total += 1;
  if (verdict === 'yes' || verdict.includes('works') || verdict.includes('out the box') || verdict.includes('runs')) {
    counts[appId].yes += 1;
  } else if (verdict === 'no' || verdict.includes('bork') || verdict.includes('unsupported')) {
    counts[appId].no += 1;
  } else {
    counts[appId].other += 1;
  }
}

console.log(`Found ${Object.keys(counts).length.toLocaleString()} unique games`);

const dbPath = path.join(__dirname, '..', '..', 'src-tauri', 'intelligence.db');
console.log('Database:', dbPath);
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

const selectGameBySteamId = db.prepare('SELECT id, name FROM games WHERE steam_id = ?');
const insertGameBySteamId = db.prepare('INSERT INTO games(steam_id, name, data_source, created_at) VALUES (?, ?, ?, ?)');
const updateGameName = db.prepare("UPDATE games SET name = ? WHERE steam_id = ? AND (name IS NULL OR name LIKE 'App %')");
const selectStmt = db.prepare('SELECT id FROM proton_compatibility WHERE game_id = ?');
const insertStmt = db.prepare('INSERT INTO proton_compatibility(game_id, protondb_rating, total_reports, last_synced) VALUES (?, ?, ?, ?)');
const updateStmt = db.prepare('UPDATE proton_compatibility SET protondb_rating = ?, total_reports = ?, last_synced = ? WHERE game_id = ?');

let gamesCreated = 0;
let gamesUpdated = 0;
let protonCreated = 0;
let protonUpdated = 0;

const now = new Date().toISOString();
const entries = Object.entries(counts);
const total = entries.length;

console.log('\nImporting to database...');
const startImport = Date.now();

// Use transaction for faster imports
const importAll = db.transaction(() => {
  let processed = 0;

  for (const [appId, stats] of entries) {
    const yes = stats.yes, no = stats.no, totalReports = stats.total;
    const ratio = totalReports > 0 ? (yes / totalReports) : 0;

    // Calculate rating based on positive ratio and report count
    let rating = 'unknown';
    if (totalReports === 0) {
      rating = 'unknown';
    } else if (ratio >= 0.9 && totalReports >= 5) {
      rating = 'platinum';
    } else if (ratio >= 0.75 && totalReports >= 4) {
      rating = 'gold';
    } else if (ratio >= 0.5) {
      rating = 'silver';
    } else if (ratio >= 0.25) {
      rating = 'bronze';
    } else {
      rating = 'borked';
    }

    // Ensure games row exists
    let gameRow = selectGameBySteamId.get(appId);
    const gameName = stats.title || `App ${appId}`;

    if (!gameRow) {
      insertGameBySteamId.run(appId, gameName, 'protondb-reports', now);
      gameRow = selectGameBySteamId.get(appId);
      gamesCreated++;
    } else if (stats.title && gameRow.name && gameRow.name.startsWith('App ')) {
      // Update name if we have a real title
      updateGameName.run(stats.title, appId);
      gamesUpdated++;
    }

    const gameForeignId = gameRow.id;

    const existing = selectStmt.get(gameForeignId);
    if (existing) {
      updateStmt.run(rating, totalReports, now, gameForeignId);
      protonUpdated++;
    } else {
      insertStmt.run(gameForeignId, rating, totalReports, now);
      protonCreated++;
    }

    processed++;
    if (processed % 5000 === 0) {
      console.log(`  Processed ${processed.toLocaleString()} / ${total.toLocaleString()} games...`);
    }
  }
});

importAll();

const importTime = ((Date.now() - startImport) / 1000).toFixed(1);

console.log(`\n=== Import Complete ===`);
console.log(`Time: ${importTime}s`);
console.log(`Games created: ${gamesCreated.toLocaleString()}`);
console.log(`Games updated: ${gamesUpdated.toLocaleString()}`);
console.log(`ProtonDB entries created: ${protonCreated.toLocaleString()}`);
console.log(`ProtonDB entries updated: ${protonUpdated.toLocaleString()}`);

// Show rating distribution
console.log('\n=== Rating Distribution ===');
const ratingCounts = db.prepare(`
  SELECT protondb_rating, COUNT(*) as count, SUM(total_reports) as total_reports
  FROM proton_compatibility
  GROUP BY protondb_rating
  ORDER BY count DESC
`).all();

for (const row of ratingCounts) {
  const pct = ((row.count / total) * 100).toFixed(1);
  console.log(`  ${row.protondb_rating.padEnd(10)}: ${row.count.toLocaleString().padStart(6)} games (${pct}%) - ${row.total_reports.toLocaleString()} reports`);
}

// Show top games by report count
console.log('\n=== Top 10 Games by Report Count ===');
const topGames = db.prepare(`
  SELECT g.name, g.steam_id, pc.protondb_rating, pc.total_reports
  FROM proton_compatibility pc
  JOIN games g ON pc.game_id = g.id
  ORDER BY pc.total_reports DESC
  LIMIT 10
`).all();

for (const game of topGames) {
  console.log(`  ${game.name.substring(0, 40).padEnd(42)} ${game.protondb_rating.padEnd(10)} ${game.total_reports.toLocaleString().padStart(6)} reports`);
}

db.close();
console.log('\nDone!');
