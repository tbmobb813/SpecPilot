#!/usr/bin/env node
const axios = require('axios');
const cheerio = require('cheerio');
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', '..', 'src-tauri', 'intelligence.db');
const db = new Database(dbPath);

function usage() {
  console.log('Usage: node scripts/scrapers/techpowerup.js <url>');
  process.exit(1);
}

async function scrape(url) {
  console.log('Fetching', url);
  const res = await axios.get(url, { timeout: 15000 });
  const $ = cheerio.load(res.data);

  // Heuristics to extract data
  let model = $('h1').first().text().trim() || $('title').text().trim();
  if (!model) model = url;

  const pageText = $('body').text();

  // Find VRAM (MB)
  const vramMatch = pageText.match(/(\d{3,5})\s*(MB|MiB)/i);
  const vram = vramMatch ? parseInt(vramMatch[1], 10) : null;

  // Find TDP (W)
  const tdpMatch = pageText.match(/(\d{2,4})\s*(W|watts)/i);
  const tdp = tdpMatch ? parseInt(tdpMatch[1], 10) : null;

  // Vendor detection
  let vendor = 'Unknown';
  const mlower = model.toLowerCase();
  if (mlower.includes('nvidia') || mlower.includes('geforce')) vendor = 'NVIDIA';
  else if (mlower.includes('amd') || mlower.includes('radeon')) vendor = 'AMD';
  else if (mlower.includes('intel') || mlower.includes('arc')) vendor = 'Intel';

  // Upsert into DB
  const now = new Date().toISOString();
  const existing = db.prepare('SELECT id FROM gpus WHERE model = ?').get(model);
  if (existing) {
    db.prepare(
      `UPDATE gpus SET vendor = ?, vram_mb = COALESCE(?, vram_mb), tdp_w = COALESCE(?, tdp_w), data_source = ?, updated_at = ? WHERE id = ?`
    ).run(vendor, vram, tdp, 'techpowerup', now, existing.id);
    console.log('Updated', model);
  } else {
    db.prepare(
      `INSERT INTO gpus(model, vendor, vram_mb, tdp_w, data_source, created_at) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(model, vendor, vram, tdp, 'techpowerup', now);
    console.log('Inserted', model);
  }
}

(async () => {
  const url = process.argv[2];
  if (!url) usage();
  try {
    await scrape(url);
    console.log('Done');
  } catch (err) {
    console.error('Error scraping:', err.message);
    process.exit(2);
  } finally {
    db.close();
  }
})();
