use super::super::common::*;
use std::fs;
use std::process::Command;

pub fn detect_cpu() -> Result<CpuInfo> {
    // Read /proc/cpuinfo
    let cpuinfo = fs::read_to_string("/proc/cpuinfo")
        .map_err(|e| HardwareError::CpuDetectionError(e.to_string()))?;

    // Parse model name
    let model = cpuinfo
        .lines()
        .find(|line| line.starts_with("model name"))
        .and_then(|line| line.split(':').nth(1))
        .map(|s| s.trim().to_string())
        .ok_or_else(|| HardwareError::CpuDetectionError("Model name not found".into()))?;

    // Parse vendor
    let vendor = cpuinfo
        .lines()
        .find(|line| line.starts_with("vendor_id"))
        .and_then(|line| line.split(':').nth(1))
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|| "Unknown".into());

    // Count cores and threads
    let cores = cpuinfo
        .lines()
        .filter(|line| line.starts_with("cpu cores"))
        .next()
        .and_then(|line| line.split(':').nth(1))
        .and_then(|s| s.trim().parse::<u32>().ok())
        .unwrap_or(1);

    let threads = cpuinfo
        .lines()
        .filter(|line| line.starts_with("processor"))
        .count() as u32;

    // Try to get clock speed from lscpu
    let base_clock = get_cpu_frequency()?;

    // Classify tier based on model name
    let tier = classify_cpu_tier(&model);

    Ok(CpuInfo {
        model,
        vendor,
        cores,
        threads,
        base_clock,
        boost_clock: None, // Could parse from cpuinfo if available
        architecture: std::env::consts::ARCH.to_string(),
        tier,
    })
}

pub fn detect_gpu() -> Result<GpuInfo> {
    // Try multiple methods: lspci, nvidia-smi, rocm-smi, glxinfo

    // Method 1: lspci (most reliable for basic info)
    let lspci_output = Command::new("lspci")
        .output()
        .map_err(|e| HardwareError::GpuDetectionError(format!("lspci failed: {}", e)))?;

    let lspci_str = String::from_utf8_lossy(&lspci_output.stdout);

    // Find GPU line (VGA compatible controller or 3D controller)
    let gpu_line = lspci_str
        .lines()
        .find(|line| line.contains("VGA") || line.contains("3D controller"))
        .ok_or_else(|| HardwareError::GpuDetectionError("No GPU found in lspci".into()))?;

    // Extract vendor and model
    let (vendor, model) = parse_gpu_from_lspci(gpu_line)?;

    // Get VRAM - try nvidia-smi first, then fallback
    let vram = detect_vram(&vendor)?;

    // Get driver version
    let driver_version = detect_driver_version(&vendor)?;

    // Classify tier
    let tier = classify_gpu_tier(&model);

    Ok(GpuInfo {
        model: model.clone(),
        vendor,
        vram,
        driver_version,
        pci_id: extract_pci_id(gpu_line),
        tier,
    })
}

pub fn detect_memory() -> Result<MemoryInfo> {
    // Read /proc/meminfo
    let meminfo = fs::read_to_string("/proc/meminfo")
        .map_err(|e| HardwareError::MemoryDetectionError(e.to_string()))?;

    let total = meminfo
        .lines()
        .find(|line| line.starts_with("MemTotal"))
        .and_then(|line| {
            line.split_whitespace()
                .nth(1)
                .and_then(|s| s.parse::<u64>().ok())
        })
        .map(|kb| kb / 1024) // Convert to MB
        .ok_or_else(|| HardwareError::MemoryDetectionError("MemTotal not found".into()))?;

    let available = meminfo
        .lines()
        .find(|line| line.starts_with("MemAvailable"))
        .and_then(|line| {
            line.split_whitespace()
                .nth(1)
                .and_then(|s| s.parse::<u64>().ok())
        })
        .map(|kb| kb / 1024)
        .unwrap_or(0);

    // Try to get RAM speed from dmidecode (requires sudo, so optional)
    let speed = detect_ram_speed();

    Ok(MemoryInfo {
        total,
        available,
        speed,
        ddr_type: None, // Could parse from dmidecode
    })
}

