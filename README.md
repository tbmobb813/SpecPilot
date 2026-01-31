# SpecPilot

A cross-platform hardware detection and system analysis tool built with Tauri, Rust, and React.

## Features

- 🖥️ **CPU Detection**: Detailed CPU information including model, cores, threads, clock speeds, and tier classification
- 🎮 **GPU Detection**: GPU model, vendor, VRAM, driver version, and performance tier
- 💾 **Memory Analysis**: Total RAM, available memory, speed, and DDR type detection
- 💿 **Storage Detection**: Drive capacity, available space, and storage type (HDD/SSD/NVMe)
- ⚙️ **OS Information**: Platform, version, and Linux distribution detection
- 🎨 **Graphics API Support**: Vulkan, DirectX, OpenGL support detection with advanced features (ray tracing, mesh shaders)

## Platform Support

- ✅ **Linux**: Full support with lspci, nvidia-smi, rocm-smi, dmidecode integration
- ✅ **Windows**: Full support using WMI and Windows APIs
- 🚧 **macOS**: Planned (structure in place)

## Project Structure

```
SpecPilot/
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── hardware/       # Hardware detection modules
│   │   │   ├── common.rs   # Shared types
│   │   │   ├── mod.rs      # Main detection orchestrator
│   │   │   └── platform/   # Platform-specific implementations
│   │   │       ├── linux.rs
│   │   │       └── windows.rs
│   │   ├── commands/       # Tauri command handlers
│   │   └── main.rs         # Application entry point
│   └── Cargo.toml
└── src/                    # React frontend
    ├── api/                # TypeScript API client
    ├── components/         # React components
    └── App.tsx             # Main application
```

## Getting Started

### Prerequisites

