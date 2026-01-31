#!/usr/bin/env node
const axios = require('axios');
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', '..', 'src-tauri', 'intelligence.db');
const db = new Database(dbPath);

async function main() {
  try {
    console.log('Fetching ProtonDB summaries...');

    const candidates = [
      'https://www.protondb.com/api/v1/reports/summaries/latest.json',
      'https://www.protondb.com/api/v1/reports/summaries.json',
      'https://www.protondb.com/api/v1/reviews/summaries/latest.json',
      'https://raw.githubusercontent.com/ProtonDB/protondb-data/master/reports/summaries/latest.json',
      'https://raw.githubusercontent.com/ProtonDB/proton-db/master/reports/summaries/latest.json',
      'https://raw.githubusercontent.com/ProtonDB/reports/master/summaries/latest.json',
      'https://head.protondb.pages.dev/reports/summaries/latest.json'
    ];

    let resp = null;
    let usedUrl = null;
    for (const u of candidates) {
      try {
        resp = await axios.get(u, { timeout: 20000 });
        if (resp && resp.status === 200 && resp.data && typeof resp.data === 'object') {
          usedUrl = u;
          break;
        } else {
          console.warn('Endpoint', u, 'returned', resp && resp.status);
        }
      } catch (e) {
        console.warn('Endpoint', u, 'failed:', e.message);
        // try next
      }
    }

    if (resp && resp.data) {
      const data = resp.data;
      console.log('Fetched ProtonDB data from', usedUrl || 'unknown');

      const now = new Date().toISOString();
      let count = 0;

      const selectStmt = db.prepare('SELECT id FROM proton_compatibility WHERE game_id = ?');
      const insertStmt = db.prepare('INSERT INTO proton_compatibility(game_id, protondb_rating, total_reports, last_synced) VALUES (?, ?, ?, ?)');
      const updateStmt = db.prepare('UPDATE proton_compatibility SET protondb_rating = ?, total_reports = ?, last_synced = ? WHERE game_id = ?');

      for (const [appId, report] of Object.entries(data)) {
        const rating = report.tier || report.rating || 'unknown';
        const total = report.total || report.total_reports || 0;
        const existing = selectStmt.get(appId);
        if (existing) {
          updateStmt.run(rating, total, now, appId);
        } else {
          insertStmt.run(appId, rating, total, now);
        }
        count++;
      }

      console.log(`Synced ${count} ProtonDB entries`);
    } else {
      // Fallback: scrape explore and per-app pages to collect ratings
      console.log('Falling back to HTML scraping of ProtonDB explore/app pages');
      const exploreUrl = 'https://www.protondb.com/explore';
      const exploreResp = await axios.get(exploreUrl, { timeout: 20000 });
      let html = exploreResp.data;

      // extract /app/<id> occurrences
      const ids = new Set();
      const re = /\/app\/(\d+)/g;
      let m;
      while ((m = re.exec(html)) !== null) {
        ids.add(m[1]);
      }

      if (ids.size === 0) {
        // try homepage as it sometimes contains static links
        try {
          const homeResp = await axios.get('https://www.protondb.com/', { timeout: 20000 });
          html = homeResp.data;
          while ((m = re.exec(html)) !== null) {
            ids.add(m[1]);
          }
        } catch (e) {
          // ignore
        }
      }

      const idList = Array.from(ids).slice(0, 500); // limit
      const selectStmt = db.prepare('SELECT id FROM proton_compatibility WHERE game_id = ?');
      const insertStmt = db.prepare('INSERT INTO proton_compatibility(game_id, protondb_rating, total_reports, last_synced) VALUES (?, ?, ?, ?)');
      const updateStmt = db.prepare('UPDATE proton_compatibility SET protondb_rating = ?, total_reports = ?, last_synced = ? WHERE game_id = ?');

      let synced = 0;
      for (const appId of idList) {
        try {
          const appUrl = `https://www.protondb.com/app/${appId}`;
          const aresp = await axios.get(appUrl, { timeout: 15000 });
          const page = aresp.data.toLowerCase();

          let rating = 'unknown';
          if (page.includes('verified')) rating = 'verified';
          else if (page.includes('native')) rating = 'native';
          else if (page.includes('playable')) rating = 'playable';
          else if (page.includes('unsupported')) rating = 'unsupported';
          else if (page.includes('chromebook')) rating = 'chromebook';

          const now = new Date().toISOString();
          const existing = selectStmt.get(appId);
          if (existing) updateStmt.run(rating, 0, now, appId);
          else insertStmt.run(appId, rating, 0, now);
          synced++;
        } catch (e) {
          // skip
        }
      }
      console.log(`Scraped and synced ${synced} ProtonDB app ratings via HTML fallback`);
    }
  } catch (err) {
    console.error('Failed to sync ProtonDB:', err.message);
    process.exit(2);
  } finally {
    db.close();
  }
}

main();
