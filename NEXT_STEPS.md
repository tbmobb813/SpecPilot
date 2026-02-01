# Next Steps - Quick Action Guide

This file provides a clear, prioritized list of what to work on next.

---

## 🚀 Start Here (Week 1)

### 1. Test the Current Build

```bash
cd /home/tbmobb813/projects/SpecPilot

# Install dependencies
npm install

# Run development server
npm run tauri dev
```

**Expected result:** App window opens, you can click "Scan My PC" and see your hardware.

**If it fails:**

- Check [QUICKSTART.md](QUICKSTART.md) troubleshooting section
- Verify Rust and Node.js are installed
- Check that all system tools are available (lspci, nvidia-smi, etc.)

---

### 2. Verify Hardware Detection

**Test checklist:**

- [ ] CPU detected correctly
- [ ] GPU detected correctly
- [ ] RAM amount correct
- [ ] Storage capacity correct
- [ ] VRAM shows correctly (if NVIDIA)
- [ ] Driver version shows
- [ ] Tier classification makes sense

**Known issues to expect:**

- ⚠️ AMD GPU VRAM shows 0 MB (not implemented yet)
- ⚠️ DirectX shows placeholder on Windows (needs proper detection)
- ⚠️ Some tier classifications may be off (needs database refinement)

---

### 3. Read Core Documentation

**Priority order:**

1. [QUICKSTART.md](QUICKSTART.md) - 10 minutes
2. [INTELLIGENCE_LAYER.md](INTELLIGENCE_LAYER.md) - 30 minutes (skim, come back to details)
3. [DATA_SOURCES.md](DATA_SOURCES.md) - 15 minutes (reference)

**Key takeaways:**

- Understand the hybrid tier + score system
- Know where data comes from (ProtonDB, TechPowerUp, etc.)
- Grasp the MVP → scale strategy

---

## 🔧 Week 1-2: Fix Core Issues

### Priority 1: AMD GPU VRAM Detection (Linux)

**File to edit:** `src-tauri/src/hardware/platform/linux.rs`

**Current code:**

```rust
fn detect_vram(vendor: &GpuVendor) -> Result<u64> {
    match vendor {
        GpuVendor::AMD => {
            // ❌ Not implemented yet
        }
        // ...
    }
    Ok(0) // Returns 0 for AMD
}
```

**Solution:**

```rust
GpuVendor::AMD => {
    // Parse sysfs
    let glob_pattern = "/sys/class/drm/card*/device/mem_info_vram_total";
    for entry in glob::glob(glob_pattern)? {
        if let Ok(path) = entry {
            if let Ok(vram_str) = fs::read_to_string(path) {
                if let Ok(vram_bytes) = vram_str.trim().parse::<u64>() {
                    return Ok(vram_bytes / (1024 * 1024)); // Bytes to MB
                }
            }
        }
    }
}
```

**Test:**

```bash
# On AMD system
npm run tauri dev
# Click "Scan My PC"
# Verify VRAM shows correctly
```

**Dependencies to add to Cargo.toml:**

```toml
[dependencies]
glob = "0.3"
```

---

### Priority 2: Add Unit Tests

**Create:** `src-tauri/tests/tier_classification.rs`

```rust
#[cfg(test)]
mod tests {
    use crate::hardware::{classify_cpu_tier, classify_gpu_tier, CpuTier, GpuTier};

    #[test]
    fn test_classify_nvidia_4090() {
        let tier = classify_gpu_tier("NVIDIA GeForce RTX 4090");
        assert_eq!(tier, GpuTier::Ultra);
    }

    #[test]
    fn test_classify_amd_integrated() {
        let tier = classify_gpu_tier("AMD Radeon Vega 8 Graphics");
        assert_eq!(tier, GpuTier::Integrated);
    }

    #[test]
    fn test_classify_intel_i9() {
        let tier = classify_cpu_tier("Intel Core i9-13900K");
        assert_eq!(tier, CpuTier::Enthusiast);
    }

    #[test]
    fn test_classify_ryzen_5() {
        let tier = classify_cpu_tier("AMD Ryzen 5 5600X");
        assert_eq!(tier, CpuTier::Mainstream);
    }
}
```