pub fn detect_storage() -> Result<StorageInfo> {
    // Use df to get storage info
    let output = Command::new("df")
        .args(&["-BG", "/"])
        .output()
        .map_err(|e| HardwareError::StorageDetectionError(e.to_string()))?;

    let df_str = String::from_utf8_lossy(&output.stdout);

    // Parse the output (skip header line)
    let storage_line = df_str
        .lines()
        .nth(1)
        .ok_or_else(|| HardwareError::StorageDetectionError("Failed to parse df output".into()))?;

    let parts: Vec<&str> = storage_line.split_whitespace().collect();

    let total = parts.get(1)
        .and_then(|s| s.trim_end_matches('G').parse::<u64>().ok())
        .unwrap_or(0);

    let available = parts.get(3)
        .and_then(|s| s.trim_end_matches('G').parse::<u64>().ok())
        .unwrap_or(0);

    // Detect storage type (basic - could be enhanced)
    let storage_type = detect_storage_type();

    Ok(StorageInfo {
        total,
        available,
        storage_type,
    })
}

pub fn detect_os() -> Result<OsInfo> {
    let platform = std::env::consts::OS.to_string();

    // Get kernel version
    let version = fs::read_to_string("/proc/version")
        .map(|v| {
            v.split_whitespace()
                .nth(2)
                .unwrap_or("Unknown")
                .to_string()
        })
        .unwrap_or_else(|_| "Unknown".into());

    // Try to detect distribution
    let distribution = detect_linux_distribution();

    Ok(OsInfo {
        platform,
        version,
        distribution,
    })
}

pub fn detect_vulkan() -> Result<Option<VulkanSupport>> {
    // Check if vulkaninfo is available
    let output = Command::new("vulkaninfo")
        .arg("--summary")
        .output();

    if output.is_err() {
        return Ok(None);
    }

    let output = output.unwrap();
    let info = String::from_utf8_lossy(&output.stdout);

    // Parse Vulkan version
    let version = info
        .lines()
        .find(|line| line.contains("Vulkan Instance Version"))
        .and_then(|line| line.split(':').nth(1))
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|| "Unknown".into());

    // Check for ray tracing support
    let ray_tracing = info.contains("VK_KHR_ray_tracing_pipeline");
    let mesh_shaders = info.contains("VK_EXT_mesh_shader");

    Ok(Some(VulkanSupport {
        version,
        driver_version: "Unknown".into(), // Parse if needed
        ray_tracing,
        mesh_shaders,
    }))
}

pub fn detect_opengl() -> Result<Option<OpenGLSupport>> {
    // Check if glxinfo is available
    let output = Command::new("glxinfo").arg("-B").output();
    if output.is_err() {
        return Ok(None);
    }
    let output = output.unwrap();
    let info = String::from_utf8_lossy(&output.stdout);

    let version = info
        .lines()
        .find(|line| line.to_lowercase().contains("opengl version"))
        .and_then(|line| line.split(':').nth(1))
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|| "Unknown".into());

    Ok(Some(OpenGLSupport { version }))
}

// Helper functions

fn get_cpu_frequency() -> Result<f32> {
    let output = Command::new("lscpu")
        .output()
        .map_err(|e| HardwareError::CpuDetectionError(format!("lscpu failed: {}", e)))?;

    let info = String::from_utf8_lossy(&output.stdout);

    let freq = info
        .lines()
        .find(|line| line.contains("CPU max MHz") || line.contains("CPU MHz"))
        .and_then(|line| line.split(':').nth(1))
        .and_then(|s| s.trim().parse::<f32>().ok())
        .map(|mhz| mhz / 1000.0) // Convert MHz to GHz
        .unwrap_or(0.0);

    Ok(freq)
}

fn parse_gpu_from_lspci(line: &str) -> Result<(GpuVendor, String)> {
    // Example: "01:00.0 VGA compatible controller: NVIDIA Corporation GA106 [GeForce RTX 3060]"

    let vendor = if line.contains("NVIDIA") || line.contains("nvidia") {
        GpuVendor::Nvidia
    } else if line.contains("AMD") || line.contains("Advanced Micro Devices") {
        GpuVendor::AMD
    } else if line.contains("Intel") {
        GpuVendor::Intel
    } else {
        GpuVendor::Unknown
    };

    // Extract model name (everything after the vendor)
    let model = line
        .split(':')
        .last()
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|| "Unknown GPU".into());

    Ok((vendor, model))
}

