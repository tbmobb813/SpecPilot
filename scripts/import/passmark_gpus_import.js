#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.join(__dirname, '..', '..', 'src-tauri', 'intelligence.db');

function parseCSVLine(line) {
  const parts = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuote = !inQuote; continue; }
    if (ch === ',' && !inQuote) { parts.push(cur); cur = ''; continue; }
    cur += ch;
  }
  parts.push(cur);
  return parts.map(p => p.trim());
}

function normalizeHeader(h) { return h ? h.toLowerCase().trim() : ''; }

function findColumnIndex(headers, patterns) {
  for (let i = 0; i < headers.length; i++) {
    const h = normalizeHeader(headers[i]);
    for (const p of patterns) {
      if (h.includes(p)) return i;
    }
  }
  return -1;
}

function parseNumber(s) {
  if (s == null) return null;
  const cleaned = ('' + s).replace(/[^0-9\.]/g, '');
  if (!cleaned) return null;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

function usage() { console.log('Usage: node scripts/import/passmark_gpus_import.js <csv-file>'); process.exit(1); }

function main() {
  const file = process.argv[2] || path.join(__dirname, 'sample_passmark_gpus.csv');
  if (!fs.existsSync(file)) { console.error('CSV file not found:', file); usage(); }

  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) { console.error('CSV has no data'); process.exit(2); }

  const headers = parseCSVLine(lines[0]);
  const modelIdx = findColumnIndex(headers, ['model', 'gpu', 'name']);
  const scoreIdx = findColumnIndex(headers, ['g3d', 'gpu mark', 'gpu_mark', 'score', 'passmark']);

  if (modelIdx === -1) { console.error('Could not find model/name column in CSV headers:', headers); process.exit(2); }
  if (scoreIdx === -1) console.warn('No score column detected; rows without score will be skipped.');

  const db = new Database(dbPath);
  const insert = db.prepare("INSERT INTO gpus(model, vendor, vram_mb, tdp_w, release_year, tier, score, data_source, verified, created_at) VALUES (?, NULL, NULL, NULL, NULL, NULL, ?, ?, 0, datetime('now'))");
  const update = db.prepare('UPDATE gpus SET score = ? WHERE id = ?');
  const find = db.prepare('SELECT id, score FROM gpus WHERE lower(model) = lower(?) LIMIT 1');
  const findLike = db.prepare('SELECT id, score FROM gpus WHERE lower(model) LIKE lower(?) LIMIT 1');

  let imported = 0;
  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i]);
    const model = row[modelIdx] || row[modelIdx] === '' ? row[modelIdx].replace(/^"|"$/g, '').trim() : null;
    const rawScore = scoreIdx !== -1 ? row[scoreIdx] : null;
    const score = parseNumber(rawScore);
    if (!model) continue;
    if (!score) continue;

    let found = find.get(model);
    if (!found) found = findLike.get('%' + model + '%');

    if (found) {
      if (!found.score) { update.run(score, found.id); imported++; }
    } else {
      insert.run(model, score, 'passmark_import');
      imported++;
    }
  }

  db.close();
  console.log('Imported/updated', imported, 'GPU score rows from', file);
}

main();
