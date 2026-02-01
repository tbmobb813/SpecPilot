# SpecPilot - Architecture Review

## Overview

SpecPilot is a **cross-platform hardware detection system** built with Tauri (Rust backend) and React (TypeScript frontend). The architecture demonstrates professional software engineering practices with clean separation of concerns, type safety, and platform-specific implementations.

---

## ✅ Strengths

### 1. **Modular Architecture**

The codebase follows a clear modular structure:

```
Backend (Rust):
├── hardware/
│   ├── common.rs          → Shared types, errors, enums
│   ├── mod.rs             → Public API and orchestration
│   └── platform/          → Platform-specific implementations
│       ├── linux.rs       → Linux detection logic
│       ├── windows.rs     → Windows detection logic
│       └── mod.rs         → Platform module exports

Frontend (TypeScript):
├── api/                   → Type-safe API client
├── components/            → Reusable React components
└── App.tsx                → Main application
```

**Why this is good:**

- Easy to add new platforms (just add `platform/macos.rs`)
- Clear separation between detection logic and UI
- Platform-specific code is isolated and doesn't pollute common code

### 2. **Type Safety End-to-End**

**Rust backend:**

- Strong typing with `enum` for GPU vendors, storage types, tiers
- Custom error types with `thiserror` for descriptive errors
- `Result<T>` type for proper error propagation

**TypeScript frontend:**

- Interfaces match Rust structs exactly (auto-serializable with `serde`)
- Enums and types prevent invalid states
- Tauri API calls are type-safe

**Example:**

```rust
// Backend
pub enum CpuTier {
    Budget = 1,
    Entry = 2,
    Mainstream = 3,
    // ...
}

// Frontend automatically understands this!
export enum CpuTier {
  Budget = 1,
  Entry = 2,
  Mainstream = 3,
}
```

### 3. **Cross-Platform Detection Strategy**

Each platform uses native tools for accurate detection:

| Platform | Tools Used                                      |
|----------|-------------------------------------------------|
| Linux    | `/proc/cpuinfo`, `lspci`, `nvidia-smi`, `lscpu` |
| Windows  | WMI (Windows Management Instrumentation)        |
| macOS    | Planned (can use `system_profiler`, `ioreg`)    |

**Why this is good:**

- No guessing or estimation - uses real system APIs
- Leverages existing system utilities (no need to reinvent the wheel)
- Falls back gracefully when tools are unavailable

### 4. **Intelligent Tier Classification**

Hardware is automatically classified into performance tiers:

```rust
fn classify_gpu_tier(model: &str) -> GpuTier {
    let model_lower = model.to_lowercase();

    if model_lower.contains("4090") || model_lower.contains("7900 xtx") {
        GpuTier::Ultra
    } else if model_lower.contains("4080") || model_lower.contains("3090") {
        GpuTier::Enthusiast
    }
    // ... more classifications
}
```

**Future enhancement:** Move to database lookups for exact matching (see "Improvements" section)

### 5. **Graceful Error Handling**

```rust
pub enum HardwareError {
    #[error("Failed to detect CPU: {0}")]
    CpuDetectionError(String),

    #[error("Failed to detect GPU: {0}")]
    GpuDetectionError(String),
    // ...
}
```

- Descriptive error messages
- Errors propagate to frontend with context
- No panics - all operations return `Result<T, HardwareError>`

### 6. **Responsive UI Design**

The frontend features:

- **Gradient design** (purple theme) for modern aesthetics
- **Grid layout** that adapts to different screen sizes
- **Clear information hierarchy** with sections for each hardware component
- **Loading states** (scan button disables during scan)
- **Error display** (red banner for errors)

---

## 🔧 Areas for Improvement

### 1. **Enhanced GPU VRAM Detection (Linux)**

**Current issue:**

