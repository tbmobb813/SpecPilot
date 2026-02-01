import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { TelemetrySettings } from '../TelemetrySettings';

vi.mock('../../api/telemetry', () => ({
  getTelemetryEnabled: vi.fn(),
  setTelemetryEnabled: vi.fn(),
  submitTelemetry: vi.fn(),
  hashHardware: vi.fn(() => 'deadbeef'),
}));

import { getTelemetryEnabled, setTelemetryEnabled, submitTelemetry } from '../../api/telemetry';

const mockedGet = vi.mocked(getTelemetryEnabled);
const mockedSet = vi.mocked(setTelemetryEnabled);
const mockedSubmit = vi.mocked(submitTelemetry);

const hardwareProfile = {
  cpu: { model: 'X', vendor: 'Y', cores: 2, threads: 4, base_clock: 2.0, architecture: 'x86_64', tier: 1 },
  gpu: { model: 'G', vendor: 'Test', vram: 2048, driver_version: 'd', tier: 2 },
  memory: { total: 4096, available: 3000 },
  storage: { total: 256, available: 100, storage_type: 'SATA_SSD' },
  os: { platform: 'linux', version: '1' },
  graphics_api: {},
};

describe('TelemetrySettings', () => {
  beforeEach(() => {
    mockedGet.mockReset();
    mockedSet.mockReset();
    mockedSubmit.mockReset();
    mockedGet.mockResolvedValue(false);
  });

  it('toggles telemetry and submits a report', async () => {
    mockedGet.mockResolvedValueOnce(false);
    mockedSet.mockResolvedValueOnce(undefined);
    mockedSubmit.mockResolvedValueOnce(undefined);

    render(<TelemetrySettings hardwareProfile={hardwareProfile as any} gameId={42} predictedVerdict={'meets_recommended'} />);

    // Wait for loading to finish
    await waitFor(() => expect(screen.queryByText(/Loading settings/)).not.toBeInTheDocument());

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    await waitFor(() => expect(mockedSet).toHaveBeenCalledWith(true));

    // Now the form should appear
    expect(screen.getByText(/Submit Performance Report/)).toBeInTheDocument();

    const submitBtn = screen.getByRole('button', { name: /Submit Report/i });
    fireEvent.click(submitBtn);

    await waitFor(() => expect(mockedSubmit).toHaveBeenCalled());
    expect(screen.getByText(/Thank you for your contribution/)).toBeInTheDocument();
  });

  it('shows error when missing profile or gameId', async () => {
    mockedGet.mockResolvedValueOnce(true);
    render(<TelemetrySettings hardwareProfile={null} gameId={undefined as any} />);
    await waitFor(() => expect(screen.queryByText(/Loading settings/)).not.toBeInTheDocument());

    // enable checkbox then try to submit (no form should be available)
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    // Try to click submit via DOM search (should not exist because hardware/game missing)
    expect(screen.queryByText(/Submit Performance Report/)).not.toBeInTheDocument();
  });
});
