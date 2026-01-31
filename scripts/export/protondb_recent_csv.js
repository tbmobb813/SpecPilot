#!/usr/bin/env node
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { since: 60, out: 'exports/protondb_recent.csv' };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if ((a === '--since' || a === '-s') && args[i+1]) { out.since = parseInt(args[i+1], 10) || out.since; i++; }
    else if ((a === '--out' || a === '-o') && args[i+1]) { out.out = args[i+1]; i++; }
  }
  return out;
}

function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function main() {
  const opts = parseArgs();
  const dbPath = path.join(__dirname, '..', '..', 'src-tauri', 'intelligence.db');
  if (!fs.existsSync(dbPath)) {
    console.error('Database not found at', dbPath);
    process.exit(2);
  }
  const db = new Database(dbPath, { readonly: true });

  const sql = `SELECT p.game_id, g.steam_id, g.name, p.protondb_rating, p.total_reports, p.last_synced
    FROM proton_compatibility p JOIN games g ON p.game_id = g.id
    WHERE p.last_synced >= datetime('now', '-' || ? || ' minutes')
    ORDER BY p.last_synced DESC`; 

  const rows = db.prepare(sql).all(String(opts.since));

  const outDir = path.dirname(opts.out);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const w = fs.createWriteStream(opts.out, { encoding: 'utf8' });
  w.write('game_id,steam_id,name,protondb_rating,total_reports,last_synced\n');
  for (const r of rows) {
    const line = [r.game_id, r.steam_id || '', csvEscape(r.name || ''), r.protondb_rating || '', r.total_reports || 0, r.last_synced || ''].map(csvEscape).join(',') + '\n';
    w.write(line);
  }
  w.end();
  db.close();
  console.log('Exported', rows.length, 'rows to', opts.out);
}

main();
