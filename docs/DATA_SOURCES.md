# Data Sources - Quick Reference

This document lists all external data sources used to bootstrap and maintain SpecPilot's hardware and game databases.

---

## Hardware Databases

### GPU Data: TechPowerUp

**URL:** <https://www.techpowerup.com/gpu-specs/>

**What we get:**

- 2000+ GPU models with full specifications
- Memory size, bandwidth, bus width
- Core/boost clock speeds
- TDP (power consumption)
- Release dates
- Architecture details

**Scraping strategy:**

```bash
# Example URL
https://www.techpowerup.com/gpu-specs/geforce-rtx-3060.c3682

# Parse HTML with cheerio
npm run scrape:gpus -- --start=0 --limit=100
```

**Data quality:** ⭐⭐⭐⭐⭐ (Excellent, community-maintained, very accurate)

**Update frequency:** Weekly (new GPU releases)

---

### CPU Data: PassMark / UserBenchmark

**PassMark:**

- URL: <https://www.cpubenchmark.net/>
- Single-thread and multi-thread scores
- Gaming performance benchmarks
- 1000+ CPU models

**UserBenchmark:**

- URL: <https://cpu.userbenchmark.com/>
- Real-world performance scores
- Gaming-focused benchmarks

**What we need:**

- CPU model name
- Gaming score (normalized to 0-10000)
- Single-thread performance
- Multi-thread performance

**Scraping strategy:**

```bash
npm run scrape:cpus -- --source=passmark
npm run scrape:cpus -- --source=userbenchmark
npm run merge:cpu-scores  # Average both sources
```

**Data quality:** ⭐⭐⭐⭐ (Good, but sometimes inconsistent between sources)

**Update frequency:** Monthly

---

### Alternative Hardware Source: GPU-Specs.com

**URL:** <https://www.gpu-specs.com/>

**Backup source** if TechPowerUp blocks scraping.

---

## Game Requirements

### PCGamingWiki

**URL:** <https://www.pcgamingwiki.com/>

**API:** `https://www.pcgamingwiki.com/api/appdetails.php?appid=STEAM_ID`

**What we get:**

```json
{
  "system_requirements": {
    "windows": {
      "minimum": {
        "os": "Windows 10 64-bit",
        "processor": "Intel Core i5-3570K or AMD FX-8310",
        "memory": "8 GB RAM",
        "graphics": "NVIDIA GeForce GTX 780 or AMD Radeon RX 470",
        "storage": "70 GB available space"
      },
      "recommended": { ... }
    },
    "linux": { ... }
  }
}
```

**Coverage:** 30,000+ games

**Data quality:** ⭐⭐⭐⭐ (Community-maintained, generally accurate)

**Scraping strategy:**

```bash
# Fetch Steam's top 1000 games first
npm run fetch:steam-top-games

# For each game, query PCGamingWiki
npm run scrape:game-requirements -- --source=pcgamingwiki

# Parse and normalize requirements
npm run normalize:game-requirements
```

**Update frequency:** Weekly for popular games, on-demand for new releases

---

### Steam Store API

**URL:** `https://store.steampowered.com/api/appdetails?appids=STEAM_ID`

**What we get:**

- Official game system requirements (from publisher)
- Release date
- Genre/tags
- Price (to prioritize popular games)

**Example:**

```bash
curl "https://store.steampowered.com/api/appdetails?appids=1091500" | jq '.["1091500"].data.pc_requirements'
```

**Coverage:** All Steam games (~50,000+)

**Data quality:** ⭐⭐⭐ (Publisher-provided, sometimes misleading)

**Rate limits:** ~200 requests per 5 minutes (need to throttle)

---

## Linux Gaming Data

### ProtonDB

**URL:** <https://www.protondb.com/>

**API (Unofficial):**

- Summary: `https://www.protondb.com/api/v1/reports/summaries/latest.json`
- Game-specific: `https://www.protondb.com/api/v1/reports/summaries/{appId}.json`

**What we get:**

```json
{
  "bestReportedTier": "platinum",
  "confidence": "strong",
  "score": 0.96,
  "tier": "platinum",
  "total": 1247,
  "trendingTier": "platinum"
}
```

**User reports:**

- Proton version used
- GPU/CPU info (sometimes)
- Performance notes
- Known issues and workarounds

**Coverage:** 15,000+ games with reports (100,000+ total reports)

**Data quality:** ⭐⭐⭐⭐⭐ (Excellent, user-verified, Linux-specific)

**Update frequency:** Real-time (user-submitted)

**Scraping strategy:**

```bash
# Download full summary
npm run sync:protondb -- --full

# Update incrementally (daily)
npm run sync:protondb -- --since=7days
```

