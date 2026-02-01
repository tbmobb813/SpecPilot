# SpecPilot: Addressing Market Gaps

*Actionable features and improvements based on market research findings*

---

## Overview

This document maps **consumer pain points** (from MARKET_RESEARCH.md) to **specific features** SpecPilot should implement. Each recommendation includes implementation priority, effort estimate, and technical approach.

---

## Gap 1: Steam Deck Verified Labels Are Unreliable

### The Problem

- Valve's "Verified" games frequently don't work (Apex Legends, God of War, DOOM 2016)
- Ratings go stale when devs push breaking updates
- Community sentiment: "If it requires ANY workaround, it shouldn't be verified"

### Proposed Solutions for Gap 1

#### 1.1 Community-Validated Deck Status (HIGH PRIORITY)

**Current State:** Steam Deck status displayed but not used in verdicts
**Effort:** 2-3 days

**Implementation:**

```
- Add `community_deck_reports` table tracking user-submitted Deck experiences
- Weight community reports against official Valve status
- Display "Verified but community reports issues" warnings
- Show recency of last community report vs Valve verification date
```

**Files to modify:**

- `src-tauri/src/database/schema.sql` - Add community reports table
- `src-tauri/src/intelligence/rules.rs` - Add Deck-specific verdict modifiers
- `src/components/GameLibrary.tsx` - Show community vs official conflict

#### 1.2 Staleness Detection (MEDIUM PRIORITY)

**Effort:** 1 day

**Implementation:**

```
- Track `valve_verified_date` in steamdeck_compatibility table
- Track `last_game_update` from Steam API
- If game updated after verification: show warning "Game updated since Deck verification"
- Prioritize community reports for recently-updated games
```

#### 1.3 "Known Issues" Database (MEDIUM PRIORITY)

**Effort:** 3-4 days

**Implementation:**

```
- Create `known_issues` table: game_id, issue_type, description, workaround, reported_date
- Issue types: input_not_working, crashes_on_suspend, performance_issues, audio_problems
- Scrape Steam Deck discussions for common complaints
- Display issues prominently in verdict narrative
```

---

## Gap 2: No Linux Support in Major Compatibility Tools

### The Problem

- Can You Run It, PCGameBenchmark, etc. are Windows-only
- Linux gamers have no "Can You Run It" equivalent
- Hardware detection on Linux requires different approaches

### Proposed Solutions for Gap 2

#### 2.1 Fix AMD GPU VRAM Detection (CRITICAL)

**Current State:** Returns 0 MB on Linux
**Effort:** 4-8 hours

**Implementation:**

```rust
// In src-tauri/src/hardware/platform/linux.rs
// Add sysfs parsing for AMD GPUs:
// /sys/class/drm/card*/device/mem_info_vram_total
// Fallback: parse from rocm-smi output
```

#### 2.2 Expand Linux Hardware Detection (HIGH PRIORITY)

**Effort:** 2-3 days

**Add detection for:**

- Mesa driver version (critical for AMD/Intel)
- Wine/Proton version installed
- DXVK version
- VKD3D-Proton version
- Kernel version (some games need specific kernel features)
- Steam Runtime version

**Files to modify:**

- `src-tauri/src/hardware/platform/linux.rs`
- `src-tauri/src/hardware/common.rs` - Add new fields to HardwareProfile

#### 2.3 Linux-Specific Bottleneck Detection (MEDIUM PRIORITY)

**Effort:** 2 days

**New bottleneck types:**

```rust
enum LinuxBottleneck {
    MesaDriverOutdated { current: String, recommended: String },
    ProtonVersionMissing { required: String },
    DxvkMissing,
    Vkd3dMissing,
    KernelTooOld { current: String, minimum: String },
    WaylandIncompatible, // Some games don't work on Wayland
}
```

---

## Gap 3: ProtonDB Has No Hardware Matching

### The Problem

- ProtonDB tells you IF a game works on Linux
- But not if YOUR HARDWARE can run it
- Users must manually cross-reference ProtonDB + requirements

