import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';

vi.mock('../../api/hardware', () => ({
  scanHardware: vi.fn(),
  getCachedProfile: vi.fn(),
}));

import { getCachedProfile, scanHardware } from '../../api/hardware';
import { HardwareScan } from '../HardwareScan';

describe('HardwareScan', () => {
  beforeEach(() => {
    (getCachedProfile as any).mockReset?.();
    (scanHardware as any).mockReset?.();
  });

  it('renders and shows cached profile when available', async () => {
    (getCachedProfile as any).mockResolvedValue({
      cpu: { model: 'CPU', vendor: 'V', cores: 4, threads: 8, base_clock: 3.0, architecture: 'x86_64', tier: 3 },
      gpu: { model: 'GPU', vendor: 'V', vram: 4096, driver_version: '1.0', tier: 3 },
      memory: { total: 16000, available: 8000 },
      storage: { total: 500, available: 200, storage_type: 'nvme' },
      os: { platform: 'linux', version: '1' },
      graphics_api: { vulkan: { version: '1.2', ray_tracing: false, mesh_shaders: false } }
    });

    render(<HardwareScan />);

    expect(await screen.findByText('CPU')).toBeInTheDocument();
    expect(screen.getByText('GPU')).toBeInTheDocument();
  });

  it('runs scan when button clicked', async () => {
    (getCachedProfile as any).mockResolvedValue(null);
    (scanHardware as any).mockResolvedValue({
      cpu: { model: 'CPU', vendor: 'V', cores: 2, threads: 4, base_clock: 2.5, architecture: 'x86_64', tier: 2 },
      gpu: { model: 'GPU', vendor: 'V', vram: 2048, driver_version: '1.0', tier: 2 },
      memory: { total: 8000, available: 4000 },
      storage: { total: 250, available: 100, storage_type: 'ssd' },
      os: { platform: 'linux', version: '1' },
      graphics_api: { vulkan: { version: '1.1', ray_tracing: false, mesh_shaders: false } }
    });

    render(<HardwareScan />);

    const btn = screen.getByRole('button', { name: /Scan My PC/i });
    fireEvent.click(btn);

    expect(await screen.findByText('CPU')).toBeInTheDocument();
  });
});
