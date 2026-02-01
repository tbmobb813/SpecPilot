import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { HardwareScan } from '../HardwareScan';

vi.mock('../../api/hardware', () => ({
  scanHardware: vi.fn(),
  getCachedProfile: vi.fn(),
}));

import { scanHardware, getCachedProfile } from '../../api/hardware';

const mockedScan = vi.mocked(scanHardware);
const mockedCached = vi.mocked(getCachedProfile);

const sampleProfile = {
  cpu: { model: 'T-CPU', vendor: 'TestCo', cores: 4, threads: 8, base_clock: 3.2, architecture: 'x86_64', tier: 3 },
  gpu: { model: 'T-GPU', vendor: 'Test', vram: 4096, driver_version: 'd', tier: 4 },
  memory: { total: 8192, available: 7000 },
  storage: { total: 512, available: 200, storage_type: 'NVMe_SSD' },
  os: { platform: 'linux', version: '1.0' },
  graphics_api: {},
};

describe('HardwareScan', () => {
  beforeEach(() => {
    mockedScan.mockReset();
    mockedCached.mockReset();
  });

  it('shows cached profile when available', async () => {
    mockedCached.mockResolvedValue(sampleProfile as any);

    render(<HardwareScan />);

    await waitFor(() => expect(screen.getByText(/System Hardware Scan/)).toBeInTheDocument());
    expect(await screen.findByText('T-CPU')).toBeInTheDocument();
    expect(screen.getByText(/T-GPU/)).toBeInTheDocument();
  });

  it('performs a scan and displays results', async () => {
    mockedCached.mockResolvedValue(null);
    mockedScan.mockResolvedValue(sampleProfile as any);

    render(<HardwareScan />);

    const scanBtn = screen.getByRole('button', { name: /Scan My PC/i });
    fireEvent.click(scanBtn);

    await waitFor(() => expect(screen.getByText('Scanning...')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('T-CPU')).toBeInTheDocument());
  });

  it('shows error when scan fails', async () => {
    mockedCached.mockResolvedValue(null);
    mockedScan.mockRejectedValue(new Error('failed'));

    render(<HardwareScan />);

    const scanBtn = screen.getByRole('button', { name: /Scan My PC/i });
    fireEvent.click(scanBtn);

    expect(await screen.findByText(/Error:/)).toBeInTheDocument();
  });
});
