use crate::hardware::common::*;
use crate::intelligence::bottleneck::{Bottleneck, BottleneckType};
use crate::intelligence::narrative::{NarrativeBlock, NarrativeBlockType, compose};

pub struct VerdictEngine {}

#[derive(Debug, Clone)]
pub enum VerdictStatus {
    Excellent,
    Good,
    Playable,
    Struggling,
    Unplayable,
}

pub struct VerdictResponse {
    pub status: VerdictStatus,
    pub narrative: String,
    pub bottlenecks: Vec<Bottleneck>,
}

// Minimal HardwareRequirement used by the rules engine tests and evaluation
#[derive(Debug, Clone)]
pub struct HardwareRequirement {
    pub cpu_tier_min: u8,
    pub gpu_tier_min: u8,
    pub ram_mb: u64,
    pub vram_mb: u64,
    // Optional score-based requirements (engine may approximate if raw scores unavailable)
    pub cpu_score_min: Option<u32>,
    pub gpu_score_min: Option<u32>,
    // Driver minimums for vendors (simple string comparison)
    pub driver_min_nvidia: Option<String>,
    pub require_ray_tracing: Option<bool>,
}

impl VerdictEngine {
    pub fn new() -> Self { VerdictEngine {} }

    pub fn evaluate(&self, hw: &HardwareProfile, req: &HardwareRequirement) -> VerdictResponse {
        let mut blocks: Vec<NarrativeBlock> = Vec::new();
        let mut bottlenecks: Vec<Bottleneck> = Vec::new();

        // Absolute checks
        if hw.memory.total < req.ram_mb {
            bottlenecks.push(Bottleneck {
                btype: BottleneckType::RamInsufficient,
                severity: "critical",
                issue: format!("RAM {}MB < required {}MB", hw.memory.total, req.ram_mb),
                impact: "Game may not run or will crash".into(),
                recommendation: "Add more RAM".into(),
            });
        }

        // CPU tier check
        if (hw.cpu.tier as u8) < req.cpu_tier_min {
            if let Some(b) = Bottleneck::cpu_tier_gap(&hw.cpu, req.cpu_tier_min) {
                bottlenecks.push(b);
            }
        }

        // GPU tier check (simple)
        if (hw.gpu.tier as u8) < req.gpu_tier_min {
            bottlenecks.push(Bottleneck {
                btype: BottleneckType::GpuTier,
                severity: "major",
                issue: format!("GPU tier {} < required {}", hw.gpu.tier as u8, req.gpu_tier_min),
                impact: "GPU-limited performance".into(),
                recommendation: "Lower graphics preset or upgrade GPU".into(),
            });
        }

        // VRAM check
        if hw.gpu.vram > 0 && hw.gpu.vram < req.vram_mb {
            bottlenecks.push(Bottleneck {
                btype: BottleneckType::VramInsufficient,
                severity: "major",
                issue: format!("VRAM {}MB < required {}MB", hw.gpu.vram, req.vram_mb),
                impact: "Texture quality/ stuttering".into(),
                recommendation: "Reduce texture quality or upgrade GPU".into(),
            });
        }

        // Score-based checks using estimated benchmark mappings
        if let Some(cpu_score_req) = req.cpu_score_min {
            let approx = estimate_cpu_score(hw);
            if approx < cpu_score_req {
                bottlenecks.push(Bottleneck {
                    btype: BottleneckType::CpuTier,
                    severity: "major",
                    issue: format!("CPU score approx {} < required {}", approx, cpu_score_req),
                    impact: "Lower CPU-bound performance".into(),
                    recommendation: "Consider CPU-bound setting reductions or upgrade".into(),
                });
            }
        }

        if let Some(gpu_score_req) = req.gpu_score_min {
            let approx = estimate_gpu_score(hw);
            if approx < gpu_score_req {
                bottlenecks.push(Bottleneck {
                    btype: BottleneckType::GpuTier,
                    severity: "major",
                    issue: format!("GPU score approx {} < required {}", approx, gpu_score_req),
                    impact: "Lower GPU-bound performance".into(),
                    recommendation: "Consider lowering GPU settings or upgrade".into(),
                });
            }
        }

        // Driver version checks (very simple numeric compare)
        if let Some(ref minv) = req.driver_min_nvidia {
            if let crate::hardware::common::GpuVendor::Nvidia = hw.gpu.vendor {
                if version_lt(&hw.gpu.driver_version, minv) {
                    bottlenecks.push(Bottleneck {
                        btype: BottleneckType::DriverOutdated,
                        severity: "major",
                        issue: format!("Driver {} < required {}", hw.gpu.driver_version, minv),
                        impact: "Known driver bugs or missing features".into(),
                        recommendation: "Update GPU drivers to the minimum recommended version".into(),
                    });
                }
            }
        }

        // Feature checks (ray tracing)
        if let Some(req_rt) = req.require_ray_tracing {
            if req_rt {
                let has_rt = hw.graphics_api.vulkan.as_ref().map(|v| v.ray_tracing)
                    .or_else(|| hw.graphics_api.directx.as_ref().map(|d| d.ray_tracing))
                    .unwrap_or(false);
                if !has_rt {
                    bottlenecks.push(Bottleneck {
                        btype: BottleneckType::FeatureMissing("ray_tracing".into()),
                        severity: "major",
                        issue: "Ray tracing not supported on detected APIs".into(),
                        impact: "Visual features unavailable or degraded performance if forced".into(),
                        recommendation: "Disable ray tracing or use a GPU with RT support".into(),
                    });
                }
            }
        }

        // Compose narrative blocks
        let status = if bottlenecks.iter().any(|b| b.severity == "critical") {
            blocks.push(NarrativeBlock { block_type: NarrativeBlockType::Warning, text: "Critical requirements missing; game likely unplayable.".into(), priority: 1});
            VerdictStatus::Unplayable
        } else if bottlenecks.len() >= 2 {
            blocks.push(NarrativeBlock { block_type: NarrativeBlockType::Bottleneck, text: "Multiple bottlenecks detected; expect degraded performance.".into(), priority: 2});
            VerdictStatus::Struggling
        } else if bottlenecks.len() == 1 {
            blocks.push(NarrativeBlock { block_type: NarrativeBlockType::Bottleneck, text: "One bottleneck detected; consider lowering settings.".into(), priority: 2});
            VerdictStatus::Playable
        } else {
            blocks.push(NarrativeBlock { block_type: NarrativeBlockType::Verdict, text: "Your system meets the requirements.".into(), priority: 1});
            VerdictStatus::Excellent
        };

        // Add tips
        if status == VerdictStatus::Playable || status == VerdictStatus::Struggling {
            blocks.push(NarrativeBlock { block_type: NarrativeBlockType::Tip, text: "Tip: Try lowering resolution or presets to improve performance.".into(), priority: 10});
        }

        let narrative = compose(&mut blocks);

        VerdictResponse { status, narrative, bottlenecks }
    }
}