```rust
fn detect_vram(vendor: &GpuVendor) -> Result<u64> {
    match vendor {
        GpuVendor::Nvidia => {
            // ✅ Works with nvidia-smi
        }
        GpuVendor::AMD => {
            // ❌ Not implemented yet
        }
        _ => {}
    }
    Ok(0) // ⚠️ Returns 0 for unknown
}
```

**Recommended fix:**

- For AMD: Parse `/sys/class/drm/card*/device/mem_info_vram_total`
- For Intel: Use `glxinfo` or Intel GPU tools
- Fallback: Query Vulkan for memory info

**Implementation:**

```rust
GpuVendor::AMD => {
    // Try sysfs first
    for entry in glob::glob("/sys/class/drm/card*/device/mem_info_vram_total")? {
        if let Ok(path) = entry {
            if let Ok(vram_str) = fs::read_to_string(path) {
                if let Ok(vram) = vram_str.trim().parse::<u64>() {
                    return Ok(vram / (1024 * 1024)); // Convert bytes to MB
                }
            }
        }
    }
}
```

### 2. **Database-Driven Hardware Classification**

**Current approach:**

- String matching in code (e.g., `model_lower.contains("4090")`)
- Requires code changes to add new GPUs/CPUs
- Can't handle edge cases (e.g., mobile vs desktop variants)

**Recommended approach:**
Use SQLite database with hardware specs:

```sql
CREATE TABLE gpus (
    id INTEGER PRIMARY KEY,
    model TEXT NOT NULL,
    vendor TEXT NOT NULL,
    tier INTEGER NOT NULL,
    vram INTEGER,
    tdp INTEGER,
    pci_id TEXT,
    release_year INTEGER
);

CREATE TABLE cpus (
    id INTEGER PRIMARY KEY,
    model TEXT NOT NULL,
    vendor TEXT NOT NULL,
    tier INTEGER NOT NULL,
    cores INTEGER,
    threads INTEGER,
    base_clock REAL,
    boost_clock REAL,
    architecture TEXT
);
```

**Benefits:**

- Easy to update (just add database entries)
- Can match by PCI ID (more accurate than string matching)
- Can store additional metadata (TDP, release year, benchmarks)
- Can integrate with online databases (e.g., TechPowerUp GPU database)

**Implementation:**

```rust
// src-tauri/src/database/hardware_db.rs
use sqlx::SqlitePool;

pub async fn lookup_gpu(model: &str, pci_id: Option<&str>) -> Result<GpuTier> {
    let pool = SqlitePool::connect("sqlite://hardware.db").await?;

    // Try PCI ID first (most accurate)
    if let Some(pci_id) = pci_id {
        if let Some(tier) = sqlx::query_scalar!(
            "SELECT tier FROM gpus WHERE pci_id = ?",
            pci_id
        ).fetch_optional(&pool).await? {
            return Ok(tier);
        }
    }

    // Fallback to model name fuzzy match
    let tier = sqlx::query_scalar!(
        "SELECT tier FROM gpus WHERE model LIKE ?",
        format!("%{}%", model)
    ).fetch_one(&pool).await?;

    Ok(tier)
}
```

### 3. **Caching and State Management**

**Current issue:**

- Scans are not persisted across app restarts
- No background scanning
- No diff detection (can't tell what changed since last scan)

**Recommended improvements:**

**a) Persistent cache (SQLite):**

```rust
pub struct HardwareScan {
    pub id: i32,
    pub profile: HardwareProfile,
    pub scanned_at: DateTime<Utc>,
}

// Store scans in database
pub async fn save_scan(profile: &HardwareProfile) -> Result<()> {
    sqlx::query!(
        "INSERT INTO scans (profile, scanned_at) VALUES (?, ?)",
        serde_json::to_string(profile)?,
        Utc::now()
    ).execute(&pool).await?;
    Ok(())
}
```

**b) Background scanning:**

```rust
// Scan every hour in background
tokio::spawn(async move {
    let mut interval = tokio::time::interval(Duration::from_secs(3600));
    loop {
        interval.tick().await;
        if let Ok(profile) = scan_system() {
            save_scan(&profile).await;
        }
    }
});
```

