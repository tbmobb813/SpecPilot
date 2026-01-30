# Intelligence Layer - Game Compatibility System

## Overview

This document defines the architecture for SpecPilot's game compatibility checking system - the "Can You Run It" functionality that compares detected hardware against game requirements.

**Design Philosophy:**
- ✅ **Start simple, iterate fast** - Ship MVP, collect real data, refine
- ✅ **Bootstrap from existing data** - Leverage ProtonDB, TechPowerUp, community datasets
- ✅ **Conservative verdicts** - Underpromise to build trust
- ✅ **Deterministic rules** - No ML until we have ground truth data
- ✅ **Linux/Steam Deck first** - Dominate underserved market before expanding

---

## Architecture: Hybrid Tier + Score System

### Problem with Pure Tier System

```
❌ Pure Tiers (Too Coarse):
RTX 3060 (8GB)    → Tier 4 (Mainstream)
RTX 3060 Ti (8GB) → Tier 4 (Mainstream)
Reality: 3060 Ti is 20% faster, but same verdict
```

### Solution: Hybrid System

```typescript
interface HardwareEntry {
  // Coarse classification for broad matching
  tier: number;           // 1-7 (Budget → Ultra)

  // Fine-grained ranking for precise comparisons
  score: number;          // 0-10000 (normalized performance)

  // Feature flags for specific requirements
  features: {
    ray_tracing: boolean;
    dlss: '2.0' | '3.0' | null;
    fsr: '1.0' | '2.0' | '3.0' | null;
    mesh_shaders: boolean;
    vrs: boolean;          // Variable Rate Shading
  };

  // Technical specs
  specs: {
    vram: number;          // MB
    memory_bandwidth: number; // GB/s
    tdp: number;           // Watts
    release_year: number;
  };
}
```

**Example:**

```json
{
  "model": "NVIDIA GeForce RTX 3060",
  "tier": 4,
  "score": 8500,
  "features": {
    "ray_tracing": true,
    "dlss": "2.0",
    "fsr": "2.0",
    "mesh_shaders": false,
    "vrs": true
  },
  "specs": {
    "vram": 12288,
    "memory_bandwidth": 360,
    "tdp": 170,
    "release_year": 2021
  }
}
```

---

## Game Requirements Model

### Multi-Source Requirements

```typescript
interface GameRequirement {
  game_id: string;
  name: string;

  // Publisher specs (often misleading)
  publisher: {
    minimum: HardwareRequirement;
    recommended: HardwareRequirement;
    source_url: string;
    last_updated: Date;
  };

  // Community-verified specs (more accurate)
  community: {
    playable_30fps: HardwareRequirement;      // 1080p Low
    smooth_60fps: HardwareRequirement;        // 1080p High
    high_quality_60fps: HardwareRequirement;  // 1440p High
    ultra_4k_60fps?: HardwareRequirement;     // 4K Ultra (if data exists)

    verified_by: number;  // Number of user reports
    last_verified: Date;
  };

  // Steam Deck specific (if available)
  steam_deck?: {
    valve_rating: 'Verified' | 'Playable' | 'Unsupported' | 'Unknown';
    avg_fps: number;
    settings: string;
    tips: string[];
  };

  // Proton/Linux specific
  proton?: {
    rating: 'Platinum' | 'Gold' | 'Silver' | 'Bronze' | 'Borked';
    required_proton_version: string;
    known_issues: string[];
    performance_notes: string[];
  };

  // Game metadata
  metadata: {
    engine: string;          // "Unreal Engine 5", "Unity", etc.
    genre: string[];         // ["FPS", "Action"]
    release_year: number;
    typical_scene_type: 'static' | 'dynamic' | 'destructible';
    anti_cheat: string | null;  // Important for Proton
  };
}
```

### Hardware Requirement Structure

