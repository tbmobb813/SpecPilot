use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemCheck {
    pub id: String,
    pub name: String,
    pub status: CheckStatus,
    pub message: String,
    pub details: Option<String>,
    pub action: Option<CheckAction>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CheckStatus {
    Good,
    Warning,
    Bad,
    Info,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CheckAction {
    pub label: String,
    pub command: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReadyUpReport {
    pub overall_status: CheckStatus,
    pub checks: Vec<SystemCheck>,
    pub summary: String,
}

#[tauri::command]
pub async fn run_readyup_checks() -> Result<ReadyUpReport, String> {
    let mut checks = Vec::new();

    // Memory check
    checks.push(check_memory());

    // Storage check
    checks.push(check_storage());

    // CPU load check
    checks.push(check_cpu_load());

    // GPU driver check
    checks.push(check_gpu_driver());

    // Linux-specific checks
    #[cfg(target_os = "linux")]
    {
        checks.push(check_compositor());
        checks.push(check_gamemode());
        checks.push(check_proton());
    }

    // Power profile check
    #[cfg(target_os = "linux")]
    checks.push(check_power_profile());

    // High memory processes
    checks.push(check_memory_hogs());

    // Calculate overall status
    let overall_status = calculate_overall_status(&checks);
    let summary = generate_summary(&checks, &overall_status);

    Ok(ReadyUpReport {
        overall_status,
        checks,
        summary,
    })
}

fn check_memory() -> SystemCheck {
    #[cfg(target_os = "linux")]
    {
        if let Ok(meminfo) = std::fs::read_to_string("/proc/meminfo") {
            let mut total_kb = 0u64;
            let mut available_kb = 0u64;

            for line in meminfo.lines() {
                if line.starts_with("MemTotal:") {
                    if let Some(val) = line.split_whitespace().nth(1) {
                        total_kb = val.parse().unwrap_or(0);
                    }
                } else if line.starts_with("MemAvailable:") {
                    if let Some(val) = line.split_whitespace().nth(1) {
                        available_kb = val.parse().unwrap_or(0);
                    }
                }
            }

            let total_gb = total_kb as f64 / 1024.0 / 1024.0;
            let available_gb = available_kb as f64 / 1024.0 / 1024.0;
            let used_percent = ((total_kb - available_kb) as f64 / total_kb as f64) * 100.0;

            let (status, message) = if available_gb >= 8.0 {
                (CheckStatus::Good, format!("{:.1} GB available", available_gb))
            } else if available_gb >= 4.0 {
                (CheckStatus::Warning, format!("{:.1} GB available - consider closing some apps", available_gb))
            } else {
                (CheckStatus::Bad, format!("Only {:.1} GB available - close apps before gaming", available_gb))
            };

            return SystemCheck {
                id: "memory".to_string(),
                name: "Available RAM".to_string(),
                status,
                message,
                details: Some(format!("{:.1} GB / {:.1} GB ({:.0}% used)", total_gb - available_gb, total_gb, used_percent)),
                action: if available_gb < 4.0 {
                    Some(CheckAction {
                        label: "See memory usage".to_string(),
                        command: Some("ps aux --sort=-%mem | head -10".to_string()),
                    })
                } else {
                    None
                },
            };
        }
    }

    SystemCheck {
        id: "memory".to_string(),
        name: "Available RAM".to_string(),
        status: CheckStatus::Info,
        message: "Unable to check memory".to_string(),
        details: None,
        action: None,
    }
}

fn check_storage() -> SystemCheck {
    #[cfg(target_os = "linux")]
    {
        let output = Command::new("df")
            .args(["-h", "/home"])
            .output();

        if let Ok(output) = output {
            let stdout = String::from_utf8_lossy(&output.stdout);
            // Parse df output: Filesystem Size Used Avail Use% Mounted
            if let Some(line) = stdout.lines().nth(1) {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 4 {
                    let available = parts[3];
                    let use_percent = parts[4].trim_end_matches('%');

                    let status = if let Ok(pct) = use_percent.parse::<u32>() {
                        if pct >= 95 {
                            CheckStatus::Bad
                        } else if pct >= 85 {
                            CheckStatus::Warning
                        } else {
                            CheckStatus::Good
                        }
                    } else {
                        CheckStatus::Info
                    };

                    return SystemCheck {
                        id: "storage".to_string(),
                        name: "Disk Space".to_string(),
                        status,
                        message: format!("{} available", available),
                        details: Some(format!("{}% used", use_percent)),
                        action: None,
                    };
                }
            }
        }
    }

    SystemCheck {
        id: "storage".to_string(),
        name: "Disk Space".to_string(),
        status: CheckStatus::Info,
        message: "Unable to check storage".to_string(),
        details: None,
        action: None,
    }
}

fn check_cpu_load() -> SystemCheck {
    #[cfg(target_os = "linux")]
    {
        if let Ok(loadavg) = std::fs::read_to_string("/proc/loadavg") {
            let parts: Vec<&str> = loadavg.split_whitespace().collect();
            if let Some(load_1min) = parts.first() {
                if let Ok(load) = load_1min.parse::<f64>() {
                    // Get CPU count
                    let cpu_count = std::thread::available_parallelism()
                        .map(|p| p.get() as f64)
                        .unwrap_or(4.0);

                    let load_percent = (load / cpu_count) * 100.0;

                    let (status, message) = if load_percent < 50.0 {
                        (CheckStatus::Good, format!("Load: {:.1} ({:.0}% of capacity)", load, load_percent))
                    } else if load_percent < 80.0 {
                        (CheckStatus::Warning, format!("Load: {:.1} ({:.0}% - moderate)", load, load_percent))
                    } else {
                        (CheckStatus::Bad, format!("Load: {:.1} ({:.0}% - high!)", load, load_percent))
                    };

                    return SystemCheck {
                        id: "cpu_load".to_string(),
                        name: "CPU Load".to_string(),
                        status,
                        message,
                        details: Some(format!("{} CPU cores detected", cpu_count as u32)),
                        action: None,
                    };
                }
            }
        }
    }

    SystemCheck {
        id: "cpu_load".to_string(),
        name: "CPU Load".to_string(),
        status: CheckStatus::Info,
        message: "Unable to check CPU load".to_string(),
        details: None,
        action: None,
    }
}

fn check_gpu_driver() -> SystemCheck {
    #[cfg(target_os = "linux")]
    {
        // Check NVIDIA
        let nvidia_output = Command::new("nvidia-smi")
            .args(["--query-gpu=driver_version", "--format=csv,noheader"])
            .output();

        if let Ok(output) = nvidia_output {
            if output.status.success() {
                let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
                return SystemCheck {
                    id: "gpu_driver".to_string(),
                    name: "GPU Driver".to_string(),
                    status: CheckStatus::Good,
                    message: format!("NVIDIA driver {}", version),
                    details: Some("NVIDIA proprietary driver detected".to_string()),
                    action: None,
                };
            }
        }

        // Check AMD/Mesa
        let glxinfo = Command::new("glxinfo")
            .args(["-B"])
            .output();

        if let Ok(output) = glxinfo {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let mut driver_info = String::new();

            for line in stdout.lines() {
                if line.contains("OpenGL version") || line.contains("Device:") {
                    driver_info = line.split(':').nth(1).unwrap_or("").trim().to_string();
                    break;
                }
            }

            if !driver_info.is_empty() {
                return SystemCheck {
                    id: "gpu_driver".to_string(),
                    name: "GPU Driver".to_string(),
                    status: CheckStatus::Good,
                    message: "Mesa/AMD driver detected".to_string(),
                    details: Some(driver_info),
                    action: None,
                };
            }
        }
    }

    SystemCheck {
        id: "gpu_driver".to_string(),
        name: "GPU Driver".to_string(),
        status: CheckStatus::Warning,
        message: "Unable to detect GPU driver".to_string(),
        details: None,
        action: None,
    }
}

#[cfg(target_os = "linux")]
fn check_compositor() -> SystemCheck {
    // Check for common compositors
    let compositors = [
        ("picom", "Picom"),
        ("compton", "Compton"),
        ("kwin_x11", "KWin"),
        ("mutter", "Mutter/GNOME"),
        ("marco", "Marco/MATE"),
        ("xfwm4", "Xfwm4"),
    ];

    let output = Command::new("pgrep")
        .args(["-l", "-f", "compos|picom|kwin|mutter|marco|xfwm"])
        .output();

    if let Ok(output) = output {
        let stdout = String::from_utf8_lossy(&output.stdout);
        if !stdout.trim().is_empty() {
            // Compositor is running
            let mut detected = "Unknown compositor";
            for (proc, name) in compositors {
                if stdout.contains(proc) {
                    detected = name;
                    break;
                }
            }

            return SystemCheck {
                id: "compositor".to_string(),
                name: "Compositor".to_string(),
                status: CheckStatus::Warning,
                message: format!("{} running - may cause stuttering", detected),
                details: Some("Consider disabling for fullscreen games".to_string()),
                action: Some(CheckAction {
                    label: "Learn more".to_string(),
                    command: None,
                }),
            };
        }
    }

    // Check if running Wayland (compositing is mandatory)
    if std::env::var("WAYLAND_DISPLAY").is_ok() {
        return SystemCheck {
            id: "compositor".to_string(),
            name: "Compositor".to_string(),
            status: CheckStatus::Info,
            message: "Wayland session detected".to_string(),
            details: Some("Compositor cannot be disabled on Wayland".to_string()),
            action: None,
        };
    }

    SystemCheck {
        id: "compositor".to_string(),
        name: "Compositor".to_string(),
        status: CheckStatus::Good,
        message: "No compositor detected".to_string(),
        details: Some("Good for gaming performance".to_string()),
        action: None,
    }
}

#[cfg(target_os = "linux")]
fn check_gamemode() -> SystemCheck {
    // Check if GameMode is installed
    let which_output = Command::new("which")
        .arg("gamemoderun")
        .output();

    let installed = which_output
        .map(|o| o.status.success())
        .unwrap_or(false);

    if installed {
        // Check if GameMode daemon is running
        let pgrep = Command::new("pgrep")
            .args(["-x", "gamemoded"])
            .output();

        let running = pgrep.map(|o| o.status.success()).unwrap_or(false);

        if running {
            return SystemCheck {
                id: "gamemode".to_string(),
                name: "GameMode".to_string(),
                status: CheckStatus::Good,
                message: "GameMode is active".to_string(),
                details: Some("CPU governor and GPU optimizations enabled".to_string()),
                action: None,
            };
        } else {
            return SystemCheck {
                id: "gamemode".to_string(),
                name: "GameMode".to_string(),
                status: CheckStatus::Info,
                message: "GameMode installed but not active".to_string(),
                details: Some("Launch games with 'gamemoderun' for better performance".to_string()),
                action: Some(CheckAction {
                    label: "gamemoderun %command%".to_string(),
                    command: Some("gamemoderun".to_string()),
                }),
            };
        }
    }

    SystemCheck {
        id: "gamemode".to_string(),
        name: "GameMode".to_string(),
        status: CheckStatus::Info,
        message: "GameMode not installed".to_string(),
        details: Some("Install feral-gamemode for automatic optimizations".to_string()),
        action: Some(CheckAction {
            label: "Install GameMode".to_string(),
            command: None,
        }),
    }
}

#[cfg(target_os = "linux")]
fn check_proton() -> SystemCheck {
    // Check for Proton-GE or standard Proton
    let home = std::env::var("HOME").unwrap_or_default();
    let ge_path = format!("{}/.steam/root/compatibilitytools.d", home);

    if std::path::Path::new(&ge_path).exists() {
        if let Ok(entries) = std::fs::read_dir(&ge_path) {
            let ge_versions: Vec<String> = entries
                .filter_map(|e| e.ok())
                .filter_map(|e| e.file_name().into_string().ok())
                .filter(|n| n.contains("GE-Proton") || n.contains("Proton"))
                .collect();

            if !ge_versions.is_empty() {
                let latest = ge_versions.first().unwrap();
                return SystemCheck {
                    id: "proton".to_string(),
                    name: "Proton/Wine".to_string(),
                    status: CheckStatus::Good,
                    message: format!("{} available", latest),
                    details: Some(format!("{} versions installed", ge_versions.len())),
                    action: None,
                };
            }
        }
    }

    // Check standard Steam Proton
    let steam_proton = format!("{}/.steam/steam/steamapps/common", home);
    if std::path::Path::new(&steam_proton).exists() {
        if let Ok(entries) = std::fs::read_dir(&steam_proton) {
            let proton_versions: Vec<String> = entries
                .filter_map(|e| e.ok())
                .filter_map(|e| e.file_name().into_string().ok())
                .filter(|n| n.starts_with("Proton"))
                .collect();

            if !proton_versions.is_empty() {
                return SystemCheck {
                    id: "proton".to_string(),
                    name: "Proton/Wine".to_string(),
                    status: CheckStatus::Good,
                    message: "Steam Proton available".to_string(),
                    details: Some(format!("{} versions", proton_versions.len())),
                    action: None,
                };
            }
        }
    }

    SystemCheck {
        id: "proton".to_string(),
        name: "Proton/Wine".to_string(),
        status: CheckStatus::Info,
        message: "No Proton detected".to_string(),
        details: Some("Install Steam and enable Proton for Windows games".to_string()),
        action: None,
    }
}

#[cfg(target_os = "linux")]
fn check_power_profile() -> SystemCheck {
    // Check powerprofilesctl (modern systems)
    let ppc = Command::new("powerprofilesctl")
        .arg("get")
        .output();

    if let Ok(output) = ppc {
        if output.status.success() {
            let profile = String::from_utf8_lossy(&output.stdout).trim().to_string();
            let (status, message) = match profile.as_str() {
                "performance" => (CheckStatus::Good, "Performance mode active".to_string()),
                "balanced" => (CheckStatus::Info, "Balanced mode - consider 'performance' for gaming".to_string()),
                "power-saver" => (CheckStatus::Warning, "Power saver mode - switch to 'performance'".to_string()),
                _ => (CheckStatus::Info, format!("Profile: {}", profile)),
            };

            return SystemCheck {
                id: "power".to_string(),
                name: "Power Profile".to_string(),
                status,
                message,
                details: None,
                action: if profile != "performance" {
                    Some(CheckAction {
                        label: "Set to performance".to_string(),
                        command: Some("powerprofilesctl set performance".to_string()),
                    })
                } else {
                    None
                },
            };
        }
    }

    // Fallback: check CPU governor
    if let Ok(governor) = std::fs::read_to_string("/sys/devices/system/cpu/cpu0/cpufreq/scaling_governor") {
        let gov = governor.trim();
        let (status, message) = match gov {
            "performance" => (CheckStatus::Good, "CPU governor: performance".to_string()),
            "schedutil" | "ondemand" => (CheckStatus::Info, format!("CPU governor: {} (dynamic)", gov)),
            "powersave" => (CheckStatus::Warning, "CPU governor: powersave - not ideal for gaming".to_string()),
            _ => (CheckStatus::Info, format!("CPU governor: {}", gov)),
        };

        return SystemCheck {
            id: "power".to_string(),
            name: "Power Profile".to_string(),
            status,
            message,
            details: None,
            action: None,
        };
    }

    SystemCheck {
        id: "power".to_string(),
        name: "Power Profile".to_string(),
        status: CheckStatus::Info,
        message: "Unable to detect power profile".to_string(),
        details: None,
        action: None,
    }
}

fn check_memory_hogs() -> SystemCheck {
    #[cfg(target_os = "linux")]
    {
        let output = Command::new("ps")
            .args(["axo", "comm,%mem", "--sort=-%mem"])
            .output();

        if let Ok(output) = output {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let mut high_mem_procs: Vec<String> = Vec::new();

            for line in stdout.lines().skip(1).take(5) {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 2 {
                    if let Ok(mem) = parts[1].parse::<f32>() {
                        if mem >= 3.0 {
                            high_mem_procs.push(format!("{} ({:.1}%)", parts[0], mem));
                        }
                    }
                }
            }

            if high_mem_procs.is_empty() {
                return SystemCheck {
                    id: "memory_hogs".to_string(),
                    name: "Background Apps".to_string(),
                    status: CheckStatus::Good,
                    message: "No memory-heavy apps detected".to_string(),
                    details: None,
                    action: None,
                };
            } else {
                return SystemCheck {
                    id: "memory_hogs".to_string(),
                    name: "Background Apps".to_string(),
                    status: CheckStatus::Warning,
                    message: format!("{} memory-heavy apps running", high_mem_procs.len()),
                    details: Some(high_mem_procs.join(", ")),
                    action: Some(CheckAction {
                        label: "Consider closing unused apps".to_string(),
                        command: None,
                    }),
                };
            }
        }
    }

    SystemCheck {
        id: "memory_hogs".to_string(),
        name: "Background Apps".to_string(),
        status: CheckStatus::Info,
        message: "Unable to check background apps".to_string(),
        details: None,
        action: None,
    }
}

fn calculate_overall_status(checks: &[SystemCheck]) -> CheckStatus {
    let has_bad = checks.iter().any(|c| matches!(c.status, CheckStatus::Bad));
    let has_warning = checks.iter().any(|c| matches!(c.status, CheckStatus::Warning));

    if has_bad {
        CheckStatus::Bad
    } else if has_warning {
        CheckStatus::Warning
    } else {
        CheckStatus::Good
    }
}

fn generate_summary(checks: &[SystemCheck], overall: &CheckStatus) -> String {
    let good_count = checks.iter().filter(|c| matches!(c.status, CheckStatus::Good)).count();
    let warning_count = checks.iter().filter(|c| matches!(c.status, CheckStatus::Warning)).count();
    let bad_count = checks.iter().filter(|c| matches!(c.status, CheckStatus::Bad)).count();

    match overall {
        CheckStatus::Good => format!("All {} checks passed! Your system is ready for gaming.", good_count),
        CheckStatus::Warning => format!("{} checks good, {} warnings. Gaming should be fine, but could be better.", good_count, warning_count),
        CheckStatus::Bad => format!("{} issues found. Consider fixing them before gaming.", bad_count),
        CheckStatus::Info => "System check complete.".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calculate_overall_status() {
        let checks = vec![
            SystemCheck {
                id: "test".to_string(),
                name: "Test".to_string(),
                status: CheckStatus::Good,
                message: "OK".to_string(),
                details: None,
                action: None,
            },
        ];
        assert!(matches!(calculate_overall_status(&checks), CheckStatus::Good));
    }
}