**c) Change detection:**

```rust
pub fn diff_profiles(old: &HardwareProfile, new: &HardwareProfile) -> Vec<HardwareChange> {
    let mut changes = vec![];

    if old.gpu.driver_version != new.gpu.driver_version {
        changes.push(HardwareChange::DriverUpdated {
            component: "GPU".into(),
            old_version: old.gpu.driver_version.clone(),
            new_version: new.gpu.driver_version.clone(),
        });
    }

    // ... check other fields
    changes
}
```

### 4. **Testing Infrastructure**

**Currently missing:**

- Unit tests for tier classification
- Integration tests for platform detection
- Mock system utilities for testing

**Recommended test structure:**

```rust
// tests/unit/tier_classification.rs
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_classify_nvidia_4090() {
        let tier = classify_gpu_tier("NVIDIA GeForce RTX 4090");
        assert_eq!(tier, GpuTier::Ultra);
    }

    #[test]
    fn test_classify_amd_integrated() {
        let tier = classify_gpu_tier("AMD Radeon Vega 8");
        assert_eq!(tier, GpuTier::Integrated);
    }
}
```

```rust
// tests/integration/linux_detection.rs
#[tokio::test]
#[cfg(target_os = "linux")]
async fn test_cpu_detection() {
    let cpu = detect_cpu().unwrap();
    assert!(!cpu.model.is_empty());
    assert!(cpu.cores > 0);
    assert!(cpu.threads >= cpu.cores);
}
```

**Mocking system commands:**

```rust
// tests/mocks/lspci.rs
pub fn mock_lspci_output() -> &'static str {
    "01:00.0 VGA compatible controller: NVIDIA Corporation GA106 [GeForce RTX 3060]"
}

#[test]
fn test_parse_gpu_from_lspci() {
    let (vendor, model) = parse_gpu_from_lspci(mock_lspci_output()).unwrap();
    assert_eq!(vendor, GpuVendor::Nvidia);
    assert!(model.contains("RTX 3060"));
}
```

### 5. **Graphics API Detection (Linux)**

**Current Vulkan detection:**

- Requires `vulkaninfo` to be installed
- Doesn't detect OpenGL support
- No Mesa driver info

**Recommended improvements:**

**a) OpenGL detection:**

```rust
pub fn detect_opengl() -> Result<Option<OpenGLSupport>> {
    let output = Command::new("glxinfo")
        .arg("-B")
        .output()?;

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

**b) Mesa driver detection (important for AMD/Intel):**

```rust
pub fn detect_mesa_version() -> Option<String> {
    let output = Command::new("glxinfo")
        .arg("-B")
        .output()
        .ok()?;

    let info = String::from_utf8_lossy(&output.stdout);

    info.lines()
        .find(|line| line.contains("OpenGL version"))
        .and_then(|line| {
            if line.contains("Mesa") {
                line.split("Mesa").nth(1).map(|s| s.trim().to_string())
            } else {
                None
            }
        })
}
```

### 6. **Windows DirectX Detection**

**Current implementation:**

- Hardcoded DirectX 12.0 (placeholder)
- Doesn't check actual feature levels
- No ray tracing capability detection

**Recommended fix:**

```rust
use windows::Win32::Graphics::Dxgi::*;
use windows::Win32::Graphics::Direct3D12::*;

