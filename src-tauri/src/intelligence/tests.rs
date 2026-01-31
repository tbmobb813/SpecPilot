#[cfg(test)]
mod tests {
    use crate::intelligence::rules::{VerdictEngine, HardwareRequirement, VerdictStatus};
    use crate::hardware::common::{HardwareProfile, CpuInfo, GpuInfo, MemoryInfo, StorageInfo, OsInfo, GraphicsApiSupport, CpuTier, GpuTier, GpuVendor, StorageType};
    use crate::intelligence::narrative::{NarrativeBlock, NarrativeBlockType, compose};
    use crate::intelligence::bottleneck::Bottleneck;

    fn make_hw(cpu_tier: CpuTier, gpu_tier: GpuTier, ram_mb: u64, vram_mb: u64) -> HardwareProfile {
        HardwareProfile {
            cpu: CpuInfo {
                model: "TestCPU".into(),
                vendor: "TestVendor".into(),
                cores: 4,
                threads: 8,
                base_clock: 3.5,
                boost_clock: None,
                architecture: "x86_64".into(),
                tier: cpu_tier,
            },
            gpu: GpuInfo {
                model: "TestGPU".into(),
                vendor: GpuVendor::Nvidia,
                vram: vram_mb,
                driver_version: "n/a".into(),
                pci_id: None,
                tier: gpu_tier,
            },
            memory: MemoryInfo { total: ram_mb, available: ram_mb, speed: None, ddr_type: None },
            storage: StorageInfo { total: 512, available: 256, storage_type: StorageType::NvmeSsd },
            os: OsInfo { platform: "linux".into(), version: "1.0".into(), distribution: None },
            graphics_api: GraphicsApiSupport { directx: None, vulkan: None, opengl: None, metal: None },
        }
    }

    #[test]
    fn test_verdict_excellent() {
        let engine = VerdictEngine::new();
        let hw = make_hw(CpuTier::Mainstream, GpuTier::Mainstream, 16000, 8192);
        let req = HardwareRequirement { cpu_tier_min: 3, gpu_tier_min: 4, ram_mb: 8000, vram_mb: 4096 };
        let res = engine.evaluate(&hw, &req);
        assert!(matches!(res.status, VerdictStatus::Excellent));
    }

    #[test]
    fn test_verdict_unplayable_due_to_ram() {
        let engine = VerdictEngine::new();
        let hw = make_hw(CpuTier::Mainstream, GpuTier::Mainstream, 4000, 8192);
        let req = HardwareRequirement { cpu_tier_min: 3, gpu_tier_min: 4, ram_mb: 8000, vram_mb: 4096 };
        let res = engine.evaluate(&hw, &req);
        assert!(matches!(res.status, VerdictStatus::Unplayable));
        assert!(res.bottlenecks.iter().any(|b| matches!(b.btype, crate::intelligence::bottleneck::BottleneckType::RamInsufficient)));
    }

    #[test]
    fn test_single_bottleneck_playable() {
        let engine = VerdictEngine::new();
        // CPU tier below requirement only
        let hw = make_hw(CpuTier::Entry, GpuTier::Mainstream, 16000, 8192);
        let req = HardwareRequirement { cpu_tier_min: 3, gpu_tier_min: 4, ram_mb: 8000, vram_mb: 4096 };
        let res = engine.evaluate(&hw, &req);
        assert!(matches!(res.status, VerdictStatus::Playable));
        assert_eq!(res.bottlenecks.len(), 1);
    }

    #[test]
    fn test_multiple_bottlenecks_struggling() {
        let engine = VerdictEngine::new();
        // CPU and GPU below requirement
        let hw = make_hw(CpuTier::Entry, GpuTier::Entry, 16000, 2048);
        let req = HardwareRequirement { cpu_tier_min: 3, gpu_tier_min: 4, ram_mb: 8000, vram_mb: 4096 };
        let res = engine.evaluate(&hw, &req);
        assert!(matches!(res.status, VerdictStatus::Struggling));
        assert!(res.bottlenecks.len() >= 2);
    }