**Run tests:**

```bash
cd src-tauri
cargo test
```

---

### Priority 3: OpenGL Detection (Linux)

**File to edit:** `src-tauri/src/hardware/platform/linux.rs`

**Add function:**

```rust
pub fn detect_opengl() -> Result<Option<OpenGLSupport>> {
    let output = Command::new("glxinfo")
        .arg("-B")
        .output();

    if output.is_err() {
        return Ok(None);
    }

    let output = output.unwrap();
    let info = String::from_utf8_lossy(&output.stdout);

    let version = info
        .lines()
        .find(|line| line.contains("OpenGL version"))
        .and_then(|line| line.split(':').nth(1))
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|| "Unknown".into());

    Ok(Some(OpenGLSupport { version }))
}
```

**Update mod.rs:**

```rust
pub fn scan_system() -> Result<HardwareProfile> {
    // ... existing code ...

    let graphics_api = GraphicsApiSupport {
        vulkan: platform_impl::detect_vulkan()?,
        opengl: platform_impl::detect_opengl()?,  // ← Add this
        // ... rest
    };

    // ... rest
}
```

---

## 🎮 Week 3-4: Intelligence Layer Bootstrap

### Step 1: Create Database Schema

**Create:** `src-tauri/src/database/schema.sql`

Copy schema from [INTELLIGENCE_LAYER.md](INTELLIGENCE_LAYER.md) section "Database Schema".

**Initialize:**

```bash
npm run intelligence:init
# Creates intelligence.db with empty tables
```

---

### Step 2: Build Scrapers

**Create directory structure:**

```bash
mkdir -p scripts/scrapers
cd scripts/scrapers
```

**GPU Scraper** (`scripts/scrapers/techpowerup.ts`):

```typescript
import axios from 'axios';
import * as cheerio from 'cheerio';
import { db } from '../database';

async function scrapeGPU(url: string) {
  const response = await axios.get(url);
  const $ = cheerio.load(response.data);

  const model = $('h1.name').text().trim();
  const specs = {
    vram: parseInt($('.specs .memory').text()) || 0,
    tdp: parseInt($('.specs .tdp').text()) || 0,
    // ... parse other fields
  };

  const tier = calculateTier(specs);
  const score = calculateScore(specs);

  await db.gpus.insert({
    model,
    tier,
    score,
    ...specs,
    data_source: 'techpowerup',
    verified: false
  });
}

function calculateTier(specs: any): number {
  // Tier logic based on specs
  // See INTELLIGENCE_LAYER.md for algorithm
}
```

**Run scraper:**

```bash
npm run scrape:gpus -- --limit=100  # Test with 100 first
npm run scrape:gpus -- --full       # Full scrape (2000+)
```

---

### Step 3: ProtonDB Integration

**Create:** `scripts/sync/protondb.ts`

```typescript
async function syncProtonDB() {
  const response = await fetch(
    'https://www.protondb.com/api/v1/reports/summaries/latest.json'
  );
  const data = await response.json();

  for (const [appId, report] of Object.entries(data)) {
    await db.proton_compatibility.upsert({
      game_id: appId,
      protondb_rating: report.tier,
      total_reports: report.total,
      last_synced: new Date()
    });
  }

  console.log(`Synced ${Object.keys(data).length} games from ProtonDB`);
}
```

**Run sync:**

```bash
npm run sync:protondb
```

---

### Step 4: Implement Rules Engine

**Create:** `src-tauri/src/intelligence/rules.rs`