pub fn detect_directx() -> Result<Option<DirectXSupport>> {
    unsafe {
        let factory: IDXGIFactory4 = CreateDXGIFactory1()?;

        let mut i = 0;
        loop {
            match factory.EnumAdapters1(i) {
                Ok(adapter) => {
                    let mut desc = DXGI_ADAPTER_DESC1::default();
                    adapter.GetDesc1(&mut desc)?;

                    // Check feature level
                    let feature_level = D3D_FEATURE_LEVEL_12_2;
                    let mut device: Option<ID3D12Device> = None;
                    let hr = D3D12CreateDevice(
                        &adapter,
                        feature_level,
                        &mut device,
                    );

                    if hr.is_ok() {
                        // Check for ray tracing support
                        let ray_tracing = check_ray_tracing_support(&device.unwrap());

                        return Ok(Some(DirectXSupport {
                            version: "12.0".into(),
                            feature_level: format!("{:?}", feature_level),
                            ray_tracing,
                        }));
                    }

                    i += 1;
                }
                Err(_) => break,
            }
        }
    }

    Ok(None)
}
```

### 7. **Error Handling in Frontend**

**Current approach:**

- Shows error as string in red banner
- No retry mechanism
- No detailed error information

**Recommended improvements:**

**a) Structured error types:**

```typescript
interface ScanError {
  code: string;
  message: string;
  details?: string;
  recoverable: boolean;
}