- **Rust** (latest stable): [Install Rust](https://rustup.rs/)
- **Node.js** 18+: [Install Node.js](https://nodejs.org/)
- **System tools** (Linux):
  - `lspci` - GPU detection
  - `lscpu` - CPU information
  - `nvidia-smi` - NVIDIA GPU details (if applicable)
  - `vulkaninfo` - Vulkan support detection

### Installation

1. Clone the repository:
```bash
cd SpecPilot
```

2. Install frontend dependencies:
```bash
npm install
```

3. Install Rust dependencies (automatic with Cargo):
```bash
cd src-tauri
cargo build
```

### Development

Run the development server:
```bash
npm run tauri dev
```

This starts:
- Vite dev server on port 3000
- Tauri app with hot-reload

### Building

Build for production:
```bash
npm run tauri build
```

This creates platform-specific installers in `src-tauri/target/release/bundle/`.

## Architecture

## Documentation

The project includes a set of detailed design and operational documents in the `docs/` folder. Key references:

- [Quick Start Guide](docs/QUICKSTART.md) — getting the project running and common troubleshooting.
- [Intelligence Layer](docs/INTELLIGENCE_LAYER.md) — database schema, scoring, and rules engine for game compatibility.
- [Data Sources](docs/DATA_SOURCES.md) — external sources, scraping strategy, and rate limits.
- [Scrapers](docs/SCRAPERS.md) — scraper design, selectors, and maintenance notes.
- [ProtonDB Sync](docs/PROTONDB_SYNC.md) — usage and CLI options for ProtonDB synchronization.
- [Data Import](docs/DATA_IMPORT.md) — formats and commands to import games and hardware data.
- [Privacy & Telemetry](docs/PRIVACY.md) — opt-in telemetry, anonymization, and retention.
- [Contributing](docs/CONTRIBUTING.md) — how to contribute, testing, and developer workflow.

You can also open `docs/index.md` for a quick index of all documentation.


### Rust Backend

The backend uses a **modular, platform-specific architecture**:

- **`hardware/common.rs`**: Defines shared types (`HardwareProfile`, `CpuInfo`, `GpuInfo`, etc.) and error handling
- **`hardware/platform/`**: Platform-specific detection implementations
  - Linux: Uses `/proc`, `lspci`, `nvidia-smi`, `dmidecode`
  - Windows: Uses WMI and Windows APIs
- **`hardware/mod.rs`**: Orchestrates detection and aggregates results
- **`commands/scan.rs`**: Exposes Tauri commands to frontend

### Frontend

- **React + TypeScript**: Type-safe UI components
- **Tauri API**: Invokes Rust backend commands
- **Responsive Design**: Works on desktop (future: mobile)

## Hardware Tier Classification

CPUs and GPUs are automatically classified into performance tiers:

**CPU Tiers:**
1. Budget (Celeron, Athlon)
2. Entry (i3, Ryzen 3)
3. Mainstream (i5, Ryzen 5)
4. Performance (i7, Ryzen 7)
5. Enthusiast (i9, Ryzen 9)
6. Workstation (Threadripper, Xeon)

**GPU Tiers:**
1. Integrated (Intel UHD, Vega iGPU)
2. Budget (GTX 1650, RX 6500 XT)
3. Entry (GTX 1660, RX 6600)
4. Mainstream (RTX 3060, RX 6700 XT)
5. Performance (RTX 3070, RX 6800 XT)
6. Enthusiast (RTX 3080, RX 6900 XT)
7. Ultra (RTX 4090, RX 7900 XTX)

## Roadmap

### Phase 1: Core Detection (Current) ✅
- [x] Linux hardware detection
- [x] Windows hardware detection
- [x] Automatic tier classification
- [x] Graphics API support detection
- [x] Modern React UI

### Phase 2: Enhanced Detection (Next 2 Weeks)
- [ ] AMD GPU VRAM detection on Linux
- [ ] OpenGL support detection
- [ ] Full DirectX feature level detection (Windows)
- [ ] Driver issue database
- [ ] Comprehensive unit tests

### Phase 3: Intelligence Layer (Week 3-8) 🎮
**Game compatibility checking system** - Full design: [INTELLIGENCE_LAYER.md](INTELLIGENCE_LAYER.md)

- [ ] **Week 3-4:** Hardware/game database bootstrap
  - Scrape TechPowerUp GPU database (2000+ GPUs)
  - Import CPU benchmark scores (1000+ CPUs)
  - Integrate ProtonDB (100k+ game reports)
  - Sync Steam Deck compatibility data

- [ ] **Week 5-6:** MVP rules engine
  - Tier-based game requirements matching
  - Bottleneck detection and analysis
  - Composable narrative system
  - Top 100 games hardcoded for validation

- [ ] **Week 7-8:** Data integration & validation
  - PCGamingWiki scraper (1000+ games)
  - Opt-in telemetry system
  - User report collection
  - Tier calibration based on real data

### Phase 4: Advanced Features (Month 3+)
- [ ] macOS support
- [ ] Performance benchmarking
- [ ] Hardware comparison tool
- [ ] FPS prediction (experimental)
- [ ] Hardware upgrade recommendations
- [ ] Export system reports (JSON/PDF)
- [ ] Community contribution system

### Market Focus: Linux Gaming & Steam Deck 🐧
- **Target:** 3M+ Steam Deck users + Linux gamers
- **Differentiator:** ProtonDB integration, Deck-specific optimizations
- **Competition:** Can You Run It (Windows-focused, no Linux support)
- **Goal:** Become the #1 game compatibility checker for Linux/Steam Deck

## Contributing

Contributions are welcome! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see LICENSE file for details

## Credits

Built with:
- [Tauri](https://tauri.app/) - Desktop app framework
- [Rust](https://www.rust-lang.org/) - Backend language
- [React](https://react.dev/) - Frontend framework
- [Vite](https://vitejs.dev/) - Build tool

## Troubleshooting

### Linux: GPU detection fails
- Ensure `lspci` is installed: `sudo apt install pciutils`
- For NVIDIA GPUs, install `nvidia-smi`
- For AMD GPUs, ensure `amdgpu` driver is loaded

### Windows: WMI errors
- Run as Administrator if permission errors occur
- Ensure Windows Management Instrumentation service is running

### Build errors
- Update Rust: `rustup update`
- Clear Cargo cache: `cargo clean`
- Reinstall Node modules: `rm -rf node_modules && npm install`

## Contact

For issues and feature requests, please open an issue on GitHub.
