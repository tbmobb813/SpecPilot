use super::super::common::*;
use std::collections::HashMap;
use wmi::{COMLibrary, Variant, WMIConnection};

pub fn detect_cpu() -> Result<CpuInfo> {
    let com_con = COMLibrary::new()
        .map_err(|e| HardwareError::CpuDetectionError(e.to_string()))?;
    let wmi_con = WMIConnection::new(com_con.into())
        .map_err(|e| HardwareError::CpuDetectionError(e.to_string()))?;

    let results: Vec<HashMap<String, Variant>> = wmi_con
        .raw_query("SELECT * FROM Win32_Processor")
        .map_err(|e| HardwareError::CpuDetectionError(e.to_string()))?;

    let cpu = results.first()
        .ok_or_else(|| HardwareError::CpuDetectionError("No CPU found".into()))?;

    let model = get_string_field(cpu, "Name")
        .unwrap_or_else(|| "Unknown CPU".into());

    let cores = get_u32_field(cpu, "NumberOfCores")
        .unwrap_or(1);

    let threads = get_u32_field(cpu, "NumberOfLogicalProcessors")
        .unwrap_or(cores);

    let base_clock = get_u32_field(cpu, "MaxClockSpeed")
        .map(|mhz| mhz as f32 / 1000.0)
        .unwrap_or(0.0);

    let vendor = get_string_field(cpu, "Manufacturer")
        .unwrap_or_else(|| "Unknown".into());

    let tier = classify_cpu_tier(&model);

    Ok(CpuInfo {
        model,
        vendor,
        cores,
        threads,
        base_clock,
        boost_clock: None,
        architecture: std::env::consts::ARCH.to_string(),
        tier,
    })
}

pub fn detect_gpu() -> Result<GpuInfo> {
    let com_con = COMLibrary::new()
        .map_err(|e| HardwareError::GpuDetectionError(e.to_string()))?;
    let wmi_con = WMIConnection::new(com_con.into())
        .map_err(|e| HardwareError::GpuDetectionError(e.to_string()))?;

    let results: Vec<HashMap<String, Variant>> = wmi_con
        .raw_query("SELECT * FROM Win32_VideoController")
        .map_err(|e| HardwareError::GpuDetectionError(e.to_string()))?;

    let gpu = results.first()
        .ok_or_else(|| HardwareError::GpuDetectionError("No GPU found".into()))?;

    let model = get_string_field(gpu, "Name")
        .unwrap_or_else(|| "Unknown GPU".into());

    let vram = get_u64_field(gpu, "AdapterRAM")
        .map(|bytes| bytes / (1024 * 1024)) // Convert to MB
        .unwrap_or(0);

    let driver_version = get_string_field(gpu, "DriverVersion")
        .unwrap_or_else(|| "Unknown".into());

    let vendor = if model.to_lowercase().contains("nvidia") {
        GpuVendor::Nvidia
    } else if model.to_lowercase().contains("amd") || model.to_lowercase().contains("radeon") {
        GpuVendor::AMD
    } else if model.to_lowercase().contains("intel") {
        GpuVendor::Intel
    } else {
        GpuVendor::Unknown
    };

    let tier = classify_gpu_tier(&model);

    Ok(GpuInfo {
        model,
        vendor,
        vram,
        driver_version,
        pci_id: None,
        tier,
    })
}

pub fn detect_memory() -> Result<MemoryInfo> {
    use windows::Win32::System::SystemInformation::*;

    unsafe {
        let mut mem_status = MEMORYSTATUSEX::default();
        mem_status.dwLength = std::mem::size_of::<MEMORYSTATUSEX>() as u32;

        GlobalMemoryStatusEx(&mut mem_status)
            .map_err(|e| HardwareError::MemoryDetectionError(e.to_string()))?;

        Ok(MemoryInfo {
            total: (mem_status.ullTotalPhys / (1024 * 1024)) as u64,
            available: (mem_status.ullAvailPhys / (1024 * 1024)) as u64,
            speed: None, // Could query WMI for this
            ddr_type: None,
        })
    }
}

