use serde::{Deserialize, Serialize};

/// Detection confidence levels for hardware components
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum DetectionConfidence {
    /// System APIs, /proc files, official tools (nvidia-smi, WMI)
    VeryHigh,
    /// Reliable detection methods (lspci, sysfs)
    High,
    /// Fallback methods with reasonable accuracy (rocm-smi, modinfo)
    Moderate,
    /// Heuristic or approximation-based (glxinfo fallback, string matching)
    Low,
    /// Detection failed or used defaults
    Unknown,
}

impl DetectionConfidence {
    pub fn label(&self) -> &'static str {
        match self {
            DetectionConfidence::VeryHigh => "Very High",
            DetectionConfidence::High => "High",
            DetectionConfidence::Moderate => "Moderate",
            DetectionConfidence::Low => "Low",
            DetectionConfidence::Unknown => "Unknown",
        }
    }

    pub fn description(&self) -> &'static str {
        match self {
            DetectionConfidence::VeryHigh => "Detected via official system API or driver tool",
            DetectionConfidence::High => "Detected via reliable system interface",
            DetectionConfidence::Moderate => "Detected via fallback method",
            DetectionConfidence::Low => "Estimated or approximated",
            DetectionConfidence::Unknown => "Could not be detected",
        }
    }
}

/// Metadata about how a hardware component was detected
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectionMetadata {
    pub confidence: DetectionConfidence,
    pub method: String,  // e.g., "nvidia-smi", "/proc/cpuinfo", "WMI"
}

impl DetectionMetadata {
    pub fn new(confidence: DetectionConfidence, method: impl Into<String>) -> Self {
        Self {
            confidence,
            method: method.into(),
        }
    }

    pub fn very_high(method: impl Into<String>) -> Self {
        Self::new(DetectionConfidence::VeryHigh, method)
    }

    pub fn high(method: impl Into<String>) -> Self {
        Self::new(DetectionConfidence::High, method)
    }

    pub fn moderate(method: impl Into<String>) -> Self {
        Self::new(DetectionConfidence::Moderate, method)
    }

    pub fn low(method: impl Into<String>) -> Self {
        Self::new(DetectionConfidence::Low, method)
    }

    pub fn unknown() -> Self {
        Self::new(DetectionConfidence::Unknown, "unknown")
    }
}

impl Default for DetectionMetadata {
    fn default() -> Self {
        Self::unknown()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HardwareProfile {
    pub cpu: CpuInfo,
    pub gpu: GpuInfo,
    pub memory: MemoryInfo,
    pub storage: StorageInfo,
    pub os: OsInfo,
    pub graphics_api: GraphicsApiSupport,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CpuInfo {
    pub model: String,
    pub vendor: String,
    pub cores: u32,
    pub threads: u32,
    pub base_clock: f32,        // GHz
    pub boost_clock: Option<f32>, // GHz
    pub architecture: String,    // x86_64, ARM, etc.
    pub tier: CpuTier,
    #[serde(default)]
    pub detection: DetectionMetadata,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GpuInfo {
    pub model: String,
    pub vendor: GpuVendor,
    pub vram: u64,              // MB
    pub driver_version: String,
    pub pci_id: Option<String>, // For exact matching
    pub tier: GpuTier,
    #[serde(default)]
    pub detection: DetectionMetadata,
    #[serde(default)]
    pub vram_detection: DetectionMetadata,  // VRAM often uses different method
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryInfo {
    pub total: u64,     // MB
    pub available: u64, // MB
    pub speed: Option<u32>, // MHz
    pub ddr_type: Option<String>, // DDR4, DDR5, etc.
    #[serde(default)]
    pub detection: DetectionMetadata,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StorageInfo {
    pub total: u64,     // GB
    pub available: u64, // GB
    pub storage_type: StorageType,
    #[serde(default)]
    pub detection: DetectionMetadata,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OsInfo {
    pub platform: String,       // Linux, Windows, macOS
    pub version: String,        // Kernel version or Windows build
    pub distribution: Option<String>, // Ubuntu, Arch, etc. (Linux only)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphicsApiSupport {
    pub directx: Option<DirectXSupport>,
    pub vulkan: Option<VulkanSupport>,
    pub opengl: Option<OpenGLSupport>,
    pub metal: Option<MetalSupport>, // macOS
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DirectXSupport {
    pub version: String,        // "12.0", "12.1", etc.
    pub feature_level: String,  // "12_0", "12_1", "12_2"
    pub ray_tracing: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VulkanSupport {
    pub version: String,        // "1.3.0"
    pub driver_version: String,
    pub ray_tracing: bool,
    pub mesh_shaders: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenGLSupport {
    pub version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetalSupport {
    pub version: String,
}

// Tier classifications (normalized for comparison)
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
pub enum CpuTier {
    Budget = 1,      // Celeron, Athlon
    Entry = 2,       // i3, Ryzen 3
    Mainstream = 3,  // i5, Ryzen 5
    Performance = 4, // i7, Ryzen 7
    Enthusiast = 5,  // i9, Ryzen 9
    Workstation = 6, // Threadripper, Xeon
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
pub enum GpuTier {
    Integrated = 1,  // Intel UHD, Vega iGPU
    Budget = 2,      // GTX 1650, RX 6500 XT
    Entry = 3,       // GTX 1660, RX 6600
    Mainstream = 4,  // RTX 3060, RX 6700 XT
    Performance = 5, // RTX 3070, RX 6800 XT
    Enthusiast = 6,  // RTX 3080, RX 6900 XT
    Ultra = 7,       // RTX 4090, RX 7900 XTX
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum GpuVendor {
    Nvidia,
    AMD,
    Intel,
    Apple,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum StorageType {
    HDD,
    #[serde(rename = "SATA_SSD")]
    SataSsd,
    #[serde(rename = "NVMe_SSD")]
    NvmeSsd,
    Unknown,
}

// Error types
#[allow(dead_code)]
#[derive(Debug, thiserror::Error)]
pub enum HardwareError {
    #[error("Failed to detect CPU: {0}")]
    CpuDetectionError(String),

    #[error("Failed to detect GPU: {0}")]
    GpuDetectionError(String),

    #[error("Failed to detect memory: {0}")]
    MemoryDetectionError(String),

    #[error("Failed to detect storage: {0}")]
    StorageDetectionError(String),

    #[error("Failed to detect OS: {0}")]
    OsDetectionError(String),

    #[error("Unsupported platform: {0}")]
    UnsupportedPlatform(String),

    #[error("System call failed: {0}")]
    SystemError(String),
}

pub type Result<T> = std::result::Result<T, HardwareError>;