```typescript
interface HardwareRequirement {
  // Tier-based (broad matching)
  cpu_tier_min: number;
  gpu_tier_min: number;

  // Score-based (precise matching)
  cpu_score_min?: number;
  gpu_score_min?: number;

  // Absolute requirements
  ram_mb: number;
  vram_mb: number;
  storage_gb: number;
  storage_type: 'any' | 'ssd_required' | 'nvme_preferred';

  // Feature requirements
  required_features?: {
    directx?: '11' | '12' | '12_ultimate';
    vulkan?: string;       // "1.2.0"
    ray_tracing?: boolean;
    mesh_shaders?: boolean;
  };

  // Driver requirements
  driver_min_version?: {
    nvidia?: string;       // "536.23"
    amd?: string;          // "23.8.2"
    mesa?: string;         // "23.1.0" (Linux)
  };
}
```

---

## Rules Engine

### Core Logic

```typescript
interface VerdictEngine {
  evaluate(
    hardware: HardwareProfile,
    game: GameRequirement
  ): VerdictResponse;
}

interface VerdictResponse {
  // Primary verdict
  status: 'excellent' | 'good' | 'playable' | 'struggling' | 'unplayable';

  // Traffic light indicator (simpler than confidence scores)
  data_quality: 'verified' | 'expected' | 'uncertain';

  // Performance expectation (qualitative, not FPS)
  performance: {
    expectation: PerformanceExpectation;
    resolution: string;        // "1080p", "1440p", "4K"
    quality_preset: string;    // "Low", "Medium", "High", "Ultra"
    stable_framerate: boolean;
  };

  // Bottleneck analysis
  bottlenecks: Bottleneck[];

  // Actionable recommendations
  recommendations: Recommendation[];

  // Narrative (composable blocks)
  narrative: NarrativeBlock[];

  // Supporting data
  similar_hardware_reports?: number;  // "1,247 users with similar hardware"
  steam_deck_info?: SteamDeckInfo;
  proton_info?: ProtonInfo;
}
```

### Verdict Logic

```typescript
function evaluateVerdict(
  hardware: HardwareProfile,
  game: GameRequirement
): VerdictResponse {
  // Step 1: Check absolute blockers
  const blockers = checkBlockers(hardware, game);
  if (blockers.length > 0) {
    return {
      status: 'unplayable',
      data_quality: 'verified',
      bottlenecks: blockers,
      narrative: buildBlockerNarrative(blockers)
    };
  }

  // Step 2: Tier-based broad matching
  const tierMatch = compareTiers(hardware, game);

  // Step 3: Score-based fine-grained comparison
  const scoreMatch = compareScores(hardware, game);

  // Step 4: Feature matching
  const featureMatch = compareFeatures(hardware, game);

  // Step 5: Driver compatibility
  const driverCheck = checkDriverCompatibility(hardware, game);

  // Step 6: Combine results
  return synthesizeVerdict({
    tierMatch,
    scoreMatch,
    featureMatch,
    driverCheck,
    game
  });
}
```

### Bottleneck Detection

```typescript
enum BottleneckType {
  CPU_TIER = 'cpu_tier',
  GPU_TIER = 'gpu_tier',
  RAM_INSUFFICIENT = 'ram_insufficient',
  VRAM_INSUFFICIENT = 'vram_insufficient',
  STORAGE_SLOW = 'storage_slow',
  FEATURE_MISSING = 'feature_missing',
  DRIVER_OUTDATED = 'driver_outdated',
  DRIVER_BROKEN = 'driver_broken',
  PROTON_INCOMPATIBLE = 'proton_incompatible'
}

interface Bottleneck {
  type: BottleneckType;
  severity: 'critical' | 'major' | 'minor';

  // What's wrong
  issue: {
    component: string;      // "GPU", "CPU", "RAM", "Driver"
    current: string;        // "RTX 2060 (Tier 3)"
    required: string;       // "Tier 4+ (RTX 3060 equivalent)"
    gap: number;            // Quantified difference
  };

  // Impact
  impact: {
    performance_loss: string;  // "20-30% lower FPS"
    stability_risk: boolean;   // Will it crash?
    playability: string;       // "Playable but not smooth"
  };

  // What to do
  recommendation: string;
}
```