async function scanHardware(): Promise<HardwareProfile | ScanError> {
  try {
    return await invoke('scan_hardware');
  } catch (e) {
    return {
      code: 'SCAN_FAILED',
      message: 'Failed to scan hardware',
      details: e.toString(),
      recoverable: true,
    };
  }
}
```

**b) Retry mechanism:**

```typescript
const handleScan = async () => {
  setScanning(true);
  setError(null);

  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    try {
      const result = await scanHardware();
      setProfile(result);
      return;
    } catch (e) {
      attempts++;
      if (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
      } else {
        setError(e as string);
      }
    }
  }

  setScanning(false);
};
```

### 8. **Performance Optimization**

**Current issues:**

- All detection happens synchronously
- No progress indication for long scans
- Frontend blocks during scan

**Recommended improvements:**

**a) Async detection with progress:**

```rust
#[tauri::command]
pub async fn scan_hardware_with_progress(
    window: tauri::Window,
) -> Result<HardwareProfile, String> {
    window.emit("scan_progress", ScanProgress { step: "CPU", percent: 0 })?;
    let cpu = platform_impl::detect_cpu()?;

    window.emit("scan_progress", ScanProgress { step: "GPU", percent: 25 })?;
    let gpu = platform_impl::detect_gpu()?;

    window.emit("scan_progress", ScanProgress { step: "Memory", percent: 50 })?;
    let memory = platform_impl::detect_memory()?;

    window.emit("scan_progress", ScanProgress { step: "Storage", percent: 75 })?;
    let storage = platform_impl::detect_storage()?;

    window.emit("scan_progress", ScanProgress { step: "Done", percent: 100 })?;

    Ok(HardwareProfile { cpu, gpu, memory, storage, /* ... */ })
}
```

**b) Frontend progress bar:**

```typescript
useEffect(() => {
  const unlisten = listen('scan_progress', (event: { payload: ScanProgress }) => {
    setProgress(event.payload);
  });

  return () => {
    unlisten.then(f => f());
  };
}, []);
```

---

## 🚀 Next Steps & Feature Roadmap

### Phase 1: Core Improvements (Week 1-2)

- [ ] Implement AMD GPU VRAM detection
- [ ] Add comprehensive unit tests
- [ ] Fix Windows DirectX detection
- [ ] Add OpenGL detection for Linux

### Phase 2: Database Integration (Week 3-4)

- [ ] Design SQLite schema for hardware database
- [ ] Populate initial database with GPU/CPU data
- [ ] Implement database lookups in detection logic
- [ ] Add PCI ID matching for GPUs

### Phase 3: Caching & State (Week 5-6)

- [ ] Implement persistent scan history
- [ ] Add background scanning
- [ ] Build change detection system
- [ ] Create timeline view of hardware changes

### Phase 4: Enhanced Features (Week 7-8)

- [ ] Proton compatibility integration
- [ ] Game requirements checking
- [ ] System benchmarking
- [ ] Export reports (JSON/PDF)

### Phase 5: Polish (Week 9-10)

- [ ] macOS support
- [ ] Localization (i18n)
- [ ] Dark/light theme toggle
- [ ] Advanced filtering/search

---

## 🛡️ Security Considerations

### Current Security Posture

**✅ Good:**

- No network calls (all detection is local)
- No sensitive data collection
- No authentication needed (standalone app)

**⚠️ Considerations:**

- Reading system info requires permissions (e.g., `dmidecode` needs sudo on Linux)
- WMI queries on Windows might require elevation
- PCI device enumeration could expose hardware serial numbers

**Recommendations:**

1. **Never collect personally identifiable information (PII)**
   - Don't store hardware serial numbers
   - Don't transmit data to external servers without consent

2. **Request minimal permissions**
   - Only ask for sudo when absolutely necessary
   - Gracefully degrade if tools aren't available

3. **Sandboxing**
   - Use Tauri's allowlist to restrict API access
   - Only enable shell commands that are needed

4. **Data storage**
   - If implementing database, encrypt sensitive data
   - Follow platform guidelines for data storage locations

---

## 📊 Performance Benchmarks

### Current Scan Performance (Estimated)

| Platform | Scan Time | Bottleneck              |
|----------|-----------|-------------------------|
| Linux    | ~500ms    | `lspci`, `nvidia-smi`   |
| Windows  | ~800ms    | WMI queries             |
| macOS    | N/A       | Not implemented         |

### Optimization Targets

- **Goal:** Sub-300ms scans for cached data
- **Strategy:** Cache system command outputs, invalidate on hardware change events

---

## 📝 Code Quality Metrics

### Current Status

| Metric              | Status | Target |
|---------------------|--------|--------|
| Type Coverage       | 100%   | 100%   |
| Error Handling      | Good   | ✅      |
| Documentation       | Medium | Needs improvement |
| Test Coverage       | 0%     | 80%+   |
| Platform Support    | 67%    | 100% (add macOS) |

### Documentation Improvements Needed

1. **Add rustdoc comments:**

```rust
/// Detects CPU information for the current system.
///
/// # Platform-specific behavior
/// - Linux: Parses `/proc/cpuinfo` and uses `lscpu`
/// - Windows: Queries WMI (`Win32_Processor`)
///
/// # Errors
/// Returns `HardwareError::CpuDetectionError` if:
/// - `/proc/cpuinfo` cannot be read (Linux)
/// - WMI query fails (Windows)
///
/// # Example
/// ```rust
/// let cpu = detect_cpu()?;
/// println!("CPU: {} ({} cores)", cpu.model, cpu.cores);
/// ```
pub fn detect_cpu() -> Result<CpuInfo> { /* ... */ }
```

1. **Add TypeScript JSDoc:**

```typescript
/**
 * Scans the system hardware and returns a complete profile.
 *
 * This operation may take 0.5-1 second depending on the system.
 *
 * @returns {Promise<HardwareProfile>} Complete hardware information
 * @throws {string} Error message if scan fails
 *
 * @example
 * ```typescript
 * const profile = await scanHardware();
 * console.log(`CPU: ${profile.cpu.model}`);
 * console.log(`GPU: ${profile.gpu.model} (${profile.gpu.vram}MB)`);
 * ```
 */