```rust
pub fn evaluate_verdict(
    hardware: &HardwareProfile,
    game: &GameRequirement
) -> VerdictResponse {
    // Check tier requirements
    let cpu_pass = hardware.cpu.tier >= game.cpu_tier_min;
    let gpu_pass = hardware.gpu.tier >= game.gpu_tier_min;
    let ram_pass = hardware.memory.total >= game.ram_mb;
    let vram_pass = hardware.gpu.vram >= game.vram_mb;

    // Determine verdict
    let status = if cpu_pass && gpu_pass && ram_pass && vram_pass {
        VerdictStatus::Good
    } else if !cpu_pass || !gpu_pass {
        VerdictStatus::Struggling
    } else {
        VerdictStatus::Playable
    };

    // Detect bottlenecks
    let mut bottlenecks = vec![];
    if !cpu_pass {
        bottlenecks.push(Bottleneck {
            component: "CPU".into(),
            severity: "major",
            // ... details
        });
    }

    VerdictResponse {
        status,
        bottlenecks,
        narrative: build_narrative(status, bottlenecks),
        // ... rest
    }
}
```

**Test:**

```bash
cd src-tauri
cargo test intelligence::rules
```

---

### Step 5: Add Top 100 Games (Manual)

**Create:** `data/games-top-100.json`

```json
[
  {
    "steam_id": 1091500,
    "name": "Cyberpunk 2077",
    "requirements": {
      "minimum": {
        "cpu_tier": 3,
        "gpu_tier": 3,
        "ram_mb": 8192,
        "vram_mb": 3072,
        "storage_gb": 70
      },
      "recommended": {
        "cpu_tier": 4,
        "gpu_tier": 5,
        "ram_mb": 12288,
        "vram_mb": 6144,
        "storage_gb": 70
      }
    }
  }
  // ... 99 more games
]
```

**Import:**

```bash
npm run games:import -- --file=data/games-top-100.json
```

**Recommended games to start with:**

1. Cyberpunk 2077
2. Baldur's Gate 3
3. Elden Ring
4. Red Dead Redemption 2
5. The Witcher 3
6. GTA V
7. Starfield
8. Spider-Man Remastered
9. God of War
10. Hogwarts Legacy

... (continue to 100)

**Get requirements from:** PCGamingWiki, Steam Store, community consensus

---

## 📊 Week 5-6: Validation

### Step 1: Launch Telemetry

**Add to frontend** (`src/components/TelemetrySettings.tsx`):

```typescript
export function TelemetrySettings() {
  const [enabled, setEnabled] = useState(false);

  return (
    <div className="telemetry-settings">
      <h3>Help Improve SpecPilot</h3>
      <p>
        Share anonymous performance data to help verify game compatibility.
        No personal information is collected.
      </p>

      <label>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        Enable telemetry (optional)
      </label>

      {enabled && (
        <button onClick={submitReport}>
          Submit Performance Report
        </button>
      )}

      <a href="/privacy">What data is collected?</a>
    </div>
  );
}
```

---

### Step 2: Collect User Reports

**After game compatibility check:**

```typescript
async function submitPerformanceReport(
  game: string,
  verdict: VerdictResponse,
  actualPerformance: {
    avg_fps: number;
    stable: boolean;
    settings: string;
  }
) {
  // Only if telemetry enabled
  if (!telemetrySettings.enabled) return;

  await invoke('submit_telemetry', {
    report: {
      game_id: game.steam_id,
      hardware_hash: hashHardware(hardware),
      performance: actualPerformance,
      predicted_verdict: verdict.status,
      timestamp: new Date()
    }
  });
}
```

---

### Step 3: Analyze & Calibrate

**Weekly job:**

```bash
npm run jobs:analyze-telemetry
npm run jobs:calibrate-tiers
```

**What it does:**

1. Aggregate user reports by hardware tier
2. Calculate average FPS per tier
3. Identify misclassified hardware
4. Flag games with inaccurate requirements
5. Update tier thresholds

---

## 🎯 Success Metrics (3 Months)

Track these metrics:

```typescript
interface Metrics {
  // Data coverage
  gpus_in_database: number;           // Target: 2000+
  cpus_in_database: number;           // Target: 1000+
  games_with_requirements: number;    // Target: 100 → 1000+

  // Accuracy
  verdict_accuracy: number;           // Target: 95%+
  user_satisfaction_rating: number;   // Target: 4.5/5

  // Adoption
  total_scans: number;                // Target: 10,000+
  telemetry_opt_in_rate: number;      // Target: 50%+
  user_reports_collected: number;     // Target: 1,000+

  // Performance
  avg_scan_time_ms: number;           // Target: <500ms
  avg_verdict_time_ms: number;        // Target: <100ms
}
```