    #[test]
    fn test_unknown_vram_does_not_flag() {
        let engine = VerdictEngine::new();
        // vram == 0 should not trigger vram bottleneck
        let hw = make_hw(CpuTier::Mainstream, GpuTier::Mainstream, 16000, 0);
        let req = HardwareRequirement { cpu_tier_min: 3, gpu_tier_min: 4, ram_mb: 8000, vram_mb: 4096 };
        let res = engine.evaluate(&hw, &req);
        // should still be excellent because vram unknown isn't considered
        assert!(matches!(res.status, VerdictStatus::Excellent));
    }
}

    #[test]
    fn test_narrative_compose_order() {
        let mut blocks = vec![
            NarrativeBlock { block_type: NarrativeBlockType::Tip, text: "low".into(), priority: 10 },
            NarrativeBlock { block_type: NarrativeBlockType::Verdict, text: "high".into(), priority: 1 },
            NarrativeBlock { block_type: NarrativeBlockType::Performance, text: "mid".into(), priority: 5 },
        ];
        let out = compose(&mut blocks);
        assert_eq!(out, "high\nmid\nlow");
    }

    #[test]
    fn test_bottleneck_cpu_gap_fields() {
        // Create a CpuInfo with lower tier
        let cpu = CpuInfo {
            model: "TestCPU".into(),
            vendor: "V".into(),
            cores: 2,
            threads: 4,
            base_clock: 2.5,
            boost_clock: None,
            architecture: "x86_64".into(),
            tier: CpuTier::Entry,
        };

        let maybe = Bottleneck::cpu_tier_gap(&cpu, 3);
        assert!(maybe.is_some());
        let b = maybe.unwrap();
        assert_eq!(b.severity, "major");
        assert!(b.issue.contains("CPU tier"));
        assert!(b.recommendation.contains("upgrade") || b.recommendation.contains("lower"));
    }

    #[test]
    fn test_bottleneck_cpu_no_gap() {
        let cpu = CpuInfo {
            model: "TestCPU".into(),
            vendor: "V".into(),
            cores: 8,
            threads: 16,
            base_clock: 3.5,
            boost_clock: None,
            architecture: "x86_64".into(),
            tier: CpuTier::Mainstream,
        };
        let maybe = Bottleneck::cpu_tier_gap(&cpu, 3);
        assert!(maybe.is_none());
    }

    #[test]
    fn test_driver_version_check() {
        let engine = VerdictEngine::new();
        let mut hw = make_hw(CpuTier::Mainstream, GpuTier::Mainstream, 16000, 8192);
        hw.gpu.driver_version = "535.86".into();
        let req = HardwareRequirement { cpu_tier_min: 3, gpu_tier_min: 4, ram_mb: 8000, vram_mb: 4096, cpu_score_min: None, gpu_score_min: None, driver_min_nvidia: Some("536.23".into()), require_ray_tracing: None };
        let res = engine.evaluate(&hw, &req);
        assert!(res.bottlenecks.iter().any(|b| matches!(b.btype, crate::intelligence::bottleneck::BottleneckType::DriverOutdated)));
    }

    #[test]
    fn test_feature_ray_tracing_missing() {
        let engine = VerdictEngine::new();
        let mut hw = make_hw(CpuTier::Mainstream, GpuTier::Mainstream, 16000, 8192);
        // ensure no RT support in graphics_api
        hw.graphics_api.vulkan = None;
        hw.graphics_api.directx = None;
        let req = HardwareRequirement { cpu_tier_min: 3, gpu_tier_min: 4, ram_mb: 8000, vram_mb: 4096, cpu_score_min: None, gpu_score_min: None, driver_min_nvidia: None, require_ray_tracing: Some(true) };
        let res = engine.evaluate(&hw, &req);
        assert!(res.bottlenecks.iter().any(|b| matches!(b.btype, crate::intelligence::bottleneck::BottleneckType::FeatureMissing(_))));
    }

    #[test]
    fn test_score_based_cpu_check() {
        let engine = VerdictEngine::new();
        // base_clock 2.0GHz -> approx 2000
        let hw = make_hw(CpuTier::Mainstream, GpuTier::Mainstream, 16000, 8192);
        let req = HardwareRequirement { cpu_tier_min: 3, gpu_tier_min: 4, ram_mb: 8000, vram_mb: 4096, cpu_score_min: Some(3000), gpu_score_min: None, driver_min_nvidia: None, require_ray_tracing: None };
        let res = engine.evaluate(&hw, &req);
        // our make_hw uses base_clock 3.5 so approx 3500, should pass
        assert!(!res.bottlenecks.iter().any(|b| matches!(b.btype, crate::intelligence::bottleneck::BottleneckType::CpuTier)));
    }