### Proposed Solutions for Gap 3

#### 3.1 Integrate ProtonDB into Verdict Engine (CRITICAL)

**Current State:** Scraper written, data not used in verdicts
**Effort:** 1-2 days

**Implementation:**

```rust
// In rules.rs, add ProtonDB factor:
fn evaluate_proton_compatibility(&self, game_id: u64) -> ProtonFactor {
    let rating = db.query_protondb_rating(game_id);
    match rating {
        "Platinum" | "Gold" => ProtonFactor::Positive,
        "Silver" => ProtonFactor::Neutral,
        "Bronze" => ProtonFactor::Warning("May require tweaks"),
        "Borked" => ProtonFactor::Blocker("Does not work on Linux"),
        _ => ProtonFactor::Unknown,
    }
}
```

**Verdict adjustment:**

- Platinum/Gold: No penalty
- Silver: Add warning, reduce confidence
- Bronze: Major warning, suggest checking ProtonDB for tweaks
- Borked: Override to "Unsupported" regardless of hardware

#### 3.2 Show Required Proton Tweaks (HIGH PRIORITY)

**Effort:** 2-3 days

**Implementation:**

- Scrape ProtonDB for common launch options per game
- Store in `proton_tweaks` table: game_id, tweak_type, value, success_rate
- Display in verdict: "This game works with: `PROTON_USE_WINED3D=1`"

#### 3.3 Hardware-Specific ProtonDB Reports (MEDIUM PRIORITY)

**Effort:** 3-4 days

**Implementation:**

- Parse ProtonDB reports for GPU/CPU mentions
- Build correlation: "Users with RTX 30xx report Gold, users with AMD report Silver"
- Weight ProtonDB rating by hardware similarity to user's system

---

## Gap 4: Users Must Check 4+ Fragmented Sources

### The Problem

- Current workflow: ProtonDB → Deck Verified → PCGamingWiki → Anti-cheat DB → Manual comparison
- No single source of truth
- Time-consuming and error-prone

### Proposed Solutions for Gap 4

#### 4.1 Unified Verdict Dashboard (HIGH PRIORITY)

**Current State:** Partial - shows some data but not unified
**Effort:** 3-4 days

**New verdict display:**

```
┌─────────────────────────────────────────────────────────┐
│ Cyberpunk 2077                                          │
├─────────────────────────────────────────────────────────┤
│ VERDICT: Playable (Medium Settings)                     │
│ Confidence: 85%                                         │
├─────────────────────────────────────────────────────────┤
│ ✅ Hardware: Meets recommended (RTX 3060 > GTX 1060)    │
│ ✅ ProtonDB: Gold (1,847 reports)                       │
│ ⚠️  Steam Deck: Playable (requires FSR)                 │
│ ✅ Anti-Cheat: None                                     │
│ ⚠️  Known Issues: Ray tracing causes crashes on AMD     │
├─────────────────────────────────────────────────────────┤
│ Community: 73% report stable 60fps at 1080p Medium      │
└─────────────────────────────────────────────────────────┘
```

#### 4.2 Source Attribution (MEDIUM PRIORITY)

**Effort:** 1 day

Show where each piece of info comes from:

- "Requirements: PCGamingWiki (updated 2024-12-15)"
- "Proton status: ProtonDB (1,847 reports)"
- "Deck status: Valve (verified 2024-06-01)"
- "Anti-cheat: AreWeAntiCheatYet"

#### 4.3 Confidence Scoring (HIGH PRIORITY)

**Effort:** 2 days

**Factors affecting confidence:**

```rust
struct ConfidenceFactors {
    requirements_source_quality: f32,  // Steam official > PCGamingWiki > estimated
    protondb_report_count: f32,        // More reports = higher confidence
    deck_verification_recency: f32,    // Recent = higher confidence
    community_report_count: f32,       // More SpecPilot reports = higher
    hardware_match_precision: f32,     // Exact match > tier match > estimated
}
```

---