---

## Narrative System: Composable Blocks

### Simple Composition

```typescript
enum NarrativeBlockType {
  VERDICT = 'verdict',
  PERFORMANCE = 'performance',
  BOTTLENECK = 'bottleneck',
  FEATURE_NOTE = 'feature_note',
  TIP = 'tip',
  WARNING = 'warning',
  STEAM_DECK = 'steam_deck',
  PROTON = 'proton'
}

interface NarrativeBlock {
  type: NarrativeBlockType;
  template_id: string;
  variables: Record<string, any>;
  priority: number;  // For ordering
}

// Example verdict
const narrative: NarrativeBlock[] = [
  {
    type: 'verdict',
    template_id: 'meets_recommended',
    variables: { tier: 'Mainstream' },
    priority: 1
  },
  {
    type: 'performance',
    template_id: '60fps_high_1080p',
    variables: { resolution: '1080p', preset: 'High' },
    priority: 2
  },
  {
    type: 'feature_note',
    template_id: 'ray_tracing_disabled',
    variables: { feature: 'Ray Tracing' },
    priority: 3
  },
  {
    type: 'tip',
    template_id: 'enable_dlss',
    variables: { dlss_version: '2.0' },
    priority: 4
  }
];
```

### Template Database

```typescript
// templates.json
{
  "meets_recommended": {
    "en": "✅ Your hardware meets recommended specs for {{game_name}}.",
    "es": "✅ Tu hardware cumple con las especificaciones recomendadas para {{game_name}}."
  },

  "60fps_high_1080p": {
    "en": "Expect smooth 60 FPS at {{preset}} settings ({{resolution}}).",
    "es": "Espera 60 FPS fluidos en ajustes {{preset}} ({{resolution}})."
  },

  "ray_tracing_disabled": {
    "en": "⚠️ {{feature}} may need to be disabled for consistent performance.",
    "es": "⚠️ {{feature}} puede necesitar ser deshabilitado para rendimiento constante."
  },

  "enable_dlss": {
    "en": "💡 Tip: Enable DLSS {{dlss_version}} for better quality at higher FPS.",
    "es": "💡 Consejo: Activa DLSS {{dlss_version}} para mejor calidad con más FPS."
  }
}
```

**Frontend Composition:**

```typescript
function renderNarrative(blocks: NarrativeBlock[]): string {
  return blocks
    .sort((a, b) => a.priority - b.priority)
    .map(block => {
      const template = templates[block.template_id][currentLocale];
      return interpolate(template, block.variables);
    })
    .join(' ');
}

// Result:
// "✅ Your hardware meets recommended specs for Cyberpunk 2077.
//  Expect smooth 60 FPS at High settings (1080p).
//  ⚠️ Ray Tracing may need to be disabled for consistent performance.
//  💡 Tip: Enable DLSS 2.0 for better quality at higher FPS."
```

---

## Data Sources & Bootstrap Strategy

### Phase 0: Cold Start (Week 1-2)

**Objective:** Seed the database with existing public data.

#### 1. Hardware Database

**GPU Data: TechPowerUp**
```typescript
// Scrape https://www.techpowerup.com/gpu-specs/
interface TechPowerUpGPU {
  name: string;
  chip: string;
  release_date: string;
  memory: number;
  memory_type: string;
  memory_bus: number;
  core_clock: number;
  boost_clock: number;
  tdp: number;
  // ... full specs
}

// Transform to our schema
function transformGPU(tpu: TechPowerUpGPU): HardwareEntry {
  return {
    model: tpu.name,
    tier: calculateTier(tpu),
    score: calculateScore(tpu),
    features: detectFeatures(tpu),
    specs: extractSpecs(tpu)
  };
}
```

