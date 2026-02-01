import { useState, useEffect } from 'react';
import { scanHardware, getCachedProfile, HardwareProfile, CpuTier, GpuTier } from '../api/hardware';

interface HardwareScanProps {
  onProfileUpdate?: (profile: HardwareProfile | null) => void;
}

export function HardwareScan({ onProfileUpdate }: HardwareScanProps) {
  const [profile, setProfile] = useState<HardwareProfile | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateProfile = (newProfile: HardwareProfile | null) => {
    setProfile(newProfile);
    onProfileUpdate?.(newProfile);
  };

  useEffect(() => {
    // Try to load cached profile on mount
    getCachedProfile().then(cached => {
      if (cached) {
        updateProfile(cached);
      }
    }).catch(err => {
      console.error('Failed to load cached profile:', err);
      setError(err instanceof Error ? err.message : String(err));
    });
  }, []);

  const handleScan = async () => {
    setScanning(true);
    setError(null);

    try {
      const result = await scanHardware();
      if (result) {
        updateProfile(result);
      } else {
        setError('Tauri runtime not available (running in browser)');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setScanning(false);
    }
  };

  const getTierLabel = (tier: CpuTier | GpuTier): string => {
    const labels = ['Unknown', 'Budget', 'Entry', 'Mainstream', 'Performance', 'Enthusiast', 'Workstation/Ultra'];
    return labels[tier] || 'Unknown';
  };

  const formatStorageType = (type: string): string => {
    return type.replace(/_/g, ' ');
  };

  return (
    <div className="hardware-scan">
      <div className="scan-header">
        <h2>System Hardware Scan</h2>
        <button
          onClick={handleScan}
          disabled={scanning}
          className="scan-button"
        >
          {scanning ? 'Scanning...' : 'Scan My PC'}
        </button>
      </div>

      {error && (
        <div className="error-message">
          <strong>Error:</strong> {error}
        </div>
      )}

      {profile && (
        <div className="results">
          <div className="section cpu-section">
            <h3>🖥️ CPU</h3>
            <div className="info-grid">
              <div className="info-item">
                <span className="label">Model:</span>
                <span className="value">{profile.cpu.model}</span>
              </div>
              <div className="info-item">
                <span className="label">Vendor:</span>
                <span className="value">{profile.cpu.vendor}</span>
              </div>
              <div className="info-item">
                <span className="label">Cores/Threads:</span>
                <span className="value">{profile.cpu.cores} / {profile.cpu.threads}</span>
              </div>
              <div className="info-item">
                <span className="label">Base Clock:</span>
                <span className="value">{profile.cpu.base_clock.toFixed(2)} GHz</span>
              </div>
              <div className="info-item">
                <span className="label">Architecture:</span>
                <span className="value">{profile.cpu.architecture}</span>
              </div>
              <div className="info-item">
                <span className="label">Tier:</span>
                <span className="value tier">{getTierLabel(profile.cpu.tier)}</span>
              </div>
            </div>
          </div>

          <div className="section gpu-section">
            <h3>🎮 GPU</h3>
            <div className="info-grid">
              <div className="info-item">
                <span className="label">Model:</span>
                <span className="value">{profile.gpu.model}</span>
              </div>
              <div className="info-item">
                <span className="label">Vendor:</span>
                <span className="value">{profile.gpu.vendor}</span>
              </div>
              <div className="info-item">
                <span className="label">VRAM:</span>
                <span className="value">{profile.gpu.vram} MB</span>
              </div>
              <div className="info-item">
                <span className="label">Driver:</span>
                <span className="value">{profile.gpu.driver_version}</span>
              </div>
              <div className="info-item">
                <span className="label">Tier:</span>
                <span className="value tier">{getTierLabel(profile.gpu.tier)}</span>
              </div>
            </div>
          </div>

          <div className="section memory-section">
            <h3>💾 Memory</h3>
            <div className="info-grid">
              <div className="info-item">
                <span className="label">Total RAM:</span>
                <span className="value">{(profile.memory.total / 1024).toFixed(2)} GB</span>
              </div>
              <div className="info-item">
                <span className="label">Available:</span>
                <span className="value">{(profile.memory.available / 1024).toFixed(2)} GB</span>
              </div>
              {profile.memory.speed && (
                <div className="info-item">
                  <span className="label">Speed:</span>
                  <span className="value">{profile.memory.speed} MHz</span>
                </div>
              )}
              {profile.memory.ddr_type && (
                <div className="info-item">
                  <span className="label">Type:</span>
                  <span className="value">{profile.memory.ddr_type}</span>
                </div>
              )}
            </div>
          </div>

          <div className="section storage-section">
            <h3>💿 Storage</h3>
            <div className="info-grid">
              <div className="info-item">
                <span className="label">Total:</span>
                <span className="value">{profile.storage.total} GB</span>
              </div>
              <div className="info-item">
                <span className="label">Available:</span>
                <span className="value">{profile.storage.available} GB</span>
              </div>
              <div className="info-item">
                <span className="label">Type:</span>
                <span className="value">{formatStorageType(profile.storage.storage_type)}</span>
              </div>
            </div>
          </div>

          <div className="section os-section">
            <h3>⚙️ Operating System</h3>
            <div className="info-grid">
              <div className="info-item">
                <span className="label">Platform:</span>
                <span className="value">{profile.os.platform}</span>
              </div>
              <div className="info-item">
                <span className="label">Version:</span>
                <span className="value">{profile.os.version}</span>
              </div>
              {profile.os.distribution && (
                <div className="info-item">
                  <span className="label">Distribution:</span>
                  <span className="value">{profile.os.distribution}</span>
                </div>
              )}
            </div>
          </div>

          {profile.graphics_api.vulkan && (
            <div className="section graphics-api-section">
              <h3>🎨 Graphics API Support</h3>
              <div className="info-grid">
                <div className="info-item">
                  <span className="label">Vulkan Version:</span>
                  <span className="value">{profile.graphics_api.vulkan.version}</span>
                </div>
                <div className="info-item">
                  <span className="label">Ray Tracing:</span>
                  <span className="value">
                    {profile.graphics_api.vulkan.ray_tracing ? '✅ Supported' : '❌ Not Supported'}
                  </span>
                </div>
                <div className="info-item">
                  <span className="label">Mesh Shaders:</span>
                  <span className="value">
                    {profile.graphics_api.vulkan.mesh_shaders ? '✅ Supported' : '❌ Not Supported'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
