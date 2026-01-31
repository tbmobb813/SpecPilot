#!/usr/bin/env node
const axios = require('axios');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// Usage:
// node scripts/sync/protondb_apps.js --file=data/games-top-100.json
// node scripts/sync/protondb_apps.js 570 440 730

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { ids: [], file: null, rate: 300, retries: 2, backoff: 2, concurrency: 5, jitter: 100, domainRates: {} };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--file' && args[i+1]) {
      out.file = args[i+1];
      i++;
    } else if (a === '--rate' && args[i+1]) {
      out.rate = parseInt(args[i+1], 10) || out.rate;
      i++;
    } else if (a === '--retries' && args[i+1]) {
      out.retries = parseInt(args[i+1], 10) || out.retries;
      i++;
    } else if (a === '--backoff' && args[i+1]) {
      out.backoff = parseFloat(args[i+1]) || out.backoff;
      i++;
    } else if (a === '--concurrency' && args[i+1]) {
      out.concurrency = parseInt(args[i+1], 10) || out.concurrency;
      i++;
    } else if (a === '--jitter' && args[i+1]) {
      out.jitter = parseInt(args[i+1], 10) || out.jitter;
      i++;
    } else if (a === '--domain-rate' && args[i+1]) {
      // shorthand for protondb.com
      const v = parseInt(args[i+1], 10);
      if (!isNaN(v)) out.domainRates['protondb.com'] = v;
      i++;
    } else if (a === '--domain-limits' && args[i+1]) {
      // comma-separated host=ms pairs
      const pairs = args[i+1].split(',');
      for (const p of pairs) {
        const [h, m] = p.split('=');
        if (h && m) {
          const ms = parseInt(m, 10);
          if (!isNaN(ms)) out.domainRates[h.replace(/^https?:\/\//, '').replace(/^www\./, '')] = ms;
        }
      }
      i++;
    } else if (/^\d+$/.test(a)) {
      out.ids.push(a);
    } else if (a.includes(',')) {
      a.split(',').forEach(s => s.trim()).filter(Boolean).forEach(s => { if (/^\d+$/.test(s)) out.ids.push(s); });
    }
  }
  return out;
}

async function fetchRatingForApp(appId, opts = {}) {
  const url = `https://www.protondb.com/app/${appId}`;
  try {
    const resp = await fetchUrlWithRetries(url, opts.retries, opts.backoff, opts.timeout || 15000);
    const page = resp.data.toLowerCase();
    // Try to detect common rating keywords
    let rating = 'unknown';
    if (page.includes('deck verified')) rating = 'verified';
    else if (page.includes('native')) rating = 'native';
    else if (page.includes('playable')) rating = 'playable';
    else if (page.includes('unsupported')) rating = 'unsupported';
    else if (page.includes('chromebook ready')) rating = 'chromebook';
    else if (page.includes('verified')) rating = 'verified';

    // Try to extract the game name from the page title or h1
    let name = null;
    const titleMatch = resp.data.match(/<title>(.*?)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      name = titleMatch[1].replace(/\s*-\s*protondb\s*$/i, '').trim();
    } else {
      const h1 = resp.data.match(/<h1[^>]*>(.*?)<\/h1>/i);
      if (h1 && h1[1]) name = h1[1].trim();
    }

    if (!name) name = `App ${appId}`;

    return { rating, name };
  } catch (err) {
    return { error: err.message };
  }
}

// helper: sleep
function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }

async function fetchUrlWithRetries(url, retries = 2, backoff = 2, timeout = 15000) {
  let attempt = 0;
  let delay = 500;
  while (true) {
    try {
      return await axios.get(url, { timeout });
    } catch (err) {
      attempt++;
      if (attempt > retries) throw err;
      console.log(`fetch failed, retrying ${url} (attempt ${attempt}/${retries})`);
      await sleep(delay);
      delay = Math.floor(delay * backoff);
    }
  }
}