## Gap 5: Anti-Cheat Is a Hard Blocker

### The Problem

- Destiny 2, Fortnite, recent CoD titles don't work on Linux
- Users waste time checking requirements for fundamentally incompatible games
- No clear upfront warning

### Proposed Solutions for Gap 5

#### 5.1 Anti-Cheat Database Integration (CRITICAL)

**Current State:** Not implemented
**Effort:** 2-3 days

**Implementation:**

```sql
CREATE TABLE anti_cheat_status (
    game_id INTEGER PRIMARY KEY,
    anti_cheat_type TEXT,           -- EAC, BattlEye, Vanguard, etc.
    linux_status TEXT,              -- supported, denied, broken, unknown
    last_updated TEXT,
    source TEXT                     -- areweanticheatyet, manual, etc.
);
```

**Scrape from:** areweanticheatyet.com (they have an API)

**Verdict integration:**

```rust
if anti_cheat_status == "denied" || anti_cheat_status == "broken" {
    return Verdict::Unsupported {
        reason: "Anti-cheat prevents Linux play",
        anti_cheat: game.anti_cheat_type,
    };
}
```

#### 5.2 Prominent Anti-Cheat Warnings (HIGH PRIORITY)

**Effort:** 1 day

**UI changes:**

- Red banner at top of game card: "🚫 BLOCKED: Easy Anti-Cheat (Linux unsupported)"
- Filter option: "Hide anti-cheat blocked games"
- Explain WHY in narrative: "The developer has not enabled Linux support for Easy Anti-Cheat"

#### 5.3 Anti-Cheat Status Tracking (MEDIUM PRIORITY)

**Effort:** 1-2 days

- Track historical anti-cheat status changes
- Notify users when a game's anti-cheat becomes supported
- "Apex Legends: EAC support added 2024-03-15"

---

## Gap 6: No Browser Extension for Steam Store

### The Problem

- Users browse Steam store, see a game, want to know "can I run this?"
- Must leave Steam, open SpecPilot, search for game
- Friction reduces usage

### Proposed Solutions for Gap 6

#### 6.1 Browser Extension MVP (HIGH PRIORITY - Post-MVP)

**Effort:** 1-2 weeks

**Features:**

- Inject verdict badge on Steam store pages
- Quick popup with hardware match summary
- Link to full SpecPilot analysis
- Works on: store.steampowered.com, steamdb.info

**Tech stack:**

- Manifest V3 (Chrome/Firefox compatible)
- React for popup UI
- API calls to SpecPilot backend or local app

**Challenges:**

- Needs backend API or local app communication
- Rate limiting for API calls
- Privacy considerations

#### 6.2 Steam Deck Plugin (MEDIUM PRIORITY - Post-MVP)

**Effort:** 2-3 weeks

**Implementation:**

- Decky Loader plugin
- Shows SpecPilot verdict in Steam UI on Deck
- Integrates with existing ProtonDB Badges plugin pattern

---

## Gap 7: No Integration with Existing Linux Gaming Tools

### The Problem

- Lutris, Heroic Games Launcher are popular
- Users want compatibility info BEFORE downloading
- No integration exists

### Proposed Solutions for Gap 7

#### 7.1 CLI Tool for Integrations (HIGH PRIORITY)

**Effort:** 3-4 days

**Implementation:**

```bash
# Check single game
specpilot check --steam-id 1091500

# Output JSON for integration
specpilot check --steam-id 1091500 --format json

# Batch check
specpilot check --file game-ids.txt --format json
```

**Benefits:**

- Lutris/Heroic can call CLI
- CI/CD integration possible
- Scriptable for power users

#### 7.2 D-Bus API (MEDIUM PRIORITY)

**Effort:** 1 week

**Implementation:**

- Expose SpecPilot as D-Bus service on Linux
- Other apps can query without launching full UI
- Standard Linux desktop integration pattern

#### 7.3 Lutris Integration Guide (LOW PRIORITY)

**Effort:** 1-2 days