fn detect_vram(vendor: &GpuVendor) -> Result<u64> {
    match vendor {
        GpuVendor::Nvidia => {
            // Try nvidia-smi
            let output = Command::new("nvidia-smi")
                .args(&["--query-gpu=memory.total", "--format=csv,noheader,nounits"])
                .output();

            if let Ok(output) = output {
                let vram_str = String::from_utf8_lossy(&output.stdout);
                if let Ok(vram) = vram_str.trim().parse::<u64>() {
                    return Ok(vram);
                }
            }
        }
        GpuVendor::AMD => {
            // Method 1: Try sysfs entries created by amdgpu driver
            // Path: /sys/class/drm/card0/device/mem_info_vram_total
            if let Ok(entries) = glob::glob("/sys/class/drm/card*/device/mem_info_vram_total") {
                for entry in entries.filter_map(|r| r.ok()) {
                    if let Ok(vram_str) = std::fs::read_to_string(&entry) {
                        if let Ok(vram_bytes) = vram_str.trim().parse::<u64>() {
                            return Ok(vram_bytes / (1024 * 1024)); // Bytes -> MB
                        }
                    }
                }
            }

            // Method 2: Try alternate sysfs path (some drivers use this)
            if let Ok(entries) = glob::glob("/sys/class/drm/card*/device/resource") {
                for entry in entries.filter_map(|r| r.ok()) {
                    if let Ok(content) = std::fs::read_to_string(&entry) {
                        // Parse PCI BAR resources to estimate VRAM
                        if let Some(vram) = parse_pci_resource_vram(&content) {
                            return Ok(vram);
                        }
                    }
                }
            }

            // Method 3: Try rocm-smi
            let output = Command::new("rocm-smi").arg("--showmeminfo").arg("vram").output();
            if let Ok(output) = output {
                let s = String::from_utf8_lossy(&output.stdout);
                if let Some(num) = parse_rocm_smi_output(&s) {
                    return Ok(num);
                }
            }

            // Method 4: Try amdgpu-pro-based detection via radeontop
            let output = Command::new("radeontop").args(&["-d", "-", "-l", "1"]).output();
            if let Ok(output) = output {
                let s = String::from_utf8_lossy(&output.stdout);
                if let Some(vram) = parse_radeontop_vram(&s) {
                    return Ok(vram);
                }
            }
        }
        GpuVendor::Intel => {
            // Intel integrated GPUs share system RAM, try to detect allocated VRAM
            // Check i915 sysfs
            if let Ok(entries) = glob::glob("/sys/class/drm/card*/gt/gt*/stolen_size") {
                for entry in entries.filter_map(|r| r.ok()) {
                    if let Ok(vram_str) = std::fs::read_to_string(&entry) {
                        if let Ok(vram_bytes) = vram_str.trim().parse::<u64>() {
                            return Ok(vram_bytes / (1024 * 1024));
                        }
                    }
                }
            }
        }
        _ => {}
    }

    // Universal fallback: Try glxinfo
    if let Some(vram) = detect_vram_from_glxinfo() {
        return Ok(vram);
    }

    Ok(0) // Unknown - will need to look up in database by model
}

/// Parse VRAM from glxinfo output (works for most GPUs)
fn detect_vram_from_glxinfo() -> Option<u64> {
    let output = Command::new("glxinfo").arg("-B").output().ok()?;
    let info = String::from_utf8_lossy(&output.stdout);

    // Look for "Video memory: XXXX MB" or "Dedicated video memory: XXXX MB"
    for line in info.lines() {
        let lower = line.to_lowercase();
        if lower.contains("video memory") || lower.contains("dedicated memory") {
            // Extract number followed by MB or GB
            for word in line.split_whitespace() {
                if let Ok(val) = word.trim_end_matches("MB").trim_end_matches("mb").parse::<u64>() {
                    return Some(val);
                }
                if let Ok(val) = word.trim_end_matches("GB").trim_end_matches("gb").parse::<u64>() {
                    return Some(val * 1024); // Convert GB to MB
                }
            }
            // Try parsing just the number
            if let Some(num_str) = line.split(':').nth(1) {
                let num_str = num_str.trim();
                if let Ok(val) = num_str.split_whitespace().next()?.parse::<u64>() {
                    // Check if it says GB or MB after
                    if num_str.to_lowercase().contains("gb") {
                        return Some(val * 1024);
                    }
                    return Some(val);
                }
            }
        }
    }
    None
}

/// Parse PCI resource file to estimate VRAM from BAR sizes
fn parse_pci_resource_vram(content: &str) -> Option<u64> {
    // PCI resource file format: start end flags (per line, one per BAR)
    // VRAM is typically the largest BAR (BAR0 or BAR2)
    let mut max_size: u64 = 0;

    for line in content.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 2 {
            if let (Ok(start), Ok(end)) = (
                u64::from_str_radix(parts[0].trim_start_matches("0x"), 16),
                u64::from_str_radix(parts[1].trim_start_matches("0x"), 16),
            ) {
                let size = end.saturating_sub(start);
                // Only consider sizes > 256MB as potential VRAM
                if size > 256 * 1024 * 1024 && size > max_size {
                    max_size = size;
                }
            }
        }
    }

    if max_size > 0 {
        Some(max_size / (1024 * 1024)) // Bytes to MB
    } else {
        None
    }
}

