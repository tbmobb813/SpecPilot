// Use dynamic import for Tauri `invoke` so web/dev (Vite) environment doesn't crash

// Detection confidence levels for hardware components
export type DetectionConfidence = 'VeryHigh' | 'High' | 'Moderate' | 'Low' | 'Unknown';

// Metadata about how a hardware component was detected
export interface DetectionMetadata {
  confidence: DetectionConfidence;
  method: string; // e.g., "nvidia-smi", "/proc/cpuinfo", "lspci"
}

export interface HardwareProfile {
  cpu: CpuInfo;
  gpu: GpuInfo;
  memory: MemoryInfo;
  storage: StorageInfo;
  os: OsInfo;
  graphics_api: GraphicsApiSupport;
}

export interface CpuInfo {
  model: string;
  vendor: string;
  cores: number;
  threads: number;
  base_clock: number;
  boost_clock?: number;
  architecture: string;
  tier: CpuTier;
  detection?: DetectionMetadata;
}

export interface GpuInfo {
  model: string;
  vendor: GpuVendor;
  vram: number;
  driver_version: string;
  pci_id?: string;
  tier: GpuTier;
  detection?: DetectionMetadata;        // GPU model detection method
  vram_detection?: DetectionMetadata;   // VRAM detection often uses different method
}

export interface MemoryInfo {
  total: number;
  available: number;
  speed?: number;
  ddr_type?: string;
  detection?: DetectionMetadata;
}

export interface StorageInfo {
  total: number;
  available: number;
  storage_type: StorageType;
  detection?: DetectionMetadata;
}

export interface OsInfo {
  platform: string;
  version: string;
  distribution?: string;
}

export interface GraphicsApiSupport {
  directx?: DirectXSupport;
  vulkan?: VulkanSupport;
  opengl?: OpenGLSupport;
  metal?: MetalSupport;
}

export interface DirectXSupport {
  version: string;
  feature_level: string;
  ray_tracing: boolean;
}

export interface VulkanSupport {
  version: string;
  driver_version: string;
  ray_tracing: boolean;
  mesh_shaders: boolean;
}

export interface OpenGLSupport {
  version: string;
}

export interface MetalSupport {
  version: string;
}

export enum CpuTier {
  Budget = 1,
  Entry = 2,
  Mainstream = 3,
  Performance = 4,
  Enthusiast = 5,
  Workstation = 6,
}

export enum GpuTier {
  Integrated = 1,
  Budget = 2,
  Entry = 3,
  Mainstream = 4,
  Performance = 5,
  Enthusiast = 6,
  Ultra = 7,
}

export type GpuVendor = 'Nvidia' | 'AMD' | 'Intel' | 'Apple' | 'Unknown';
export type StorageType = 'HDD' | 'SATA_SSD' | 'NVMe_SSD' | 'Unknown';

import { invokeTauri } from './tauri';

export async function scanHardware(): Promise<HardwareProfile | null> {
  try {
    return await invokeTauri('scan_hardware');
  } catch {
    return null;
  }
}

export async function getCachedProfile(): Promise<HardwareProfile | null> {
  try {
    return await invokeTauri('get_cached_profile');
  } catch {
    return null;
  }
}

export async function saveProfile(profile: HardwareProfile): Promise<void> {
  try {
    await invokeTauri('save_profile', { profile });
  } catch {
    // noop in non-tauri environment
  }
}
