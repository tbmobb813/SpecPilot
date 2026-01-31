use crate::hardware::common::*;

#[derive(Debug, Clone)]
pub enum BottleneckType {
    CpuTier,
    GpuTier,
    RamInsufficient,
    VramInsufficient,
    StorageSlow,
    FeatureMissing(String),
    DriverOutdated,
}

#[derive(Debug, Clone)]
pub struct Bottleneck {
    pub btype: BottleneckType,
    pub severity: &'static str,
    pub issue: String,
    pub impact: String,
    pub recommendation: String,
}

impl Bottleneck {
    pub fn cpu_tier_gap(actual: &CpuInfo, required_tier: u8) -> Option<Bottleneck> {
        if (actual.tier as u8) < required_tier {
            Some(Bottleneck {
                btype: BottleneckType::CpuTier,
                severity: "major",
                issue: format!("CPU tier {} < required {}", actual.tier as u8, required_tier),
                impact: "CPU-limited performance".into(),
                recommendation: "Consider upgrading CPU or lowering CPU-heavy settings".into(),
            })
        } else {
            None
        }
    }
}