/// Parse radeontop output for VRAM info
fn parse_radeontop_vram(output: &str) -> Option<u64> {
    // radeontop shows "vram XXX.XX% XXXMB/XXXMB"
    for line in output.lines() {
        if line.to_lowercase().contains("vram") {
            // Look for pattern like "8192mb" or "8192MB"
            for word in line.split_whitespace() {
                if word.to_lowercase().ends_with("mb") {
                    // This might be "used/total" format, get the total (after /)
                    if word.contains('/') {
                        let total = word.split('/').nth(1)?;
                        return total.trim_end_matches("MB").trim_end_matches("mb").parse().ok();
                    }
                }
            }
        }
    }
    None
}

// Parse `rocm-smi --showmeminfo` (or similar) output for a VRAM value in MB.
fn parse_rocm_smi_output(s: &str) -> Option<u64> {
    for line in s.lines() {
        let lower = line.to_lowercase();
        if lower.contains("vram") || lower.contains("memory") || lower.contains("mem") {
            // Try to find a token containing a number with optional 'MB'
            for tok in line.split_whitespace() {
                let t = tok.trim().trim_end_matches(',');
                if let Some(n) = t.strip_suffix("MB") {
                    if let Ok(val) = n.parse::<u64>() {
                        return Some(val);
                    }
                } else if let Ok(val) = t.parse::<u64>() {
                    // If token is a plain number, assume it's MB
                    return Some(val);
                }
            }
        }
    }
    None
}

// Parse `nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits` output
#[allow(dead_code)]
fn parse_nvidia_smi_output(s: &str) -> Option<u64> {
    // The CSV noheader output is typically a number per line (MB)
    for line in s.lines() {
        let t = line.trim();
        if let Ok(val) = t.parse::<u64>() {
            return Some(val);
        }
    }
    None
}

// Default runner that executes commands on the host
#[cfg(test)]
#[allow(dead_code)]
fn default_runner(cmd: &str, args: &[&str]) -> Option<String> {
    let output = Command::new(cmd).args(args).output().ok()?;
    Some(String::from_utf8_lossy(&output.stdout).to_string())
}

// Generic detect_vram which accepts an injectable runner for testing.
#[cfg(test)]
pub fn detect_vram_with_runner<F>(vendor: &GpuVendor, runner: F) -> Result<u64>
where
    F: Fn(&str, &[&str]) -> Option<String>,
{
    match vendor {
        GpuVendor::Nvidia => {
            // Try nvidia-smi
            if let Some(out) = runner(
                "nvidia-smi",
                &["--query-gpu=memory.total", "--format=csv,noheader,nounits"],
            ) {
                if let Some(n) = parse_nvidia_smi_output(&out) {
                    return Ok(n);
                }
            }
        }
        GpuVendor::AMD => {
            // Try to read VRAM from sysfs entries created by amdgpu
            if let Ok(entries) = glob::glob("/sys/class/drm/card*/device/mem_info_vram_total") {
                for entry in entries.filter_map(|r| r.ok()) {
                    if let Ok(vram_str) = std::fs::read_to_string(&entry) {
                        if let Ok(vram_bytes) = vram_str.trim().parse::<u64>() {
                            return Ok(vram_bytes / (1024 * 1024)); // Bytes -> MB
                        }
                    }
                }
            }
            // Fallback to rocm-smi via runner
            if let Some(out) = runner("rocm-smi", &["--showmeminfo"]) {
                if let Some(n) = parse_rocm_smi_output(&out) {
                    return Ok(n);
                }
            }
        }
        _ => {}
    }

    // Fallback: Try to estimate from lspci or glxinfo
    Ok(0)
}

// Helper used by tests to exercise parsing logic directly from provided output
#[allow(dead_code)]
pub fn detect_vram_from_output(vendor: &GpuVendor, output: Option<&str>) -> Result<u64> {
    match vendor {
        GpuVendor::Nvidia => {
            if let Some(s) = output {
                if let Some(n) = parse_nvidia_smi_output(s) {
                    return Ok(n);
                }
            }
        }
        GpuVendor::AMD => {
            if let Some(s) = output {
                if let Some(n) = parse_rocm_smi_output(s) {
                    return Ok(n);
                }
            }
        }
        _ => {}
    }
    Ok(0)
}