---

## 🏆 Milestones

### Milestone 1: MVP Complete (Week 4)

- [ ] 100 games with requirements
- [ ] Rules engine working
- [ ] Basic UI for game checking
- [ ] Accuracy: 80%+

### Milestone 2: Beta Launch (Week 8)

- [ ] 500 games covered
- [ ] Telemetry collecting
- [ ] ProtonDB integrated
- [ ] Accuracy: 90%+
- [ ] Soft launch on r/linux_gaming

### Milestone 3: Public Launch (Week 12)

- [ ] 1000+ games covered
- [ ] Steam Deck optimizations
- [ ] 5,000+ user reports
- [ ] Accuracy: 95%+
- [ ] Featured on r/SteamDeck

### Milestone 4: Market Leader (Month 6)

- [ ] 5000+ games
- [ ] 50,000+ scans performed
- [ ] #1 for "Steam Deck game checker"
- [ ] Better Linux coverage than CYRI

---

## 🔄 Daily Workflow

### Morning (1 hour)

1. Check telemetry dashboard - any anomalies?
2. Review user reports from yesterday
3. Triage GitHub issues
4. Update roadmap if needed

### Development (4-6 hours)

1. Pick highest priority task from this document
2. Write code
3. Write tests
4. Commit with clear message

### Evening (30 mins)

1. Run full test suite
2. Update progress tracking
3. Document any blockers
4. Plan tomorrow's tasks

---

## 📝 Quick Commands Reference

```bash
# Development
npm run tauri dev              # Start dev server
npm run tauri build            # Production build

# Testing
cargo test                     # Rust tests
npm test                       # Frontend tests

# Data operations
npm run scrape:gpus            # Scrape GPU database
npm run sync:protondb          # Sync ProtonDB data
npm run games:import           # Import game requirements

# Jobs
npm run jobs:calibrate-tiers   # Adjust tiers from telemetry
npm run jobs:update-drivers    # Sync driver issue database

# Database
npm run db:migrate             # Run migrations
npm run db:seed                # Seed test data
npm run db:backup              # Backup database
```

---

## 🆘 Getting Stuck?

### If Hardware Detection Fails

1. Check [QUICKSTART.md](QUICKSTART.md) troubleshooting
2. Verify system tools are installed (lspci, etc.)
3. Check logs: `tail -f ~/.specpilot/logs/app.log`

### If Scraping Fails

1. Check rate limits in [DATA_SOURCES.md](DATA_SOURCES.md)
2. Verify site hasn't changed structure
3. Check internet connection
4. Try manual fetch: `curl -I https://techpowerup.com`

### If Tests Fail

1. Run with verbose output: `cargo test -- --nocapture`
2. Check database is initialized: `sqlite3 intelligence.db .tables`
3. Clear cache: `cargo clean && npm run tauri dev`

### If Nothing Works

1. Check all dependencies are installed
2. Try on a fresh directory
3. Open an issue with logs attached

---

## 🎓 Learning Resources

As you build, reference these:

**Rust:**

- [The Rust Book](https://doc.rust-lang.org/book/)
- [Tauri Docs](https://tauri.app/v1/guides/)
- [sqlx Documentation](https://docs.rs/sqlx/latest/sqlx/)

**Web Scraping:**

- [cheerio](https://cheerio.js.org/)
- [axios](https://axios-http.com/)
- Respect robots.txt and rate limits

**Gaming APIs:**

- [ProtonDB API](https://www.protondb.com/api/v1/)
- [Steam Web API](https://steamcommunity.com/dev)
- [PCGamingWiki](https://www.pcgamingwiki.com/)

---

**You now have a complete roadmap. Start with Week 1 tasks and work your way through. Good luck!** 🚀