---

### Steam Deck Compatibility (Valve Official)

**URL:** Steam API (requires API key)

**API:** `https://store.steampowered.com/api/appdetails?appids=STEAM_ID`

**Response field:** `deck_compatibility`

```json
{
  "deck_compatibility": {
    "category": 3,  // 0=Unknown, 1=Unsupported, 2=Playable, 3=Verified
    "tests": {
      "controller_support": true,
      "display_support": true,
      "seamless_play": true
    }
  }
}
```

**Coverage:** ~7,000 games tested by Valve

**Data quality:** ⭐⭐⭐⭐⭐ (Official, verified by Valve)

**Update frequency:** Weekly (Valve continuously testing games)

---

### CheckMyDeck (Community Performance Data)

**URL:** <https://checkmydeck.ofdgn.com/>

**What we get:**

- User-reported FPS for Steam Deck
- Recommended settings per game
- Battery life estimates

**Coverage:** 1,000+ popular games

**Data quality:** ⭐⭐⭐⭐ (User-submitted, moderated)

**Scraping strategy:**

```bash
npm run scrape:checkmydeck
```

---

## Driver Issues

### PCGamingWiki Known Issues

**URL:** <https://www.pcgamingwiki.com/wiki/{Game_Name}>

**What we get:**

- Known crashes with specific driver versions
- Workarounds and fixes
- Performance issues

**Example:**

Game: Starfield
Issue: Crashes on AMD Radeon driver 23.7.1
Fix: Update to 23.8.2 or later

**Scraping strategy:**

```bash
# Extract "Known issues" sections from wiki pages
npm run scrape:driver-issues
```

---

### Reddit/Forums (Manual Curation)

**Sources:**

- r/nvidia
- r/AMD
- r/linux_gaming
- Steam Community forums

**What we monitor:**

- Driver update threads
- Game-specific issue reports
- PSAs about broken drivers

**Process:**

- Weekly manual review
- Add critical issues to `driver_issues` table
- Tag with `source: 'community'`

---

## Benchmark Data (Optional, Future)

### 3DMark / Unigine Benchmarks

**Use case:** Convert synthetic benchmark scores to game performance tiers

**Sources:**

- 3DMark API (paid)
- Unigine results database

**Status:** Not needed for MVP (tier-based system is sufficient)

---

### YouTube Benchmark Videos

**Channels:**

- Digital Foundry
- Hardware Unboxed
- Gamers Nexus

**What we get:**

- Real-world game FPS data
- Quality settings tested
- 1% low FPS (frame stability)

**Scraping strategy:**

```bash
# Parse video descriptions for hardware specs
# Extract FPS from charts (OCR if needed)
# Manually curate for now, automate later
```

**Status:** Phase 3+ (nice to have, not critical)

---

## Data Quality Hierarchy

When multiple sources provide conflicting data, use this priority:

1. ✅ **Valve Official (Steam Deck)** - Highest trust
2. ✅ **ProtonDB (Linux)** - User-verified, large sample
3. ✅ **TechPowerUp (GPU specs)** - Community-maintained, accurate
4. ✅ **PCGamingWiki** - Community-maintained, generally good
5. ⚠️ **Publisher specs (Steam Store)** - Often misleading, use with caution
6. ⚠️ **Reddit/Forums** - Anecdotal, needs verification

---

## Scraping Ethics & Rate Limits

### Rate Limiting

```typescript
const RATE_LIMITS = {
  techpowerup: '1 req/second',
  steam_api: '200 req/5 minutes',
  pcgamingwiki: '5 req/second',
  protondb: '10 req/second',
};
```

**Implementation:**

```bash
# Use delays between requests
npm run scrape:gpus -- --delay=1000  # 1 second between requests
```

### Respectful Scraping

1. ✅ **Identify yourself:** Set User-Agent to "SpecPilot/1.0 (<https://github.com/>...)"
2. ✅ **Respect robots.txt:** Check before scraping
3. ✅ **Cache aggressively:** Don't re-fetch unchanged data
4. ✅ **Off-peak hours:** Run large scrapes during low-traffic times
5. ✅ **Support sites:** If using data heavily, consider sponsoring/donating

### Legal Compliance

- ✅ PCGamingWiki: CC BY-SA 3.0 license (attribution required)
- ✅ ProtonDB: Public API, no restrictions mentioned
- ✅ Steam API: Requires API key, subject to terms of service
- ⚠️ TechPowerUp: No official API, check scraping policy

**Attribution:**

Data sources:

