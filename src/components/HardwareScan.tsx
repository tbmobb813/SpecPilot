import { useState, useEffect } from 'react';
import { scanHardware, getCachedProfile, HardwareProfile, CpuTier, GpuTier, DetectionConfidence, DetectionMetadata } from '../api/hardware';

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

  const getConfidenceColor = (confidence: DetectionConfidence): string => {
    switch (confidence) {
      case 'VeryHigh': return '#22c55e'; // Green
      case 'High': return '#3b82f6';     // Blue
      case 'Moderate': return '#eab308'; // Yellow
      case 'Low': return '#f97316';      // Orange
      case 'Unknown': return '#6b7280';  // Gray
      default: return '#6b7280';
    }
  };

  const getConfidenceLabel = (confidence: DetectionConfidence): string => {
    switch (confidence) {
      case 'VeryHigh': return 'Very High';
      case 'High': return 'High';
      case 'Moderate': return 'Moderate';
      case 'Low': return 'Low';
      case 'Unknown': return 'Unknown';
      default: return 'Unknown';
    }
  };

  const renderDetectionBadge = (detection?: DetectionMetadata): React.ReactNode => {
    if (!detection) return null;

    const color = getConfidenceColor(detection.confidence);
    const label = getConfidenceLabel(detection.confidence);

    return (
      <div
        className="detection-badge"
        title={`Detection method: ${detection.method}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: '2px 8px',
          borderRadius: '4px',
          fontSize: '0.75rem',
          backgroundColor: `${color}20`,
          color: color,
          border: `1px solid ${color}40`,
          marginLeft: '8px'
        }}
      >
        <span style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          backgroundColor: color
        }} />
        {label}
        <span style={{ opacity: 0.7, fontSize: '0.7rem' }}>({detection.method})</span>
      </div>
    );
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
            <h3>
              🖥️ CPU
              {renderDetectionBadge(profile.cpu.detection)}
            </h3>
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
            <h3>
              🎮 GPU
              {renderDetectionBadge(profile.gpu.detection)}
            </h3>
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
                <span className="value">
                  {profile.gpu.vram} MB
                  {renderDetectionBadge(profile.gpu.vram_detection)}
                </span>
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
            <h3>
              💾 Memory
              {renderDetectionBadge(profile.memory.detection)}
            </h3>
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
            <h3>
              💿 Storage
              {renderDetectionBadge(profile.storage.detection)}
            </h3>
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