// simple dotted-version comparison: returns true if a < b
fn version_lt(a: &str, b: &str) -> bool {
    let pa: Vec<u32> = a.split('.').filter_map(|s| s.parse::<u32>().ok()).collect();
    let pb: Vec<u32> = b.split('.').filter_map(|s| s.parse::<u32>().ok()).collect();
    let n = pa.len().max(pb.len());
    for i in 0..n {
        let va = *pa.get(i).unwrap_or(&0);
        let vb = *pb.get(i).unwrap_or(&0);
        if va < vb { return true; }
        if va > vb { return false; }
    }
    false
}

// Estimate CPU score from hardware profile. This is a heuristic mapping used
// for rules where exact benchmark data is unavailable.
fn estimate_cpu_score(hw: &crate::hardware::common::HardwareProfile) -> u32 {
    // Prefer seeded lookup table when available
    if let Some(s) = crate::intelligence::lookup::get_cpu_score_for_model(&hw.cpu.model) {
        return s;
    }

    // Fallback heuristic
    let base = hw.cpu.base_clock.max(0.5); // GHz
    let cores = hw.cpu.cores.max(1) as f32;
    let tier_multiplier = match hw.cpu.tier {
        crate::hardware::common::CpuTier::Budget => 0.6,
        crate::hardware::common::CpuTier::Entry => 0.8,
        crate::hardware::common::CpuTier::Mainstream => 1.0,
        crate::hardware::common::CpuTier::Performance => 1.2,
        crate::hardware::common::CpuTier::Enthusiast => 1.4,
        crate::hardware::common::CpuTier::Workstation => 1.5,
    };
    let score = base * cores * 2000.0 * tier_multiplier; // scale to ~0-20000
    score as u32
}

// Estimate GPU score from hardware profile. Uses tier baseline plus small VRAM bonus.
fn estimate_gpu_score(hw: &crate::hardware::common::HardwareProfile) -> u32 {
    // Prefer seeded lookup table when available
    if let Some(s) = crate::intelligence::lookup::get_gpu_score_for_model(&hw.gpu.model) {
        return s;
    }

    let tier_base = match hw.gpu.tier {
        crate::hardware::common::GpuTier::Integrated => 500,
        crate::hardware::common::GpuTier::Budget => 2000,
        crate::hardware::common::GpuTier::Entry => 4000,
        crate::hardware::common::GpuTier::Mainstream => 7000,
        crate::hardware::common::GpuTier::Performance => 9000,
        crate::hardware::common::GpuTier::Enthusiast => 11000,
        crate::hardware::common::GpuTier::Ultra => 14000,
    };
    // VRAM contribution (capped)
    let vram_bonus = ((hw.gpu.vram as f32 / 1024.0) * 1500.0) as u32; // per GB
    tier_base + vram_bonus
}