- GPU specifications from TechPowerUp (<https://www.techpowerup.com>)
- Game requirements from PCGamingWiki (<https://www.pcgamingwiki.com>)
- Linux compatibility from ProtonDB (<https://www.protondb.com>)
- Steam Deck compatibility from Valve

---

## Data Refresh Schedule

### Automated (Cron Jobs)

```bash
# Daily: ProtonDB sync (new user reports)
0 2 * * * npm run sync:protondb

# Weekly: Steam Deck compatibility
0 3 * * 0 npm run sync:steam-deck

# Weekly: New GPU releases
0 4 * * 0 npm run scrape:gpus -- --new-only

# Monthly: Full hardware database refresh
0 5 1 * * npm run scrape:hardware -- --full

# Monthly: Game requirements update (top 1000)
0 6 1 * * npm run scrape:game-requirements -- --top-1000
```

### Manual Triggers

```bash
# When new AAA game releases
npm run add:game -- --name="Baldur's Gate 3" --steam-id=1086940

# When major GPU launch (e.g., RTX 5000 series)
npm run scrape:gpus -- --vendor=nvidia --series=5000

# When Proton major version releases
npm run sync:protondb -- --force-full-refresh
```

---

## Fallback Strategies

### If Primary Source Fails

```typescript
const DATA_SOURCES = {
  gpu_specs: ['techpowerup', 'gpu-specs.com', 'manual_entry'],
  game_requirements: ['pcgamingwiki', 'steam_store', 'manual_entry'],
  proton_data: ['protondb', 'reddit_linux_gaming', 'manual_curation'],
};

async function fetchWithFallback(dataType: string, id: string) {
  for (const source of DATA_SOURCES[dataType]) {
    try {
      return await fetch(source, id);
    } catch (error) {
      console.warn(`${source} failed, trying next...`);
    }
  }
  throw new Error('All sources failed');
}
```

---

## Data Validation

### Post-Scrape Checks

```bash
# Verify data integrity
npm run validate:hardware  # Check for duplicates, missing fields
npm run validate:games     # Verify Steam IDs, check requirements

# Flag anomalies
npm run detect:anomalies   # GPUs with 0 VRAM, games with no requirements

# Generate report
npm run data:health-check  # Overall data quality metrics
```

### Example Validation Rules

```typescript
// GPUs must have VRAM
if (gpu.vram_mb === 0 && gpu.tier > 1) {
  flag('Missing VRAM', gpu);
}

// Game requirements must have at least minimum specs
if (!game.requirements.minimum) {
  flag('No minimum requirements', game);
}

// ProtonDB rating must be valid
if (!['Platinum', 'Gold', 'Silver', 'Bronze', 'Borked'].includes(rating)) {
  flag('Invalid ProtonDB rating', game);
}
```

---

## Database Seeding

### Bootstrap Script (Week 1)

```bash
# Full bootstrap process
npm run bootstrap:all

# Breakdown:
# 1. Hardware (TechPowerUp + benchmarks)
npm run bootstrap:hardware  # ~2 hours, 3000+ entries

# 2. Top 100 games (manual entry for accuracy)
npm run bootstrap:games-manual  # ~4 hours

# 3. ProtonDB sync
npm run bootstrap:protondb  # ~30 minutes, 15k+ games

# 4. Steam Deck compatibility
npm run bootstrap:steam-deck  # ~1 hour, 7k+ games

# 5. Verify data integrity
npm run validate:all

# Result: Database ready for MVP
```

---

## Monitoring & Alerts

### Data Staleness Alerts

```bash
# Alert if data hasn't been updated recently
if (lastProtonDBSync > 7 days) {
  alert('ProtonDB sync overdue');
}

if (hardwareDatabase.lastUpdate > 30 days) {
  alert('Hardware database needs refresh');
}
```

### Scraping Failure Alerts

```typescript
// Monitor scraping success rates
const metrics = {
  techpowerup_success_rate: 0.98,  // 98% success
  steam_api_rate_limited: false,
  pcgamingwiki_last_success: new Date(),
};

// Alert if below threshold
if (metrics.techpowerup_success_rate < 0.90) {
  alert('TechPowerUp scraping degraded - check for site changes');
}
```

---

## Next Steps

1. **Week 1:** Implement scrapers for TechPowerUp and benchmark sites
2. **Week 2:** Bootstrap hardware database (3000+ entries)
3. **Week 3:** Integrate ProtonDB and Steam Deck data
4. **Week 4:** Manual curation of top 100 games
5. **Ongoing:** Automated nightly syncs for fresh data

**See [INTELLIGENCE_LAYER.md](INTELLIGENCE_LAYER.md) for how this data is used in the verdict system.**
