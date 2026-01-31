use specpilot::hardware::platform::linux::{classify_cpu_tier, classify_gpu_tier};
use specpilot::hardware::{CpuTier, GpuTier};

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