- Document how to integrate SpecPilot checks into Lutris
- Provide script templates
- Reach out to Lutris maintainers

---

## Gap 8: Existing Tools Have Poor Hardware Detection

### The Problem

- Can You Run It often misreads specs (Nvidia Optimus, integrated graphics)
- Browser plugins are distrusted
- Detection failures erode user trust

### Proposed Solutions for Gap 8

#### 8.1 Hardware Detection Confidence Score (HIGH PRIORITY)

**Effort:** 1-2 days

**Implementation:**

```rust
struct DetectionConfidence {
    cpu: ConfidenceLevel,      // High/Medium/Low/Failed
    gpu: ConfidenceLevel,
    ram: ConfidenceLevel,
    detection_method: String,  // "nvidia-smi", "lspci", "estimated"
}
```

Show users: "GPU detected via nvidia-smi (high confidence)" vs "GPU estimated from lspci (medium confidence)"

#### 8.2 Manual Override UI (MEDIUM PRIORITY)

**Effort:** 2-3 days

**Implementation:**

- Allow users to correct detected hardware
- "Not your GPU? Select manually: [dropdown]"
- Store overrides in local config
- Sync overrides with telemetry for improving detection

#### 8.3 Multi-GPU Handling (MEDIUM PRIORITY)

**Effort:** 2-3 days

**Current gap:** Laptops with Nvidia Optimus show integrated GPU

**Implementation:**

- Detect all GPUs, not just primary
- Show: "Detected: Intel UHD 630 (integrated) + RTX 3060 (discrete)"
- Use discrete GPU for verdicts by default
- Let user select which GPU to use

---

## New Feature: Performance Expectations

### The Opportunity for Improvement

- Users don't just want "playable/not playable"
- They want: "What settings? What FPS?"
- Competitors don't provide this

### SpecPilot Solutions

#### 9.1 FPS Estimation (HIGH PRIORITY - Phase 2)

**Effort:** 2-3 weeks

**Data sources:**

- YouTube benchmarks (scrape FPS from video descriptions/comments)
- User telemetry (opt-in FPS reports)
- Hardware review sites

**Implementation:**

```rust
struct PerformanceEstimate {
    resolution: String,         // "1080p", "1440p", "4K"
    settings: String,          // "Low", "Medium", "High", "Ultra"
    estimated_fps: Range<u32>, // 45-60
    confidence: f32,
    based_on: String,          // "127 user reports", "YouTube benchmark"
}
```

#### 9.2 Settings Recommendations (MEDIUM PRIORITY)

**Effort:** 1-2 weeks

**Implementation:**

- Based on hardware tier, suggest optimal settings
- "Your RTX 3060 should run at High settings, 1080p, ~60fps"
- "Consider disabling ray tracing for stable 60fps"

#### 9.3 Performance Comparison (LOW PRIORITY)

**Effort:** 1 week

- Show how user's hardware compares to average reporters
- "Your GPU is faster than 65% of players who run this game"
- Encourages telemetry participation

---

## New Feature: Purchase Decision Support

### The Opportunity

- Users often check compatibility BEFORE buying
- Help them make informed purchase decisions
- Potential for affiliate revenue (ethical disclosure required)

### SpecPilot Solutions

#### 10.1 Wishlist Integration (MEDIUM PRIORITY)

**Effort:** 3-4 days

**Implementation:**

- Import Steam wishlist via Steam Web API
- Show compatibility for all wishlist items
- "3 games on your wishlist won't run on your hardware"
- "2 games have anti-cheat issues on Linux"

#### 10.2 Sale Alerts with Compatibility (LOW PRIORITY - Post-MVP)

**Effort:** 1-2 weeks

**Implementation:**

- Track Steam sales
- Notify: "Cyberpunk 2077 is 50% off and runs great on your hardware!"
- Only alert for compatible games

#### 10.3 Hardware Upgrade Advisor (LOW PRIORITY - Post-MVP)

**Effort:** 2-3 weeks

**Implementation:**

