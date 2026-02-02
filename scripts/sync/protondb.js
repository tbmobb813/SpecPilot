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
      // Official/proxied JSON endpoints (try multiple hosts/paths)
      'https://www.protondb.com/api/v1/reports/summaries/latest.json',
      'https://protondb.com/api/v1/reports/summaries/latest.json',
      'https://data.protondb.com/reports/summaries/latest.json',

      // Raw GitHub mirrors (try main branch and CDN)
      'https://raw.githubusercontent.com/ProtonDB/protondb-data/main/reports/summaries/latest.json',
      // bdefore fork mirror (useful if ProtonDB upstream paths change)
      'https://raw.githubusercontent.com/bdefore/protondb-data/main/reports/summaries/latest.json',
      'https://cdn.jsdelivr.net/gh/bdefore/protondb-data@main/reports/summaries/latest.json',
      'https://raw.githubusercontent.com/ProtonDB/protondb-data/master/reports/summaries/latest.json',
      'https://cdn.jsdelivr.net/gh/ProtonDB/protondb-data@main/reports/summaries/latest.json',

      // Older/alternate paths for compatibility
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

      // Ensure games rows exist for steam app ids and use the games.id as the foreign key
      const selectGameBySteamId = db.prepare('SELECT id FROM games WHERE steam_id = ?');
      const insertGameBySteamId = db.prepare('INSERT INTO games(steam_id, name, data_source, created_at) VALUES (?, ?, ?, ?)');

      for (const [appId, report] of Object.entries(data)) {
        const rating = report.tier || report.rating || 'unknown';
        const total = report.total || report.total_reports || 0;

        // ensure games row exists and get its PK id
        let gameRow = selectGameBySteamId.get(appId);
        if (!gameRow) {
          const gameName = report.title || report.name || `App ${appId}`;
          insertGameBySteamId.run(appId, gameName, 'protondb-summaries', now);
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

          // ensure games row exists for this steam id
          const selectGameBySteamId = db.prepare('SELECT id FROM games WHERE steam_id = ?');
          const insertGameBySteamId = db.prepare('INSERT INTO games(steam_id, name, data_source, created_at) VALUES (?, ?, ?, ?)');
          let gameRow = selectGameBySteamId.get(appId);
          if (!gameRow) {
            insertGameBySteamId.run(appId, `App ${appId}`, 'protondb-scraper', now);
            gameRow = selectGameBySteamId.get(appId);
          }
          const gameForeignId = gameRow.id;

          const existing = selectStmt.get(gameForeignId);
          if (existing) updateStmt.run(rating, 0, now, gameForeignId);
          else insertStmt.run(gameForeignId, rating, 0, now);
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
