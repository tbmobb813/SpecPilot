# SpecPilot - Quick Start Guide

Get SpecPilot up and running in 5 minutes!

## Prerequisites

Before you begin, ensure you have:

- ✅ **Rust** (latest stable) - [Install here](https://rustup.rs/)
- ✅ **Node.js** 18+ - [Install here](https://nodejs.org/)
- ✅ **npm** or **yarn** (comes with Node.js)

### Platform-Specific Requirements

**Linux:**

```bash
# Ubuntu/Debian
sudo apt install lshw lspci lscpu pciutils

# For NVIDIA GPUs
sudo apt install nvidia-utils

# For Vulkan detection
sudo apt install vulkan-tools

# For OpenGL detection (optional)
sudo apt install mesa-utils
```

**Windows:**

- No additional requirements (uses built-in WMI)

**macOS:**

- Not yet implemented (coming soon)

---

## Installation

### 1. Clone or navigate to the project

```bash
cd SpecPilot
```

### 2. Install frontend dependencies

```bash
npm install
```

This will install:

- React and React DOM
- Tauri API bindings
- Vite (build tool)
- TypeScript

### 3. Verify Rust installation

```bash
rustc --version
cargo --version
```

You should see version numbers like:

```
rustc 1.75.0 (82e1608df 2023-12-21)
cargo 1.75.0 (1d8b05cdd 2023-11-20)
```

---

## Development

### Option 1: Run in Development Mode (Recommended for testing)

```bash
npm run tauri dev
```

This will:

1. Start Vite dev server on port 3000
2. Compile Rust backend
3. Launch the Tauri application window
4. Enable hot-reload (changes to frontend automatically refresh)

**First run may take 2-3 minutes** as Cargo downloads and compiles dependencies.

### Option 2: Build for Production

```bash
npm run tauri build
```

This creates a production-ready executable in:

- **Linux:** `src-tauri/target/release/bundle/appimage/specpilot_0.1.0_amd64.AppImage`
- **Windows:** `src-tauri/target/release/bundle/msi/SpecPilot_0.1.0_x64_en-US.msi`

---

## Using the App

### 1. Launch the App

If running in dev mode, the app window will open automatically.

### 2. Scan Your Hardware

Click the **"Scan My PC"** button in the top-right corner.

### 3. View Results

After 0.5-1 second, you'll see:

- 🖥️ **CPU Information**
  - Model, vendor, cores/threads
  - Base clock speed
  - Performance tier

- 🎮 **GPU Information**
  - Model, vendor, VRAM
  - Driver version
  - Performance tier

- 💾 **Memory Information**
  - Total RAM, available RAM
  - Speed (if detectable)

- 💿 **Storage Information**
  - Total capacity, available space
  - Storage type (HDD/SSD/NVMe)

- ⚙️ **Operating System**
  - Platform, version, distribution

- 🎨 **Graphics API Support** (Linux)
  - Vulkan version
  - Ray tracing support
  - Mesh shader support

---

## Troubleshooting

### Issue: Build fails with "command not found: tauri"

**Solution:**

```bash
npm install -g @tauri-apps/cli
```

### Issue: "Failed to detect GPU" on Linux

**Solution:**

```bash
# Check if lspci is installed
which lspci

# If not, install it
sudo apt install pciutils

# Check if GPU is detected by system
lspci | grep -i vga
```

### Issue: NVIDIA GPU shows 0 MB VRAM on Linux

**Solution:**

```bash
# Check if nvidia-smi is installed
which nvidia-smi

# If not, install NVIDIA drivers
sudo apt install nvidia-driver-535  # Or latest version

# Test nvidia-smi
nvidia-smi
```

### Issue: Build fails with "linker `cc` not found"

**Solution:**

```bash
# Ubuntu/Debian
sudo apt install build-essential

# Fedora
sudo dnf install gcc

# Arch
sudo pacman -S base-devel
```

### Issue: "error: failed to compile `specpilot`"

**Solution:**

```bash
# Update Rust
rustup update

# Clean Cargo cache
cd src-tauri
cargo clean

# Try again
cargo build
```

### Issue: Frontend shows blank white screen

**Solution:**

```bash
# Check console for errors
# Open DevTools: Right-click → Inspect

# Rebuild frontend
rm -rf node_modules
npm install
npm run tauri dev
```

---

## Project Structure Overview

```
SpecPilot/
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── main.rs         # Application entry point
│   │   ├── hardware/       # Hardware detection modules
│   │   └── commands/       # Tauri command handlers
│   ├── Cargo.toml          # Rust dependencies
│   └── tauri.conf.json     # Tauri configuration
├── src/                    # React frontend
│   ├── App.tsx             # Main React component
│   ├── components/         # Reusable components
│   │   └── HardwareScan.tsx
│   └── api/                # API client
│       └── hardware.ts
├── package.json            # Node.js dependencies
└── vite.config.ts          # Vite configuration
```

---

## Development Workflow

### Making Changes to the Backend (Rust)

1. Edit files in `src-tauri/src/`
2. Save (Tauri will auto-rebuild if dev mode is running)
3. Check terminal for compilation errors

### Making Changes to the Frontend (React)

1. Edit files in `src/`
2. Save (Vite will hot-reload automatically)
3. Changes appear instantly in the app window

### Adding New Hardware Detection

**Example: Add motherboard detection**

1. **Add to common types** (`src-tauri/src/hardware/common.rs`):

```rust
pub struct MotherboardInfo {
    pub manufacturer: String,
    pub model: String,
    pub bios_version: String,
}
```

1. **Implement detection** (`src-tauri/src/hardware/platform/linux.rs`):

```rust
pub fn detect_motherboard() -> Result<MotherboardInfo> {
    let output = Command::new("dmidecode")
        .args(&["-t", "baseboard"])
        .output()?;

    // Parse output...

    Ok(MotherboardInfo { /* ... */ })
}
```

1. **Update frontend types** (`src/api/hardware.ts`):

```typescript
export interface MotherboardInfo {
  manufacturer: string;
  model: string;
  bios_version: string;
}
```

1. **Display in UI** (`src/components/HardwareScan.tsx`):

```tsx
<div className="section motherboard-section">
  <h3>🔧 Motherboard</h3>
  <div className="info-grid">
    <div className="info-item">
      <span className="label">Model:</span>
      <span className="value">{profile.motherboard.model}</span>
    </div>
  </div>
</div>
```

---

## Testing

### Manual Testing Checklist

- [ ] App launches without errors
- [ ] Scan button works
- [ ] All hardware components are detected
- [ ] Tier classifications are accurate
- [ ] No crashes or hangs
- [ ] UI is responsive to window resizing

### Automated Testing (Future)

```bash
# Backend tests
cd src-tauri
cargo test

# Frontend tests
npm test
```

---

## Performance Tips

### Optimize Scan Speed

1. **Cache results** - Don't re-scan unchanged hardware
2. **Parallel detection** - Detect CPU/GPU/Memory simultaneously
3. **Skip optional tools** - Don't wait for missing commands

### Reduce App Size

```bash
# Build with release optimizations
npm run tauri build -- --release

# Strip debug symbols (Linux)
strip src-tauri/target/release/specpilot
```

---

## Next Steps

After getting the app running, check out:

1. **[REVIEW.md](REVIEW.md)** - Comprehensive architecture review
2. **[README.md](README.md)** - Full project documentation
3. **Proton Integration** - Add game compatibility checking
4. **Database** - Implement hardware spec database

---

## Getting Help

### Common Resources

- **Tauri Documentation:** <https://tauri.app/>
- **Rust Book:** <https://doc.rust-lang.org/book/>
- **React Docs:** <https://react.dev/>

### Debug Mode

Enable verbose logging:

```bash
# Linux/macOS
RUST_LOG=debug npm run tauri dev

# Windows PowerShell
$env:RUST_LOG="debug"
npm run tauri dev
```

This will print detailed logs to the terminal.

---

## Success Checklist

✅ Prerequisites installed (Rust, Node.js)
✅ Dependencies installed (`npm install`)
✅ App launches (`npm run tauri dev`)
✅ Hardware scan completes successfully
✅ All components show real data (not "Unknown")

**Congratulations!** You're ready to start developing. 🎉

---

## Quick Reference

| Command                  | Description                          |
|--------------------------|--------------------------------------|
| `npm run tauri dev`      | Start development server             |
| `npm run tauri build`    | Build production executable          |
| `cargo test`             | Run Rust tests                       |
| `npm test`               | Run frontend tests                   |
| `cargo clean`            | Clean Rust build artifacts           |
| `rm -rf node_modules`    | Clean Node.js dependencies           |

---

**Happy coding!** 🚀
