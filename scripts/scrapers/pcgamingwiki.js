#!/usr/bin/env node
const axios = require('axios');
const cheerio = require('cheerio');
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', '..', 'src-tauri', 'intelligence.db');
const db = new Database(dbPath);

function usage() {
  console.log('Usage: node scripts/scrapers/pcgamingwiki.js <url>');
  process.exit(1);
}

async function scrape(url) {
  console.log('Fetching', url);
  const res = await axios.get(url, { timeout: 15000 });
  const $ = cheerio.load(res.data);

  // Try to extract the page title as game name
  let name = $('h1').first().text().trim() || $('title').text().trim();
  if (!name) name = url;

  // Example: extract minimum requirements block if available
  let reqMin = {};
  let reqRec = {};

  // PCGamingWiki often has a table with system requirements; try to find by header
  $('h2, h3').each((i, el) => {
    const heading = $(el).text().toLowerCase();
    if (heading.includes('minimum requirements') || heading.includes('minimum')) {
      // grab the next table or dl
      const block = $(el).next('table, dl');
      if (block.length) {
        reqMin.raw = $(block).text().trim();
      }
    }
    if (heading.includes('recommended requirements') || heading.includes('recommended')) {
      const block = $(el).next('table, dl');
      if (block.length) {
        reqRec.raw = $(block).text().trim();
      }
    }
  });

  // Fallback: try to find any 'System requirements' section
  if (!reqMin.raw) {
    const sys = $(':contains("System requirements")').filter(function() {
      return $(this).children().length > 0;
    }).first();
    if (sys.length) reqMin.raw = sys.text().trim();
  }

  // Upsert into games table
  const now = new Date().toISOString();
  const existing = db.prepare('SELECT id FROM games WHERE name = ?').get(name);
  if (existing) {
    db.prepare(`UPDATE games SET requirements_min = COALESCE(?, requirements_min), requirements_rec = COALESCE(?, requirements_rec), data_source = ?, created_at = ? WHERE id = ?`).run(JSON.stringify(reqMin), JSON.stringify(reqRec), 'pcgamingwiki', now, existing.id);
    console.log('Updated game', name);
  } else {
    db.prepare(`INSERT INTO games(name, requirements_min, requirements_rec, data_source, created_at) VALUES (?, ?, ?, ?, ?)`)
      .run(name, JSON.stringify(reqMin), JSON.stringify(reqRec), 'pcgamingwiki', now);
    console.log('Inserted game', name);
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
