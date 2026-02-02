#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

if (process.argv.length < 3) {
  console.error('Usage: node import_protondb_json.js <path-to-json>');
  process.exit(2);
}

const jsonPath = path.resolve(process.argv[2]);
if (!fs.existsSync(jsonPath)) {
  console.error('File not found:', jsonPath);
  process.exit(2);
}

console.log('Reading', jsonPath);
const raw = fs.readFileSync(jsonPath, 'utf8');
let data;
try {
  data = JSON.parse(raw);
} catch (e) {
  console.error('Failed to parse JSON:', e.message);
  process.exit(2);
}

const dbPath = path.join(__dirname, '..', '..', 'src-tauri', 'intelligence.db');
const db = new Database(dbPath);

const now = new Date().toISOString();
const selectGameBySteamId = db.prepare('SELECT id FROM games WHERE steam_id = ?');
const insertGameBySteamId = db.prepare('INSERT INTO games(steam_id, name, data_source, created_at) VALUES (?, ?, ?, ?)');
const selectStmt = db.prepare('SELECT id FROM proton_compatibility WHERE game_id = ?');
const insertStmt = db.prepare('INSERT INTO proton_compatibility(game_id, protondb_rating, total_reports, last_synced) VALUES (?, ?, ?, ?)');
const updateStmt = db.prepare('UPDATE proton_compatibility SET protondb_rating = ?, total_reports = ?, last_synced = ? WHERE game_id = ?');

let count = 0;
console.log('Importing entries...');
for (const [appId, report] of Object.entries(data)) {
  const rating = report.tier || report.rating || 'unknown';
  const total = report.total || report.total_reports || 0;

  let gameRow = selectGameBySteamId.get(appId);
  if (!gameRow) {
    const gameName = report.title || report.name || `App ${appId}`;
    insertGameBySteamId.run(appId, gameName, 'protondb-import', now);
    gameRow = selectGameBySteamId.get(appId);
  }
  const gameForeignId = gameRow.id;

  const existing = selectStmt.get(gameForeignId);
  if (existing) {
    updateStmt.run(rating, total, now, gameForeignId);
  } else {
    insertStmt.run(gameForeignId, rating, total, now);
  }
  count++;
}

db.close();
console.log('Imported', count, 'entries into proton_compatibility');