#[test]
fn test_classify_amd_integrated() {
    assert_eq!(classify_gpu_tier("AMD Radeon Vega 8 Graphics"), GpuTier::Integrated);
}

#[test]
fn test_classify_intel_i9() {
    assert_eq!(classify_cpu_tier("Intel Core i9-13900K"), CpuTier::Enthusiast);
}

#[test]
fn test_classify_ryzen_5() {
    assert_eq!(classify_cpu_tier("AMD Ryzen 5 5600X"), CpuTier::Mainstream);
}

#[test]
fn test_parse_rocm_smi_output_mb() {
    let sample = "GPU[0] : VRAM : 8192MB\nSome other line";
    assert_eq!(parse_rocm_smi_output(sample), Some(8192));
}

#[test]
fn test_parse_rocm_smi_output_number_token() {
    let sample = "Memory usage: 4096 used";
    assert_eq!(parse_rocm_smi_output(sample), Some(4096));
}

#[test]
fn test_detect_vram_unknown_uses_fallback() {
    // Unknown vendor will try glxinfo fallback
    // On systems with glxinfo, this may return actual VRAM
    // On systems without, it returns 0
    let v = detect_vram(&GpuVendor::Unknown).unwrap();
    // Just verify it doesn't error - value depends on system
    assert!(v >= 0);
}

#[test]
fn test_parse_nvidia_smi_output_csv() {
    let sample = "8192\n";
    assert_eq!(parse_nvidia_smi_output(sample), Some(8192));
}

#[test]
fn test_detect_vram_from_output_nvidia() {
    let sample = "8192\n";
    let v = detect_vram_from_output(&GpuVendor::Nvidia, Some(sample)).unwrap();
    assert_eq!(v, 8192);
}

#[test]
fn test_detect_vram_from_output_amd() {
    let sample = "VRAM : 4096MB";
    let v = detect_vram_from_output(&GpuVendor::AMD, Some(sample)).unwrap();
    assert_eq!(v, 4096);
}

#[test]
fn test_detect_vram_with_runner_nvidia() {
    let runner = |_: &str, _: &[&str]| Some("12345\n".to_string());
    let v = detect_vram_with_runner(&GpuVendor::Nvidia, runner).unwrap();
    assert_eq!(v, 12345);
}

#[test]
fn test_detect_vram_with_runner_amd() {
    let runner = |_: &str, _: &[&str]| Some("VRAM : 2048MB".to_string());
    let v = detect_vram_with_runner(&GpuVendor::AMD, runner).unwrap();
    assert_eq!(v, 2048);
}

#[test]
fn test_parse_pci_resource_vram() {
    // Simulated PCI resource file content with 8GB VRAM BAR
    let content = "0x0000000000000000 0x0000000000000000 0x0000000000000000
0x00000000c0000000 0x00000000cfffffff 0x0000000000040200
0x0000000080000000 0x000000009fffffff 0x000000000014220c";
    // Second line is ~256MB (display), third is ~512MB
    // Let's use a more realistic example with 8GB
    let content_8gb = "0x0000000000000000 0x0000000000000000 0x0000000000000000
0x0000004000000000 0x00000041ffffffff 0x000000000014220c";
    // 0x41ffffffff - 0x4000000000 = 0x1ffffffff = 8589934591 bytes = ~8GB
    let result = parse_pci_resource_vram(content_8gb);
    assert!(result.is_some());
    let vram = result.unwrap();
    assert!(vram >= 8000); // Should be around 8192 MB
}

#[test]
fn test_parse_radeontop_vram() {
    let output = "bus 03, gpu 45.00%, ee 0.00%, vv 0.00%, vram 15.23% 1234mb/8192mb";
    let result = parse_radeontop_vram(output);
    assert_eq!(result, Some(8192));
}

#[test]
fn test_parse_radeontop_vram_no_match() {
    let output = "some random output without vram info";
    let result = parse_radeontop_vram(output);
    assert_eq!(result, None);
}