- "These 5 games in your library would benefit from a GPU upgrade"
- "Upgrading to RTX 4070 would make 12 more games playable at Ultra"
- Links to hardware (with clear affiliate disclosure if monetized)

---

## Implementation Priority Matrix

### Critical (Block MVP - Do First)

| Feature | Effort | Impact |
|---------|--------|--------|
| Fix AMD GPU VRAM detection | 4-8 hrs | Enables accurate verdicts for AMD users |
| Integrate ProtonDB into verdicts | 1-2 days | Core differentiator |
| Anti-cheat database integration | 2-3 days | Prevents wasted user time |
| Populate game requirements data | 3-4 days | Without data, nothing works |

### High Priority (MVP Quality)

| Feature | Effort | Impact |
|---------|--------|--------|
| Unified verdict dashboard | 3-4 days | Key UX differentiator |
| Confidence scoring | 2 days | Builds user trust |
| Linux-specific bottleneck detection | 2 days | Addresses core audience needs |
| CLI tool for integrations | 3-4 days | Enables ecosystem growth |
| Hardware detection confidence display | 1-2 days | Addresses trust issues |

### Medium Priority (Post-MVP)

| Feature | Effort | Impact |
| --------- | -------- | -------- |
| Community-validated Deck status | 2-3 days | Addresses Deck Verified frustration |
| Known issues database | 3-4 days | Proactive problem disclosure |
| Browser extension | 1-2 weeks | Reduces friction |
| Multi-GPU handling | 2-3 days | Laptop user support |
| Wishlist integration | 3-4 days | Purchase decision support |

### Low Priority (Future)

| Feature | Effort | Impact |
| --------- | -------- | -------- |
| Steam Deck plugin | 2-3 weeks | Native Deck integration |
| D-Bus API | 1 week | Linux desktop integration |
| FPS estimation | 2-3 weeks | Premium feature |
| Hardware upgrade advisor | 2-3 weeks | Potential monetization |

---

## Quick Wins (< 1 Day Each)

1. **Show data source attribution** - Where does each piece of info come from?
2. **Add "Hide anti-cheat blocked" filter** - Simple but high-value for Linux users
3. **Display game update date vs verification date** - Staleness indicator
4. **Add ProtonDB link to each game card** - Easy escape hatch for more info
5. **Show "X users report this works"** - Social proof from telemetry
6. **Add copy-to-clipboard for Proton launch options** - Actionable help

---

## Success Metrics for Gap Coverage

| Gap | Metric | Target |
|-----|--------|--------|
| Deck Verified unreliable | User reports of "verified but broken" decrease | <5% of Deck verdicts disputed |
| No Linux support | Linux user adoption | 80%+ of users on Linux |
| ProtonDB no hardware match | Users report "verdict matched experience" | 90%+ accuracy |
| Fragmented sources | Time to check game compatibility | <30 seconds (vs 5+ min current) |
| Anti-cheat blocker | Users avoid incompatible purchases | 0 complaints about anti-cheat surprises |
| No browser extension | Steam store page engagement | 10K+ extension installs |
| Poor hardware detection | Detection accuracy reports | <2% "wrong hardware detected" |

---

## Conclusion

The market research identified **7 major gaps** in existing tools. SpecPilot is uniquely positioned to address all of them because:

1. **Linux-first architecture** - Already built for the underserved market
2. **Multi-source data model** - Database schema supports ProtonDB, Deck, anti-cheat, community reports
3. **Intelligent verdict engine** - Can weight multiple factors, not just binary yes/no
4. **Privacy-first telemetry** - Can collect community data without losing trust
5. **Desktop app with CLI potential** - Can integrate with ecosystem tools

**Recommended Phase 1 Focus (4-6 weeks):**

1. Populate game data (scrapers already written)
2. Integrate ProtonDB + Anti-cheat into verdicts
3. Fix AMD VRAM detection
4. Build unified verdict dashboard
5. Release CLI tool

This creates a **complete, differentiated MVP** that solves the core pain points better than any existing tool.