pub fn detect_storage() -> Result<StorageInfo> {
    let com_con = COMLibrary::new()
        .map_err(|e| HardwareError::StorageDetectionError(e.to_string()))?;
    let wmi_con = WMIConnection::new(com_con.into())
        .map_err(|e| HardwareError::StorageDetectionError(e.to_string()))?;

    let results: Vec<HashMap<String, Variant>> = wmi_con
        .raw_query("SELECT * FROM Win32_LogicalDisk WHERE DriveType = 3")
        .map_err(|e| HardwareError::StorageDetectionError(e.to_string()))?;

    let disk = results.first()
        .ok_or_else(|| HardwareError::StorageDetectionError("No storage found".into()))?;

    let total = get_u64_field(disk, "Size")
        .map(|bytes| bytes / (1024 * 1024 * 1024)) // Convert to GB
        .unwrap_or(0);

    let available = get_u64_field(disk, "FreeSpace")
        .map(|bytes| bytes / (1024 * 1024 * 1024))
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
    let com_con = COMLibrary::new()
        .map_err(|e| HardwareError::OsDetectionError(e.to_string()))?;
    let wmi_con = WMIConnection::new(com_con.into())
        .map_err(|e| HardwareError::OsDetectionError(e.to_string()))?;

    let results: Vec<HashMap<String, Variant>> = wmi_con
        .raw_query("SELECT * FROM Win32_OperatingSystem")
        .map_err(|e| HardwareError::OsDetectionError(e.to_string()))?;

    let os = results.first()
        .ok_or_else(|| HardwareError::OsDetectionError("No OS info found".into()))?;

    let version = get_string_field(os, "Version")
        .unwrap_or_else(|| "Unknown".into());

    Ok(OsInfo {
        platform: "Windows".to_string(),
        version,
        distribution: None,
    })
}

pub fn detect_directx() -> Result<Option<DirectXSupport>> {
    // Use DXGI to detect DirectX capabilities
    // This is simplified - real implementation would use proper DXGI APIs

    Ok(Some(DirectXSupport {
        version: "12.0".into(),
        feature_level: "12_0".into(),
        ray_tracing: false, // Would check actual capabilities
    }))
}

// Helper functions

fn get_string_field(map: &HashMap<String, Variant>, key: &str) -> Option<String> {
    map.get(key).and_then(|v| match v {
        Variant::String(s) => Some(s.clone()),
        _ => None,
    })
}

fn get_u32_field(map: &HashMap<String, Variant>, key: &str) -> Option<u32> {
    map.get(key).and_then(|v| match v {
        Variant::UI4(n) => Some(*n),
        Variant::I4(n) => Some(*n as u32),
        _ => None,
    })
}

fn get_u64_field(map: &HashMap<String, Variant>, key: &str) -> Option<u64> {
    map.get(key).and_then(|v| match v {
        Variant::UI8(n) => Some(*n),
        Variant::I8(n) => Some(*n as u64),
        Variant::String(s) => s.parse::<u64>().ok(),
        _ => None,
    })
}

fn detect_storage_type() -> StorageType {
    // Query WMI for media type
    let com_con = COMLibrary::new();
    if com_con.is_err() {
        return StorageType::Unknown;
    }

    let wmi_con = WMIConnection::new(com_con.unwrap().into());
    if wmi_con.is_err() {
        return StorageType::Unknown;
    }

    let results: Result<Vec<HashMap<String, Variant>>, _> = wmi_con.unwrap()
        .raw_query("SELECT * FROM MSFT_PhysicalDisk");

    if let Ok(disks) = results {
        if let Some(disk) = disks.first() {
            if let Some(media_type) = get_u32_field(disk, "MediaType") {
                return match media_type {
                    3 => StorageType::HDD,
                    4 => StorageType::SataSsd,
                    5 => StorageType::NvmeSsd,
                    _ => StorageType::Unknown,
                };
            }
        }
    }

    StorageType::Unknown
}

// Tier classification (same as Linux version)
fn classify_cpu_tier(model: &str) -> CpuTier {
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

fn classify_gpu_tier(model: &str) -> GpuTier {
    let model_lower = model.to_lowercase();

    if model_lower.contains("4090") || model_lower.contains("7900 xtx") {
        GpuTier::Ultra
    } else if model_lower.contains("4080") || model_lower.contains("3090") {
        GpuTier::Enthusiast
    } else if model_lower.contains("4070") || model_lower.contains("3080") {
        GpuTier::Performance
    } else if model_lower.contains("4060") || model_lower.contains("3060") {
        GpuTier::Mainstream
    } else if model_lower.contains("1660") {
        GpuTier::Entry
    } else if model_lower.contains("1650") {
        GpuTier::Budget
    } else if model_lower.contains("intel") && !model_lower.contains("arc") {
        GpuTier::Integrated
    } else {
        GpuTier::Budget
    }
}