**CPU Data: UserBenchmark / PassMark**
```typescript
// Scrape CPU benchmark scores
interface BenchmarkScore {
  model: string;
  single_thread: number;
  multi_thread: number;
  gaming_score: number;
}

// Normalize to 0-10000 scale
function calculateCPUScore(bench: BenchmarkScore): number {
  // Gaming score is most relevant for our use case
  return normalizeScore(bench.gaming_score, 0, 10000);
}
```

#### 2. Game Requirements: PCGamingWiki

```bash
# Scrape PCGamingWiki for system requirements
curl -s "https://www.pcgamingwiki.com/api/appdetails.php?appid=${STEAM_ID}" | jq
```

**Example Response:**
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
      "recommended": {
        "processor": "Intel Core i7-4790 or AMD Ryzen 3 3200G",
        "memory": "12 GB RAM",
        "graphics": "NVIDIA GeForce GTX 1060 or AMD Radeon RX 590"
      }
    }
  }
}
```

**Parse to our schema:**
```typescript
function parsePCGamingWiki(data: any): GameRequirement {
  return {
    publisher: {
      minimum: parseHardwareRequirement(data.system_requirements.windows.minimum),
      recommended: parseHardwareRequirement(data.system_requirements.windows.recommended),
      source_url: data.url,
      last_updated: new Date()
    },
    // Community data comes from telemetry later
    community: null
  };
}
```

#### 3. ProtonDB Integration

```typescript
// ProtonDB API (unofficial)
const PROTONDB_API = 'https://www.protondb.com/api/v1/reports/summaries/latest.json';

interface ProtonDBReport {
  appId: number;
  title: string;
  tiers: {
    platinum: number;  // Count of platinum reports
    gold: number;
    silver: number;
    bronze: number;
    borked: number;
  };
  total: number;
  bestReportedTier: string;
}

// Enhance game requirements with Proton data
async function enrichWithProtonDB(gameId: number): Promise<ProtonInfo> {
  const reports = await fetchProtonReports(gameId);

  return {
    rating: reports.bestReportedTier,
    required_proton_version: extractProtonVersion(reports),
    known_issues: extractIssues(reports),
    performance_notes: extractPerformanceNotes(reports)
  };
}
```

#### 4. Steam Deck Database

**Valve's Official API:**
```typescript
// Steam API for Deck verification status
const STEAM_API = 'https://store.steampowered.com/api/appdetails';

