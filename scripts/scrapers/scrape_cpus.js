#!/usr/bin/env node
const axios = require('axios');
const cheerio = require('cheerio');
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', '..', 'src-tauri', 'intelligence.db');

function usage() {
  console.log('Usage: node scripts/scrapers/scrape_cpus.js <url> [--source=name]');
  process.exit(1);
}

function parseNumber(s) {
  if (!s) return null;
  const cleaned = s.replace(/[ ,\u00A0]+/g, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

async function fetchAndExtract(url, headers = {}) {
  const res = await axios.get(url, { timeout: 20000, headers });
  const $ = cheerio.load(res.data);

  const model = $('h1').first().text().trim() || $('title').text().trim() || url;

  const body = $('body').text();

  function extractFromText(s) {
    if (!s) return null;
    const m = s.match(/CPU\s*Mark[:\s]*([\d,]+)/i)
      || s.match(/PassMark\s*CPU\s*Mark[:\s]*([\d,]+)/i)
      || s.match(/CPU\s*Benchmark[:\s]*([\d,]+)/i)
      || s.match(/CPU\s*Mark\s*\(?[:\s]*([\d,]+)/i);
    return m ? parseNumber(m[1]) : null;
  }

  // 1) try body text
  let score = extractFromText(body);

  // 2) try meta description / og:description
  if (!score) {
    const metaDesc = $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content');
    score = extractFromText(metaDesc);
  }

  // 3) table rows / label-based extraction
  if (!score) {
    const th = $("th:contains('CPU Mark'), th:contains('PassMark'), th:contains('CPU Benchmark')").first();
    if (th.length) {
      const td = th.next('td').text();
      score = extractFromText(td) || parseNumber(td);
    }
  }

  // 4) element-level search
  if (!score) {
    const el = $('*:contains("CPU Mark"), *:contains("PassMark"), *:contains("CPU Benchmark")').filter(function() { return $(this).children().length === 0; }).first();
    if (el.length) score = extractFromText($(el).text());
  }

  // cores
  let cores = null;
  const coresMatch = body.match(/(\d+)\s+cores?/i);
  if (coresMatch) cores = parseInt(coresMatch[1], 10);

  // base clock (GHz)
  let baseClock = null;
  const ghzMatch = body.match(/([\d\.]+)\s*GHz/i);
  if (ghzMatch) baseClock = parseNumber(ghzMatch[1]);

  return { model, cores, baseClock, score };
}

async function upsertCpu(db, record, source) {
  const now = new Date().toISOString();
  const existing = db.prepare('SELECT id, score FROM cpus WHERE model = ?').get(record.model);
  if (existing) {
    db.prepare(`UPDATE cpus SET cores = COALESCE(?, cores), base_clock_ghz = COALESCE(?, base_clock_ghz), score = COALESCE(?, score), data_source = ?, created_at = ? WHERE id = ?`).run(record.cores, record.baseClock, record.score, source, now, existing.id);
    console.log('Updated', record.model);
    return existing;
  } else {
    const info = db.prepare(`INSERT INTO cpus(model, cores, base_clock_ghz, score, data_source, created_at) VALUES (?, ?, ?, ?, ?, ?)`).run(record.model, record.cores, record.baseClock, record.score, source, now);
    console.log('Inserted', record.model);
    return { id: info.lastInsertRowid };
  }
}

(async () => {
  const url = process.argv[2];
  if (!url) usage();
  const sourceArg = process.argv.find(a => a.startsWith('--source='));
  const source = sourceArg ? sourceArg.split('=')[1] : 'passmark';

  const db = new Database(DB_PATH);
  try {
    // initial fetch/extract
    const rec = await fetchAndExtract(url);
    await upsertCpu(db, rec, source);

    // If we have no score, retry once with a browser UA to get content rendered differently
    if (!rec.score) {
      try {
        const retry = await fetchAndExtract(url, { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0 Safari/537.36' });
        if (retry.score) {
          // update the existing row
          const existing = db.prepare('SELECT id FROM cpus WHERE model = ?').get(rec.model);
          if (existing) {
            db.prepare('UPDATE cpus SET score = ? WHERE id = ?').run(retry.score, existing.id);
            console.log('Retry: updated score for', rec.model, retry.score);
          }
        } else {
          console.log('Retry: no score found');
        }
      } catch (e) {
        console.error('Retry fetch failed:', e.message);
      }
    }
  } catch (err) {
    console.error('Error scraping:', err.message);
    process.exit(2);
  } finally {
    db.close();
  }
})();

#!/usr/bin/env node
const axios = require('axios');
const cheerio = require('cheerio');
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', '..', 'src-tauri', 'intelligence.db');
const db = new Database(dbPath);

function usage() {
  console.log('Usage: node scripts/scrapers/scrape_cpus.js <url> [--source=name]');
  process.exit(1);
}

function parseNumber(s) {
  if (!s) return null;
  const cleaned = s.replace(/[,\s]+/g, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

async function scrape(url, source) {
  console.log('Fetching', url);
  const res = await axios.get(url, { timeout: 15000 });
  const $ = cheerio.load(res.data);

  let model = $('h1').first().text().trim() || $('title').text().trim() || url;

  const body = $('body').text();

  // Try multiple strategies to extract a CPU Mark / score
  let score = null;

  function extractFromText(s) {
    if (!s) return null;
    const m = s.match(/CPU\s*Mark[:\s]*([\d,]+)/i) || s.match(/PassMark\s*CPU\s*Mark[:\s]*([\d,]+)/i) || s.match(/CPU\s*Benchmark[:\s]*([\d,]+)/i) || s.match(/CPU\s*Mark\s*\(?[:\s]*([\d,]+)/i);
    return m ? parseNumber(m[1]) : null;
  }

  // 1) Try body text
  score = extractFromText(body);

  // 2) Try meta description / og:description
  if (!score) {
    const metaDesc = $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content');
    score = extractFromText(metaDesc);
  }

  // 3) Look for explicit table rows / labels
  if (!score) {
    const th = $("th:contains('CPU Mark'), th:contains('PassMark'), th:contains('CPU Benchmark')").first();
    if (th.length) {
      const td = th.next('td').text();
      score = extractFromText(td) || parseNumber(td);
    }
  }

  // 4) Search for any element that mentions 'CPU Mark' and parse nearby text
  if (!score) {
    const el = $('*:contains("CPU Mark"), *:contains("PassMark"), *:contains("CPU Benchmark")').filter(function() { return $(this).children().length === 0; }).first();
    if (el.length) score = extractFromText($(el).text());
  }

  // Try cores and base clock
  let cores = null;
  const coresMatch = body.match(/(\d+)\s+cores?/i);
  if (coresMatch) cores = parseInt(coresMatch[1], 10);

    await scrape(url, source);
    // If scraping yielded no score, retry once with a browser-like User-Agent header
    // Some sites render numbers differently depending on UA or require JS; retrying may help meta-based extraction
    try {
      // load the page with a common browser UA
      const axios = require('axios');
      const res = await axios.get(url, { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0 Safari/537.36' } });
      const cheerio = require('cheerio');
      const $ = cheerio.load(res.data);

      function parseNumberLocal(s) { if (!s) return null; const cleaned = s.replace(/[,\s]+/g, ''); const n = parseFloat(cleaned); return Number.isFinite(n) ? n : null; }
      function extractFromTextLocal(s) { if (!s) return null; const m = s.match(/CPU\s*Mark[:\s]*([\d,]+)/i) || s.match(/PassMark\s*CPU\s*Mark[:\s]*([\d,]+)/i) || s.match(/CPU\s*Benchmark[:\s]*([\d,]+)/i); return m ? parseNumberLocal(m[1]) : null; }

      let retryScore = null;
      retryScore = extractFromTextLocal($('body').text());
      if (!retryScore) {
        const metaDesc = $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content');
        retryScore = extractFromTextLocal(metaDesc);
      }
      if (!retryScore) {
        const th = $("th:contains('CPU Mark'), th:contains('PassMark'), th:contains('CPU Benchmark')").first();
        if (th.length) {
          const td = th.next('td').text();
          retryScore = extractFromTextLocal(td) || parseNumberLocal(td);
        }
      }

      if (retryScore) {
        // Upsert the discovered retry score
        const db2 = require('better-sqlite3')(path.join(__dirname, '..', '..', 'src-tauri', 'intelligence.db'));
        // determine model from page
        const model = $('h1').first().text().trim() || $('title').text().trim() || url;
        const existing = db2.prepare('SELECT id, score FROM cpus WHERE model = ?').get(model);
        if (existing) {
          if (!existing.score) {
            db2.prepare('UPDATE cpus SET score = ? WHERE id = ?').run(retryScore, existing.id);
            console.log('Retry: updated score for', model, retryScore);
          }
        }
        db2.close();
      }
    } catch (e) {
      // ignore retry errors
    }