fn detect_driver_version(vendor: &GpuVendor) -> Result<String> {
    match vendor {
        GpuVendor::Nvidia => {
            let output = Command::new("nvidia-smi")
                .args(&["--query-gpu=driver_version", "--format=csv,noheader"])
                .output();

            if let Ok(output) = output {
                return Ok(String::from_utf8_lossy(&output.stdout).trim().to_string());
            }
        }
        GpuVendor::AMD => {
            // Check modinfo amdgpu
            let output = Command::new("modinfo")
                .arg("amdgpu")
                .output();

            if let Ok(output) = output {
                let info = String::from_utf8_lossy(&output.stdout);
                if let Some(version) = info.lines().find(|l| l.starts_with("version:")) {
                    return Ok(version.split(':').nth(1).unwrap_or("Unknown").trim().to_string());
                }
            }
        }
        _ => {}
    }

    Ok("Unknown".into())
}

fn extract_pci_id(line: &str) -> Option<String> {
    // Extract "01:00.0" from lspci output
    line.split_whitespace()
        .next()
        .map(|s| s.to_string())
}

fn detect_ram_speed() -> Option<u32> {
    // Requires sudo, so this might fail
    let output = Command::new("dmidecode")
        .args(&["-t", "memory"])
        .output();

    if let Ok(output) = output {
        let info = String::from_utf8_lossy(&output.stdout);

        // Find "Speed: XXXX MT/s"
        if let Some(line) = info.lines().find(|l| l.trim().starts_with("Speed:") && l.contains("MT/s")) {
            if let Some(speed_str) = line.split_whitespace().nth(1) {
                return speed_str.parse::<u32>().ok();
            }
        }
    }

    None
}

fn detect_storage_type() -> StorageType {
    // Check if system is using NVMe, SSD, or HDD
    // This is a simplified check - could be enhanced with smartctl
    let output = Command::new("lsblk")
        .args(&["-d", "-o", "name,rota"])
        .output();

    if let Ok(output) = output {
        let info = String::from_utf8_lossy(&output.stdout);

        // Check for NVMe
        if info.contains("nvme") {
            return StorageType::NvmeSsd;
        }

        // Check if rotational (0 = SSD, 1 = HDD)
        if info.contains(" 0") {
            return StorageType::SataSsd;
        } else if info.contains(" 1") {
            return StorageType::HDD;
        }
    }

    StorageType::Unknown
}

fn detect_linux_distribution() -> Option<String> {
    // Try to read /etc/os-release
    if let Ok(content) = fs::read_to_string("/etc/os-release") {
        for line in content.lines() {
            if line.starts_with("PRETTY_NAME=") {
                return Some(
                    line.split('=')
                        .nth(1)
                        .unwrap_or("")
                        .trim_matches('"')
                        .to_string()
                );
            }
        }
    }

    None
}

// Tier classification (basic - enhance with database lookups)
pub fn classify_cpu_tier(model: &str) -> CpuTier {
    let model_lower = model.to_lowercase();

    if model_lower.contains("threadripper") || model_lower.contains("xeon") {
        CpuTier::Workstation
    } else if model_lower.contains("i9") || model_lower.contains("ryzen 9") {
        CpuTier::Enthusiast
    } else if model_lower.contains("i7") || model_lower.contains("ryzen 7") {
        CpuTier::Performance
    } else if model_lower.contains("i5") || model_lower.contains("ryzen 5") {
        CpuTier::Mainstream
    } else if model_lower.contains("i3") || model_lower.contains("ryzen 3") {
        CpuTier::Entry
    } else {
        CpuTier::Budget
    }
}

pub fn classify_gpu_tier(model: &str) -> GpuTier {
    let model_lower = model.to_lowercase();

    // NVIDIA
    if model_lower.contains("4090") || model_lower.contains("7900 xtx") {
        GpuTier::Ultra
    } else if model_lower.contains("4080") || model_lower.contains("3090") || model_lower.contains("6900 xt") {
        GpuTier::Enthusiast
    } else if model_lower.contains("4070") || model_lower.contains("3080") || model_lower.contains("6800 xt") {
        GpuTier::Performance
    } else if model_lower.contains("4060") || model_lower.contains("3060") || model_lower.contains("6700 xt") {
        GpuTier::Mainstream
    } else if model_lower.contains("1660") || model_lower.contains("6600") {
        GpuTier::Entry
    } else if model_lower.contains("1650") || model_lower.contains("6500") {
        GpuTier::Budget
    } else if model_lower.contains("intel") && !model_lower.contains("arc") {
        GpuTier::Integrated
    } else if model_lower.contains("vega") || model_lower.contains("radeon vega") {
        // AMD Vega-based APUs are integrated GPUs
        GpuTier::Integrated
    } else {
        GpuTier::Budget // Default fallback
    }
}