interface SteamDeckCompatibility {
  deck_compatibility: {
    category: number;  // 0=Unknown, 1=Unsupported, 2=Playable, 3=Verified
    tests: {
      controller_support: boolean;
      display_support: boolean;
      seamless_play: boolean;
      full_controller: boolean;
    };
  };
}
```

**Community Performance Data:**
```typescript
// Scrape from CheckMyDeck (https://checkmydeck.ofdgn.com/)
interface CheckMyDeckData {
  appId: number;
  name: string;
  reported_fps: {
    low: number;
    avg: number;
    high: number;
  };
  recommended_settings: string;
  user_reports: number;
}
```

---

## Database Schema

### Core Tables

```sql
-- Hardware catalog
CREATE TABLE gpus (
  id INTEGER PRIMARY KEY,
  model TEXT UNIQUE NOT NULL,
  vendor TEXT NOT NULL,  -- 'Nvidia', 'AMD', 'Intel'
  tier INTEGER NOT NULL,
  score INTEGER NOT NULL,

  -- Specs
  vram_mb INTEGER,
  memory_bandwidth INTEGER,  -- GB/s
  tdp INTEGER,
  release_year INTEGER,

  -- Features
  ray_tracing BOOLEAN DEFAULT FALSE,
  dlss TEXT,  -- NULL, '2.0', '3.0'
  fsr TEXT,   -- NULL, '1.0', '2.0', '3.0'
  mesh_shaders BOOLEAN DEFAULT FALSE,
  vrs BOOLEAN DEFAULT FALSE,

  -- Identifiers
  pci_id TEXT,
  device_id TEXT,

  -- Metadata
  data_source TEXT,  -- 'techpowerup', 'manual', 'community'
  verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_gpus_tier ON gpus(tier);
CREATE INDEX idx_gpus_score ON gpus(score);
CREATE INDEX idx_gpus_model ON gpus(model);

-- CPUs
CREATE TABLE cpus (
  id INTEGER PRIMARY KEY,
  model TEXT UNIQUE NOT NULL,
  vendor TEXT NOT NULL,
  tier INTEGER NOT NULL,
  score INTEGER NOT NULL,

  cores INTEGER,
  threads INTEGER,
  base_clock REAL,
  boost_clock REAL,
  release_year INTEGER,

  pci_id TEXT,
  data_source TEXT,
  verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Games
CREATE TABLE games (
  id INTEGER PRIMARY KEY,
  steam_id INTEGER UNIQUE,
  name TEXT NOT NULL,
  engine TEXT,
  genre TEXT,  -- JSON array
  release_year INTEGER,
  anti_cheat TEXT,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_games_steam_id ON games(steam_id);
CREATE INDEX idx_games_name ON games(name);

-- Game requirements
CREATE TABLE game_requirements (
  id INTEGER PRIMARY KEY,
  game_id INTEGER NOT NULL,
  source TEXT NOT NULL,  -- 'publisher', 'community', 'verified'
  spec_level TEXT NOT NULL,  -- 'minimum', 'recommended', '60fps_1080p', etc.

  cpu_tier_min INTEGER,
  gpu_tier_min INTEGER,
  cpu_score_min INTEGER,
  gpu_score_min INTEGER,

  ram_mb INTEGER,
  vram_mb INTEGER,
  storage_gb INTEGER,
  storage_type TEXT,

  directx TEXT,
  vulkan TEXT,
  ray_tracing BOOLEAN,

  verified_by INTEGER DEFAULT 0,  -- Number of user reports
  last_verified TIMESTAMP,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (game_id) REFERENCES games(id)
);

CREATE INDEX idx_game_reqs_game ON game_requirements(game_id);

-- Proton compatibility
CREATE TABLE proton_compatibility (
  id INTEGER PRIMARY KEY,
  game_id INTEGER NOT NULL,
  protondb_rating TEXT,  -- 'Platinum', 'Gold', etc.
  proton_version TEXT,
  known_issues TEXT,  -- JSON array
  performance_notes TEXT,  -- JSON array
  total_reports INTEGER,

  last_synced TIMESTAMP,

  FOREIGN KEY (game_id) REFERENCES games(id)
);

-- Steam Deck data
CREATE TABLE steam_deck_compatibility (
  id INTEGER PRIMARY KEY,
  game_id INTEGER NOT NULL,
  valve_rating TEXT,  -- 'Verified', 'Playable', 'Unsupported'
  avg_fps INTEGER,
  settings TEXT,
  tips TEXT,  -- JSON array

  last_synced TIMESTAMP,

  FOREIGN KEY (game_id) REFERENCES games(id)
);

-- Driver issues database
CREATE TABLE driver_issues (
  id INTEGER PRIMARY KEY,
  vendor TEXT NOT NULL,  -- 'nvidia', 'amd', 'mesa'
  driver_version TEXT NOT NULL,
  game_id INTEGER,
  issue_type TEXT,  -- 'crash', 'performance', 'visual'
  description TEXT,
  workaround TEXT,
  fixed_in_version TEXT,
  reported_count INTEGER DEFAULT 1,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (game_id) REFERENCES games(id)
);

CREATE INDEX idx_driver_issues_vendor ON driver_issues(vendor, driver_version);

-- Telemetry (opt-in user reports)
CREATE TABLE user_reports (
  id INTEGER PRIMARY KEY,
  report_uuid TEXT UNIQUE NOT NULL,  -- Anonymous identifier

  game_id INTEGER NOT NULL,

  -- Hardware snapshot (anonymized)
  cpu_tier INTEGER,
  gpu_tier INTEGER,
  cpu_score INTEGER,
  gpu_score INTEGER,
  ram_mb INTEGER,
  vram_mb INTEGER,

  driver_version TEXT,
  os_platform TEXT,
  proton_version TEXT,

  -- Performance data
  resolution TEXT,  -- '1920x1080'
  quality_preset TEXT,
  avg_fps INTEGER,
  min_fps INTEGER,
  stable BOOLEAN,

  -- User verdict
  user_rating TEXT,  -- 'great', 'good', 'playable', 'poor'

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (game_id) REFERENCES games(id)
);

CREATE INDEX idx_reports_game ON user_reports(game_id);
CREATE INDEX idx_reports_gpu ON user_reports(gpu_tier, gpu_score);
```

---

## Implementation Phases

### Phase 1: Foundation (Week 1-2)

**Deliverables:**
- [ ] Database schema implementation
- [ ] Scraper for TechPowerUp GPU database (2000+ GPUs)
- [ ] Scraper for CPU benchmark scores (1000+ CPUs)
- [ ] Tier calculation algorithm
- [ ] Score normalization algorithm

**Scripts:**
```bash
# Bootstrap hardware database
npm run scrape:gpus      # TechPowerUp → gpus table
npm run scrape:cpus      # UserBenchmark → cpus table
npm run calculate:tiers  # Assign tiers based on scores
npm run verify:hardware  # Manual review top 100 popular models
```

### Phase 2: MVP Rules Engine (Week 3-4)

**Deliverables:**
- [ ] Rules engine implementation (`src-tauri/src/intelligence/`)
- [ ] Verdict evaluation logic
- [ ] Bottleneck detection
- [ ] Narrative composition system
- [ ] Hardcoded top 100 games (manual entry)

**Structure:**
```
src-tauri/src/intelligence/
├── mod.rs              # Public API
├── rules.rs            # Verdict logic
├── bottleneck.rs       # Bottleneck detection
├── narrative.rs        # Message composition
└── data.rs             # Embedded top 100 games (temporary)
```

**Example Usage:**
```rust
use crate::intelligence::VerdictEngine;

let engine = VerdictEngine::new();
let verdict = engine.evaluate(&hardware_profile, &game_requirements)?;

println!("{}", verdict.render_narrative());
// "✅ Your hardware meets recommended specs. Expect smooth 60 FPS..."
```

### Phase 3: Data Integration (Week 5-6)

**Deliverables:**
- [ ] PCGamingWiki scraper (1000+ games)
- [ ] ProtonDB integration
- [ ] Steam Deck compatibility sync
- [ ] Database migration from hardcoded JSON
- [ ] Telemetry opt-in UI

**Scripts:**
```bash
npm run scrape:games      # PCGamingWiki → games + game_requirements
npm run sync:protondb     # ProtonDB API → proton_compatibility
npm run sync:steamdeck    # Steam API → steam_deck_compatibility
```

### Phase 4: Validation (Week 7-8)

**Deliverables:**
- [ ] Telemetry collection backend
- [ ] User report submission UI
- [ ] Admin dashboard for reviewing reports
- [ ] Tier adjustment based on telemetry
- [ ] Game requirement verification

**Telemetry Flow:**
```typescript
// User plays game, submits report
interface TelemetryReport {
  game: string;
  hardware: HardwareProfile;
  settings: { resolution: string; preset: string };
  performance: { avg_fps: number; stable: boolean };
  verdict: 'great' | 'good' | 'playable' | 'poor';
}

// Backend stores anonymized report
await submitReport(report);  // → user_reports table

// Weekly job: Adjust tiers based on aggregated reports
npm run jobs:calibrate-tiers
```

### Phase 5: Scale (Week 9-12)

**Deliverables:**
- [ ] Expand to 5000+ games
- [ ] Community contribution system
- [ ] Driver issue database
- [ ] FPS prediction (experimental)
- [ ] Hardware upgrade recommendations

---

## Steam Deck Optimization

### Killer Feature: Deck-Specific Verdicts

```typescript
interface SteamDeckVerdict extends VerdictResponse {
  // Valve's official verdict
  valve_rating: 'Verified' | 'Playable' | 'Unsupported';

  // Performance expectations
  deck_performance: {
    avg_fps: number;
    settings: string;
    battery_life: string;  // "2-3 hours"
  };

  // Optimization tips
  deck_tips: [
    "Lock to 40Hz for stable frame pacing",
    "Set TDP to 11W to extend battery life",
    "Enable FSR 2.0 for sharper image quality",
    "Use Medium preset for best balance"
  ];

  // Community reports
  community: {
    reports: number;
    avg_rating: number;  // 1-5 stars
    common_issues: string[];
  };
}
```

**UI Mock:**
```
┌─────────────────────────────────────────┐
│ 🎮 Baldur's Gate 3                      │
│                                         │
│ Steam Deck: ✅ Verified                 │
│ Performance: ~40 FPS (Medium, 800p)     │
│ Battery: 2.5-3 hours                    │
│                                         │
│ 💡 Optimization Tips:                   │
│  • Lock to 40Hz in quick settings       │
│  • Use FSR 2.0 (Quality mode)           │
│  • Disable dynamic shadows for +5 FPS   │
│                                         │
│ 👥 1,247 Deck users rate this 4.6/5    │
└─────────────────────────────────────────┘
```

---

## Privacy & Telemetry

### Opt-In Flow

```typescript
interface TelemetrySettings {
  enabled: boolean;

  // Granular controls
  collect_hardware: boolean;      // CPU/GPU/RAM
  collect_performance: boolean;   // FPS data
  collect_settings: boolean;      // Graphics presets
  collect_crashes: boolean;       // Error reports

  // Retention
  retention_days: number;         // Default: 90 days

  // Transparency
  last_upload: Date;
  total_reports_sent: number;
  data_used_to_improve: string[]; // "Helped verify 23 games"
}
```

**Privacy Principles:**
1. ✅ Opt-in only (default: OFF)
2. ✅ Fully anonymous (no user IDs, hashed hardware IDs)
3. ✅ Local-first (works without telemetry)
4. ✅ Transparent (show exactly what's sent)
5. ✅ Deletable (request data deletion)
6. ✅ GDPR/CCPA compliant

**Anonymization:**
```typescript
function anonymizeReport(report: TelemetryReport): AnonymousReport {
  return {
    // Hash hardware info (can't reverse)
    hardware_hash: sha256(report.hardware_profile),

    // Generalize location (country only, no IP)
    region: getCountryFromLocale(),

    // Round timestamps (hour precision only)
    timestamp: roundToHour(new Date()),

    // Performance data (unchanged)
    performance: report.performance,

    // No user identifiers
    // No system serial numbers
    // No personally identifiable information
  };
}
```

---

## Success Metrics

### MVP Success (3 Months)

- [ ] 100 games with verified requirements
- [ ] 1000+ user reports collected
- [ ] 95%+ verdict accuracy (based on user feedback)
- [ ] <500ms verdict generation time
- [ ] Steam Deck integration working

### Scale Success (6 Months)

- [ ] 1000+ games covered
- [ ] 10,000+ user reports
- [ ] #1 result for "Steam Deck game checker"
- [ ] 50%+ telemetry opt-in rate
- [ ] Community contribution system active

### Market Leader (12 Months)

- [ ] 5000+ games covered
- [ ] 100,000+ user reports
- [ ] ProtonDB partnership
- [ ] Featured on r/SteamDeck, r/linux_gaming
- [ ] Better Linux coverage than CYRI

---

## Anti-Patterns to Avoid

### ❌ Don't: Premature Optimization

```typescript
// Bad: Complex ML model before having data
const fps = await mlModel.predict(hardware, game);

// Good: Simple rules until you have ground truth
const verdict = hardware.tier >= game.minTier ? 'pass' : 'fail';
```

### ❌ Don't: Over-Promise Performance

```typescript
// Bad: Specific FPS prediction
"You will get 67 FPS in Cyberpunk 2077"

// Good: Range with caveats
"Expect 60+ FPS at High settings (1080p). Performance may vary in crowded areas."
```

### ❌ Don't: Build Everything Before Shipping

```typescript
// Bad: Wait for perfect database
while (gamesInDatabase < 10000) {
  scrapeMoreGames();
}
launchApp();

// Good: Ship with top 100, iterate
shipWithTop100Games();
collectFeedback();
expandGradually();
```

### ❌ Don't: Ignore Edge Cases

```typescript
// Bad: Assume discrete GPU
const gpu = hardware.gpu;

// Good: Handle integrated, APU, eGPU
const gpu = hardware.discrete_gpu || hardware.integrated_gpu;
if (gpu.is_egpu) {
  narrative.add("⚠️ eGPU detected - performance may vary");
}
```

---

## Testing Strategy

### Unit Tests

```rust
#[test]
fn test_tier_comparison() {
    let hardware = mock_hardware_tier(4);
    let game = mock_game_requirement(tier_min: 3);

    let verdict = evaluate_verdict(&hardware, &game);

    assert_eq!(verdict.status, VerdictStatus::Good);
}

#[test]
fn test_bottleneck_detection() {
    let hardware = HardwareProfile {
        cpu_tier: 6,
        gpu_tier: 2,  // Bottleneck!
        ram: 32000,
    };

    let game = GameRequirement {
        gpu_tier_min: 5,
        ..Default::default()
    };

    let bottlenecks = detect_bottlenecks(&hardware, &game);

    assert_eq!(bottlenecks.len(), 1);
    assert_eq!(bottlenecks[0].component, "GPU");
}
```

### Integration Tests

```rust
#[tokio::test]
async fn test_full_verdict_pipeline() {
    let db = setup_test_db().await;
    seed_test_data(&db).await;

    let hardware = scan_hardware().unwrap();
    let game = db.get_game("Baldur's Gate 3").await.unwrap();

    let engine = VerdictEngine::new(db);
    let verdict = engine.evaluate(&hardware, &game).await.unwrap();

    assert!(verdict.narrative.len() > 0);
    assert!(verdict.status != VerdictStatus::Unknown);
}
```

### Manual Test Cases

```
Test Case 1: High-End PC, AAA Game
Hardware: RTX 4090, i9-13900K, 32GB RAM
Game: Cyberpunk 2077
Expected: Excellent, 4K Ultra 60+ FPS

Test Case 2: Low-End PC, Indie Game
Hardware: GTX 1050, i3-10100, 8GB RAM
Game: Hollow Knight
Expected: Excellent, 1080p 60 FPS

Test Case 3: Steam Deck
Hardware: Steam Deck APU
Game: Elden Ring
Expected: Playable, 800p 40 FPS

Test Case 4: Bottleneck Scenario
Hardware: RTX 4090, i3-10100, 8GB RAM
Game: Baldur's Gate 3
Expected: Good but CPU bottleneck warning

Test Case 5: Missing Feature
Hardware: GTX 1080 (no ray tracing)
Game: Cyberpunk 2077 (RT required for Ultra)
Expected: Good, ray tracing disabled
```

---

## Next Actions

### Week 1-2: Bootstrap
```bash
cd SpecPilot
npm run intelligence:init         # Create database schema
npm run scrape:hardware           # TechPowerUp + benchmarks
npm run verify:tiers              # Manual tier review
```

### Week 3-4: MVP
```bash
npm run intelligence:engine       # Implement rules engine
npm run games:seed-top-100        # Manual entry of popular games
npm run test:verdicts             # Test verdict accuracy
```

### Week 5+: Scale
```bash
npm run scrape:games              # PCGamingWiki integration
npm run sync:protondb             # ProtonDB sync
npm run telemetry:enable          # Launch telemetry
```

---

**This is your roadmap. Start simple, ship fast, iterate based on real user data.** 🚀
