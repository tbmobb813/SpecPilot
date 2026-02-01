#!/usr/bin/env node
/**
 * Steam Requirements Scraper
 *
 * Fetches game requirements from Steam API and parses them into structured data.
 *
 * Usage:
 *   npm run scrape:requirements              # Scrape all games in DB
 *   npm run scrape:requirements -- --limit=50   # Limit to 50 games
 *   npm run scrape:requirements -- --appid=1091500  # Specific game
 *   npm run scrape:requirements -- --popular    # Fetch popular games list first
 */

const axios = require('axios');
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', '..', 'src-tauri', 'intelligence.db');

// Rate limiting
const RATE_LIMIT_DELAY_MS = 1500;
const BATCH_SIZE = 25;
const BATCH_DELAY_MS = 5000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch game details from Steam API with exponential backoff retry
 */
async function fetchSteamDetails(appId, retryCount = 0) {
  const MAX_RETRIES = 3;
  const BASE_BACKOFF_MS = 30000; // 30 seconds
  const MAX_BACKOFF_MS = 300000; // 5 minutes

  try {
    const url = `https://store.steampowered.com/api/appdetails?appids=${appId}&l=english`;
    const resp = await axios.get(url, {
      timeout: 15000,
      headers: {
        'User-Agent': 'SpecPilot/1.0 (Game Compatibility Checker)',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    if (!resp.data || !resp.data[appId] || !resp.data[appId].success) {
      return null;
    }

    return resp.data[appId].data;
  } catch (err) {
    if (err.response && err.response.status === 429) {
      if (retryCount >= MAX_RETRIES) {
        console.warn(`Rate limited on app ${appId}, max retries (${MAX_RETRIES}) exceeded`);
        return null;
      }

      const backoffMs = Math.min(BASE_BACKOFF_MS * Math.pow(2, retryCount), MAX_BACKOFF_MS);
      console.warn(`Rate limited on app ${appId}, retry ${retryCount + 1}/${MAX_RETRIES} after ${backoffMs / 1000}s...`);
      await sleep(backoffMs);
      return fetchSteamDetails(appId, retryCount + 1);
    }
    return null;
  }
}

/**
 * Parse RAM from requirements text
 * Examples: "8 GB RAM", "8GB RAM", "8192 MB RAM", "8 GB"
 */
function parseRam(text) {
  if (!text) return null;

  // Try GB first
  const gbMatch = text.match(/(\d+)\s*GB\s*(RAM|memory|of RAM)?/i);
  if (gbMatch) {
    return parseInt(gbMatch[1], 10) * 1024; // Return as MB
  }

  // Try MB
  const mbMatch = text.match(/(\d+)\s*MB\s*(RAM|memory)?/i);
  if (mbMatch) {
    return parseInt(mbMatch[1], 10);
  }

  return null;
}

/**
 * Parse storage from requirements text
 * Examples: "70 GB available space", "50 GB", "70GB HD space"
 */
function parseStorage(text) {
  if (!text) return null;

  const match = text.match(/(\d+)\s*GB\s*(available|space|HD|hard|storage|free)?/i);
  if (match) {
    return parseInt(match[1], 10);
  }

  return null;
}

/**
 * Parse GPU VRAM from GPU text
 * Examples: "GTX 1060 6GB", "RX 580 8GB", "RTX 3080 10GB"
 */
function parseGpuVram(gpuText) {
  if (!gpuText) return null;

  // Look for VRAM in the GPU string
  const match = gpuText.match(/(\d+)\s*GB/i);
  if (match) {
    return parseInt(match[1], 10) * 1024; // Return as MB
  }

  // Common GPU VRAM lookup (fallback)
  const gpuLower = gpuText.toLowerCase();
  const vramLookup = {
    'gtx 1050': 2048,
    'gtx 1050 ti': 4096,
    'gtx 1060 3gb': 3072,
    'gtx 1060': 6144,
    'gtx 1070': 8192,
    'gtx 1080': 8192,
    'gtx 1080 ti': 11264,
    'rtx 2060': 6144,
    'rtx 2070': 8192,
    'rtx 2080': 8192,
    'rtx 3060': 12288,
    'rtx 3070': 8192,
    'rtx 3080': 10240,
    'rtx 3090': 24576,
    'rtx 4060': 8192,
    'rtx 4070': 12288,
    'rtx 4080': 16384,
    'rtx 4090': 24576,
    'rx 570': 4096,
    'rx 580': 8192,
    'rx 5600': 6144,
    'rx 5700': 8192,
    'rx 6600': 8192,
    'rx 6700': 12288,
    'rx 6800': 16384,
    'rx 7800': 16384,
    'rx 7900': 20480,
  };

  for (const [gpu, vram] of Object.entries(vramLookup)) {
    if (gpuLower.includes(gpu)) {
      return vram;
    }
  }

  return null;
}

/**
 * Parse CPU cores from CPU text
 * This is tricky - we'll use a lookup table for common CPUs
 */
function parseCpuCores(cpuText) {
  if (!cpuText) return null;

  const cpuLower = cpuText.toLowerCase();

  // Direct core count mentions
  const coreMatch = cpuText.match(/(\d+)\s*core/i);
  if (coreMatch) {
    return parseInt(coreMatch[1], 10);
  }

  // Quad-core, dual-core mentions
  if (cpuLower.includes('quad-core') || cpuLower.includes('quad core')) return 4;
  if (cpuLower.includes('dual-core') || cpuLower.includes('dual core')) return 2;
  if (cpuLower.includes('hexa-core') || cpuLower.includes('hexa core')) return 6;
  if (cpuLower.includes('octa-core') || cpuLower.includes('octa core')) return 8;

  // Simplified Intel matching
  if (cpuLower.includes('i9')) return 8;
  if (cpuLower.includes('i7')) return 6;  // Conservative estimate
  if (cpuLower.includes('i5')) return 4;
  if (cpuLower.includes('i3')) return 4;

  // AMD lookup
  if (cpuLower.includes('ryzen 9')) return 12;
  if (cpuLower.includes('ryzen 7')) return 8;
  if (cpuLower.includes('ryzen 5')) return 6;
  if (cpuLower.includes('ryzen 3')) return 4;

  // Default for unrecognized - assume 4 cores as a baseline
  return null;
}

/**
 * Parse CPU clock speed from text
 * Examples: "3.0 GHz", "3.0GHz", "3000 MHz"
 */
function parseCpuClock(cpuText) {
  if (!cpuText) return null;

  // Try GHz
  const ghzMatch = cpuText.match(/(\d+\.?\d*)\s*GHz/i);
  if (ghzMatch) {
    return parseFloat(ghzMatch[1]);
  }

  // Try MHz
  const mhzMatch = cpuText.match(/(\d+)\s*MHz/i);
  if (mhzMatch) {
    return parseInt(mhzMatch[1], 10) / 1000;
  }

  return null;
}

/**
 * Parse requirements HTML from Steam into structured data
 */
function parseRequirements(html) {
  if (!html) return null;

  // Extract text content, replacing <br> with newlines
  let text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li>/gi, '\n')
    .replace(/<\/li>/gi, '')
    .replace(/<strong>/gi, '')
    .replace(/<\/strong>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ');

  const lines = text.split(/[\n\r]+/).map(l => l.trim()).filter(Boolean);

  let cpu = null;
  let memory = null;
  let gpu = null;
  let storage = null;
  let os = null;

  for (const line of lines) {
    const lower = line.toLowerCase();

    // Use includes() for more flexible matching
    if (lower.includes('processor:') || lower.includes('cpu:')) {
      const match = line.match(/(?:processor|cpu):\s*(.+)/i);
      if (match) cpu = match[1].trim();
    } else if (lower.includes('memory:') || lower.includes('ram:')) {
      const match = line.match(/(?:memory|ram):\s*(.+)/i);
      if (match) memory = match[1].trim();
    } else if (lower.includes('graphics:') || lower.includes('video card:') || lower.includes('video:')) {
      const match = line.match(/(?:graphics|video card|video):\s*(.+)/i);
      if (match) gpu = match[1].trim();
    } else if (lower.includes('storage:') || lower.includes('hard drive:') || lower.includes('hard disk:')) {
      const match = line.match(/(?:storage|hard drive|hard disk):\s*(.+)/i);
      if (match) storage = match[1].trim();
    } else if (lower.includes('os:') || lower.includes('operating system:')) {
      const match = line.match(/(?:os|operating system):\s*(.+)/i);
      if (match) os = match[1].trim();
    }
  }

  // Fallback: search full text for patterns
  if (!memory) {
    const ramMatch = text.match(/(\d+)\s*GB\s*RAM/i);
    if (ramMatch) memory = ramMatch[0];
  }

  if (!storage) {
    const storageMatch = text.match(/(\d+)\s*GB\s*(available|space|storage|free)/i);
    if (storageMatch) storage = storageMatch[0];
  }

  // Debug logging for development
  // console.log('Parsed:', { cpu, memory, gpu, storage, os });

  return {
    cpu_text: cpu,
    cpu_cores: parseCpuCores(cpu),
    cpu_clock_ghz: parseCpuClock(cpu),
    ram_mb: parseRam(memory),
    gpu_text: gpu,
    gpu_vram_mb: parseGpuVram(gpu),
    storage_gb: parseStorage(storage),
    os: os
  };
}

/**
 * Fetch and store requirements for a game
 */
async function processGame(db, game) {
  const details = await fetchSteamDetails(game.steam_id);
  if (!details) {
    return { success: false, reason: 'fetch_failed' };
  }

  const pcReqs = details.pc_requirements || {};
  const minHtml = pcReqs.minimum || null;
  const recHtml = pcReqs.recommended || null;

  if (!minHtml && !recHtml) {
    return { success: false, reason: 'no_requirements' };
  }

  const minParsed = parseRequirements(minHtml);
  const recParsed = parseRequirements(recHtml);

  // Extract genres
  const genres = (details.genres || []).map(g => g.description).join(', ');

  // Extract release year
  let releaseYear = null;
  if (details.release_date && details.release_date.date) {
    const yearMatch = details.release_date.date.match(/\d{4}/);
    if (yearMatch) {
      releaseYear = parseInt(yearMatch[0], 10);
    }
  }

  // Update database
  const updateStmt = db.prepare(`
    UPDATE games SET
      name = COALESCE(?, name),
      genre = ?,
      release_year = ?,
      header_image = ?,
      requirements_min_raw = ?,
      requirements_rec_raw = ?,
      min_cpu_cores = ?,
      min_cpu_clock_ghz = ?,
      min_cpu_text = ?,
      min_ram_mb = ?,
      min_gpu_vram_mb = ?,
      min_gpu_text = ?,
      min_storage_gb = ?,
      min_os = ?,
      rec_cpu_cores = ?,
      rec_cpu_clock_ghz = ?,
      rec_cpu_text = ?,
      rec_ram_mb = ?,
      rec_gpu_vram_mb = ?,
      rec_gpu_text = ?,
      rec_storage_gb = ?,
      rec_os = ?,
      data_source = 'steam_api',
      requirements_parsed = 1,
      updated_at = datetime('now')
    WHERE steam_id = ?
  `);

  updateStmt.run(
    details.name,
    genres || null,
    releaseYear,
    details.header_image || null,
    minHtml,
    recHtml,
    minParsed?.cpu_cores || null,
    minParsed?.cpu_clock_ghz || null,
    minParsed?.cpu_text || null,
    minParsed?.ram_mb || null,
    minParsed?.gpu_vram_mb || null,
    minParsed?.gpu_text || null,
    minParsed?.storage_gb || null,
    minParsed?.os || null,
    recParsed?.cpu_cores || null,
    recParsed?.cpu_clock_ghz || null,
    recParsed?.cpu_text || null,
    recParsed?.ram_mb || null,
    recParsed?.gpu_vram_mb || null,
    recParsed?.gpu_text || null,
    recParsed?.storage_gb || null,
    recParsed?.os || null,
    game.steam_id
  );

  return {
    success: true,
    name: details.name,
    minRam: minParsed?.ram_mb,
    minVram: minParsed?.gpu_vram_mb,
    recRam: recParsed?.ram_mb,
    recVram: recParsed?.gpu_vram_mb
  };
}

/**
 * Fetch popular games from Steam and add to database
 */
async function fetchPopularGames(db, limit = 100) {
  console.log('Fetching popular games from Steam...');

  try {
    // Steam's featured games endpoint
    const resp = await axios.get('https://store.steampowered.com/api/featuredcategories', {
      timeout: 15000
    });

    const games = [];

    // Extract from various categories
    const categories = ['top_sellers', 'new_releases', 'coming_soon', 'specials'];
    for (const cat of categories) {
      if (resp.data[cat] && resp.data[cat].items) {
        for (const item of resp.data[cat].items) {
          if (item.id && !games.find(g => g.id === item.id)) {
            games.push({ id: item.id, name: item.name });
          }
        }
      }
    }

    // Also try top sellers page
    try {
      const topResp = await axios.get('https://store.steampowered.com/api/featuredcategories?cc=us', {
        timeout: 15000
      });
      if (topResp.data.top_sellers && topResp.data.top_sellers.items) {
        for (const item of topResp.data.top_sellers.items) {
          if (item.id && !games.find(g => g.id === item.id)) {
            games.push({ id: item.id, name: item.name });
          }
        }
      }
    } catch (e) {
      // Continue
    }

    console.log(`Found ${games.length} games from Steam featured`);

    // Insert games into database
    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO games (steam_id, name, data_source, created_at)
      VALUES (?, ?, 'steam_featured', datetime('now'))
    `);

    let added = 0;
    for (const game of games.slice(0, limit)) {
      try {
        const result = insertStmt.run(game.id, game.name || `App ${game.id}`);
        if (result.changes > 0) added++;
      } catch (e) {
        // Ignore duplicates
      }
    }

    console.log(`Added ${added} new games to database`);
    return added;

  } catch (err) {
    console.error('Failed to fetch popular games:', err.message);
    return 0;
  }
}

/**
 * Add well-known popular games manually
 */
function addKnownPopularGames(db) {
  const popularGames = [
    { id: 1091500, name: 'Cyberpunk 2077' },
    { id: 1245620, name: 'Elden Ring' },
    { id: 1174180, name: 'Red Dead Redemption 2' },
    { id: 1938090, name: 'Call of Duty: Modern Warfare III' },
    { id: 1086940, name: 'Baldur\'s Gate 3' },
    { id: 892970, name: 'Valheim' },
    { id: 1593500, name: 'God of War' },
    { id: 1172470, name: 'Apex Legends' },
    { id: 578080, name: 'PUBG: BATTLEGROUNDS' },
    { id: 271590, name: 'Grand Theft Auto V' },
    { id: 730, name: 'Counter-Strike 2' },
    { id: 570, name: 'Dota 2' },
    { id: 1517290, name: 'Battlefield 2042' },
    { id: 1506830, name: 'FIFA 23' },
    { id: 1238810, name: 'Battlefield V' },
    { id: 1238840, name: 'Battlefield 1' },
    { id: 252490, name: 'Rust' },
    { id: 359550, name: 'Tom Clancy\'s Rainbow Six Siege' },
    { id: 1085660, name: 'Destiny 2' },
    { id: 1151640, name: 'Horizon Zero Dawn' },
    { id: 1222670, name: 'The Sims 4' },
    { id: 292030, name: 'The Witcher 3: Wild Hunt' },
    { id: 1240440, name: 'Halo Infinite' },
    { id: 1145360, name: 'Hades' },
    { id: 1172620, name: 'Sea of Thieves' },
    { id: 814380, name: 'Sekiro: Shadows Die Twice' },
    { id: 990080, name: 'Hogwarts Legacy' },
    { id: 1817070, name: 'Marvel\'s Spider-Man Remastered' },
    { id: 1817190, name: 'Marvel\'s Spider-Man: Miles Morales' },
    { id: 1328670, name: 'Mass Effect Legendary Edition' },
    { id: 1063730, name: 'New World' },
    { id: 275850, name: 'No Man\'s Sky' },
    { id: 1716740, name: 'Starfield' },
    { id: 2050650, name: 'Resident Evil 4' },
    { id: 2138330, name: 'Lies of P' },
    { id: 2358720, name: 'Black Myth: Wukong' },
    { id: 2252570, name: 'Silent Hill 2' },
    { id: 1293830, name: 'Forza Horizon 5' },
    { id: 1551360, name: 'Forza Horizon 4' },
    { id: 397540, name: 'Borderlands 3' },
    { id: 582010, name: 'Monster Hunter: World' },
    { id: 1446780, name: 'Monster Hunter Rise' },
    { id: 1449560, name: 'Days Gone' },
    { id: 1282100, name: 'Remnant II' },
    { id: 1245040, name: 'Alan Wake 2' },
    { id: 1203220, name: 'NARAKA: BLADEPOINT' },
    { id: 1938010, name: 'Ready or Not' },
    { id: 1272320, name: 'Stray' },
    { id: 1774580, name: 'Hi-Fi Rush' },
    { id: 427520, name: 'Factorio' },
  ];

  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO games (steam_id, name, data_source, created_at)
    VALUES (?, ?, 'manual_popular', datetime('now'))
  `);

  let added = 0;
  for (const game of popularGames) {
    try {
      const result = insertStmt.run(game.id, game.name);
      if (result.changes > 0) added++;
    } catch (e) {
      // Ignore
    }
  }

  console.log(`Added ${added} known popular games`);
  return added;
}

async function main() {
  const args = process.argv.slice(2);
  let limit = null;
  let specificAppId = null;
  let fetchPopular = false;

  for (const arg of args) {
    if (arg.startsWith('--limit=')) {
      limit = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--appid=')) {
      specificAppId = arg.split('=')[1];
    } else if (arg === '--popular') {
      fetchPopular = true;
    }
  }

  let db;
  try {
    db = new Database(dbPath);
  } catch (err) {
    console.error('Failed to open database:', err.message);
    console.log('Run "npm run intelligence:init" first.');
    process.exit(1);
  }

  try {
    // Ensure new columns exist (migration)
    function addColumnIfNotExists(db, sql) {
      try {
        db.exec(sql);
      } catch (e) {
        const message = e && e.message ? String(e.message) : '';
        // Swallow only "column already exists" type errors; surface everything else.
        if (!/duplicate column name|already exists/i.test(message)) {
          console.error('Failed to apply schema migration for SQL:', sql);
          console.error(e);
          throw e;
        }
      }
    }

    addColumnIfNotExists(db, `ALTER TABLE games ADD COLUMN genre TEXT`);
    addColumnIfNotExists(db, `ALTER TABLE games ADD COLUMN release_year INTEGER`);
    addColumnIfNotExists(db, `ALTER TABLE games ADD COLUMN header_image TEXT`);
    addColumnIfNotExists(db, `ALTER TABLE games ADD COLUMN requirements_min_raw TEXT`);
    addColumnIfNotExists(db, `ALTER TABLE games ADD COLUMN requirements_rec_raw TEXT`);
    addColumnIfNotExists(db, `ALTER TABLE games ADD COLUMN min_cpu_cores INTEGER`);
    // Schema management note:
    // The `games` table is expected to already include all requirement-related
    // columns (min_*, rec_*, requirements_parsed, updated_at, etc.) as defined
    // in the project's schema.sql / migration system. This scraper should not
    // perform inline schema migrations (e.g., ALTER TABLE ... ADD COLUMN ...)
    // to avoid schema drift between different environments.

    // Add popular games if requested or if DB is empty
    if (fetchPopular) {
      addKnownPopularGames(db);
      await fetchPopularGames(db, 100);
    }

    const gameCount = db.prepare('SELECT COUNT(*) as count FROM games').get();
    if (gameCount.count === 0) {
      console.log('No games in database. Adding popular games...');
      addKnownPopularGames(db);
    }

    // Get games to process
    let games;
    if (specificAppId) {
      games = db.prepare('SELECT id, steam_id, name FROM games WHERE steam_id = ?').all(specificAppId);
    } else {
      let query = 'SELECT id, steam_id, name FROM games WHERE steam_id IS NOT NULL';
      query += ' AND (requirements_parsed = 0 OR requirements_parsed IS NULL)';
      if (limit) {
        query += ` LIMIT ${limit}`;
      }
      games = db.prepare(query).all();
    }

    if (games.length === 0) {
      console.log('No games to process. Use --popular to fetch games first.');
      return;
    }

    console.log(`Processing ${games.length} games...`);
    console.log('');

    let success = 0;
    let failed = 0;
    let batched = 0;

    for (let i = 0; i < games.length; i++) {
      const game = games[i];
      process.stdout.write(`[${i + 1}/${games.length}] ${game.name || game.steam_id}... `);

      const result = await processGame(db, game);

      if (result.success) {
        console.log(`✅ RAM: ${result.minRam || '?'}MB / ${result.recRam || '?'}MB, VRAM: ${result.minVram || '?'}MB / ${result.recVram || '?'}MB`);
        success++;
      } else {
        console.log(`❌ ${result.reason}`);
        failed++;
      }

      // Rate limiting
      batched++;
      if (batched >= BATCH_SIZE) {
        console.log(`\n  Pausing after ${BATCH_SIZE} requests...\n`);
        await sleep(BATCH_DELAY_MS);
        batched = 0;
      } else {
        await sleep(RATE_LIMIT_DELAY_MS);
      }
    }

    console.log('\n--- Requirements Scrape Complete ---');
    console.log(`Total: ${games.length}`);
    console.log(`Success: ${success}`);
    console.log(`Failed: ${failed}`);

    // Show stats
    const stats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN requirements_parsed = 1 THEN 1 ELSE 0 END) as parsed,
        SUM(CASE WHEN min_ram_mb IS NOT NULL THEN 1 ELSE 0 END) as has_ram,
        SUM(CASE WHEN min_gpu_vram_mb IS NOT NULL THEN 1 ELSE 0 END) as has_vram
      FROM games
    `).get();

    console.log('\nDatabase Stats:');
    console.log(`  Total games: ${stats.total}`);
    console.log(`  Requirements parsed: ${stats.parsed}`);
    console.log(`  With RAM data: ${stats.has_ram}`);
    console.log(`  With VRAM data: ${stats.has_vram}`);

  } catch (err) {
    console.error('Scrape failed:', err.message);
    process.exit(1);
  } finally {
    db.close();
  }
}

main();