export async function scanHardware(): Promise<HardwareProfile> {
  return await invoke('scan_hardware');
}
```

---

## 🎯 Summary

### What's Working Well

✅ Clean architecture with strong separation of concerns
✅ Type-safe end-to-end (Rust → TypeScript)
✅ Platform-specific implementations that use native tools
✅ Intelligent tier classification
✅ Modern, responsive UI

### Priority Improvements

1. **Database-driven hardware classification** (reduces maintenance burden)
2. **Comprehensive testing** (ensures reliability across platforms)
3. **AMD GPU VRAM detection** (closes feature gap on Linux)
4. **Persistent caching** (improves performance, enables history tracking)
5. **Progress indication** (better UX for long scans)

### Long-term Vision

- **Game compatibility checking** (integrate with ProtonDB) → **See [INTELLIGENCE_LAYER.md](INTELLIGENCE_LAYER.md)**
- **Benchmarking suite** (measure actual performance)
- **Hardware recommendations** (suggest upgrades based on use case)
- **Multi-system management** (track hardware across multiple PCs)

---

## 🎮 Intelligence Layer: Game Compatibility System

The next major feature is a **game compatibility checking system** that compares detected hardware against game requirements (like "Can You Run It" but better).

**Full design document:** [INTELLIGENCE_LAYER.md](INTELLIGENCE_LAYER.md)

**Key Design Decisions:**

1. **Hybrid Tier + Score System**
   - Tiers for broad categorization (Budget → Ultra)
   - Scores for precise comparisons (0-10000 scale)
   - Feature flags (ray tracing, DLSS, FSR)

2. **Bootstrap Strategy**
   - Scrape TechPowerUp GPU database (2000+ GPUs)
   - Scrape CPU benchmarks (1000+ CPUs)
   - Integrate ProtonDB (100k+ Linux game reports)
   - Sync Steam Deck compatibility (Valve's official data)

3. **Conservative Verdicts**
   - Qualitative expectations ("smooth 60 FPS at High") not exact FPS
   - Traffic light system (Verified/Expected/Uncertain) not confidence scores
   - Underpromise to build trust

4. **Linux/Steam Deck First**
   - Underserved market (CYRI is Windows-focused)
   - 3M+ Steam Deck users
   - ProtonDB integration (unique competitive advantage)

**Implementation Timeline:**

- **Week 1-2:** Bootstrap hardware/game databases
- **Week 3-4:** MVP rules engine with top 100 games
- **Week 5-6:** Data integration (ProtonDB, Steam Deck)
- **Week 7-8:** Telemetry collection and validation
- **Week 9+:** Scale to 1000+ games

**See [INTELLIGENCE_LAYER.md](INTELLIGENCE_LAYER.md) for complete architecture, database schemas, API design, and implementation roadmap.**

---

## 🏗️ Build & Development

### Current Setup

```bash
# Install dependencies
npm install

# Development (hot-reload)
npm run tauri dev

# Production build
npm run tauri build
```

### Recommended CI/CD Pipeline

```yaml
# .github/workflows/build.yml
name: Build and Test

on: [push, pull_request]

jobs:
  test:
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
    runs-on: ${{ matrix.os }}

    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - uses: dtolnay/rust-toolchain@stable

      - name: Install dependencies
        run: npm install

      - name: Run Rust tests
        working-directory: src-tauri
        run: cargo test

      - name: Build Tauri app
        run: npm run tauri build

      - name: Upload artifacts
        uses: actions/upload-artifact@v3
        with:
          name: specpilot-${{ matrix.os }}
          path: src-tauri/target/release/bundle/
```

---

## 📚 Additional Resources

### Recommended Reading

- [Tauri Best Practices](https://tauri.app/v1/guides/development/security)
- [Rust Error Handling](https://doc.rust-lang.org/book/ch09-00-error-handling.html)
- [WMI Reference (Windows)](https://docs.microsoft.com/en-us/windows/win32/wmisdk/wmi-reference)
- [Linux /proc documentation](https://man7.org/linux/man-pages/man5/proc.5.html)

### Community Resources

- [TechPowerUp GPU Database](https://www.techpowerup.com/gpu-specs/) - For GPU specs
- [CPU-World Database](http://www.cpu-world.com/) - For CPU specs
- [ProtonDB API](https://www.protondb.com/) - For game compatibility

---

**Overall Assessment:** This is a **well-architected foundation** with clear paths for enhancement. The modular design makes it easy to extend, and the type safety ensures reliability. With the recommended improvements, this could become a production-ready system profiler.

**Grade:** A- (Excellent foundation, needs testing and polish)