async function main() {
  const parsed = parseArgs();
  let ids = parsed.ids.slice();

  if (parsed.file) {
    const fp = path.resolve(parsed.file);
    if (!fs.existsSync(fp)) {
      console.error('File not found:', fp);
      process.exit(2);
    }
    const content = fs.readFileSync(fp, 'utf8');
    try {
      const json = JSON.parse(content);
      if (Array.isArray(json)) {
        // expect objects with steam_id or steamid or steam
        json.forEach(item => {
          if (item && (item.steam_id || item.steamid || item.id)) {
            const sid = String(item.steam_id || item.steamid || item.id);
            if (/^\d+$/.test(sid)) ids.push(sid);
          }
        });
      } else {
        console.error('JSON file not an array:', fp);
      }
    } catch (e) {
      console.error('Failed to parse JSON file:', e.message);
      process.exit(2);
    }
  }

  if (ids.length === 0) {
    console.error('No app IDs provided. Pass numeric app IDs or --file path.');
    process.exit(2);
  }

  // limit to avoid hammering
  const limit = 500;
  ids = ids.slice(0, limit);

  const dbPath = path.join(__dirname, '..', '..', 'src-tauri', 'intelligence.db');
  const db = new Database(dbPath);

  const selectStmt = db.prepare('SELECT id FROM proton_compatibility WHERE game_id = ?');
  const insertStmt = db.prepare('INSERT INTO proton_compatibility(game_id, protondb_rating, total_reports, last_synced) VALUES (?, ?, ?, ?)');
  const updateStmt = db.prepare('UPDATE proton_compatibility SET protondb_rating = ?, total_reports = ?, last_synced = ? WHERE game_id = ?');

  // Helpers to ensure a games row exists for the given Steam app id
  const selectGameBySteamId = db.prepare('SELECT id FROM games WHERE steam_id = ?');
  const insertGameBySteamId = db.prepare('INSERT INTO games(steam_id, name, data_source, created_at) VALUES (?, ?, ?, ?)');

  let synced = 0;
  const rate = parsed.rate || 300;
  const opts = { retries: parsed.retries, backoff: parsed.backoff, timeout: 15000 };
  const concurrency = parsed.concurrency || 5;
  const jitter = parsed.jitter || 100;

  // domain next-available timestamps (ms)
  const domainNext = new Map();
  const domainRates = parsed.domainRates || {};

  // Worker pool: multiple async workers pull next ID and process it
  let idx = 0;
  function nextId() {
    if (idx >= ids.length) return null;
    const v = ids[idx];
    idx += 1;
    return v;
  }

  async function worker(workerId) {
    while (true) {
      const appId = nextId();
      if (!appId) break;
      // target URL and domain key
      const url = `https://www.protondb.com/app/${appId}`;
      const hostname = new URL(url).hostname.replace(/^www\./, '');
      const domainDelay = domainRates[hostname] || domainRates[hostname.replace(/^www\./, '')] || rate;

      // wait until domain is available
      const nowMs = Date.now();
      const nextAllowed = domainNext.get(hostname) || 0;
      if (nowMs < nextAllowed) {
        await sleep(nextAllowed - nowMs);
      }

      process.stdout.write(`Scraping ${appId}... `);
      const res = await fetchRatingForApp(appId, opts);
      if (res && res.error) {
        console.log('error:', res.error);
        // schedule next allowed time with delay even on error to respect limits
        const jitterMsErr = Math.floor(Math.random() * jitter);
        domainNext.set(hostname, Date.now() + domainDelay + jitterMsErr);
        continue;
      }
      const { rating, name } = res;
      const now = new Date().toISOString();
      // Ensure we have a games.id to reference
      let gameRow = selectGameBySteamId.get(appId);
      if (!gameRow) {
        insertGameBySteamId.run(appId, name || `App ${appId}`, 'protondb-scraper', now);
        gameRow = selectGameBySteamId.get(appId);
      }
      const gameForeignId = gameRow.id;

      const existing = selectStmt.get(gameForeignId);
      if (existing) updateStmt.run(rating, 0, now, gameForeignId);
      else insertStmt.run(gameForeignId, rating, 0, now);
      synced++;
      console.log('ok ->', rating);

      // schedule next allowed time for this domain
      const jitterMs = Math.floor(Math.random() * jitter);
      domainNext.set(hostname, Date.now() + domainDelay + jitterMs);
    }
  }

  const workers = [];
  for (let i = 0; i < concurrency; i++) workers.push(worker(i));
  await Promise.all(workers);

  db.close();
  console.log(`Done. Synced ${synced} entries.`);
}

main();
