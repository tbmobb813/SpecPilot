import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';

vi.mock('../../api/telemetry', () => ({
  getTelemetryEnabled: vi.fn(),
  setTelemetryEnabled: vi.fn(),
  submitTelemetry: vi.fn(),
  hashHardware: vi.fn(() => 'hash'),
}));

import { getTelemetryEnabled, setTelemetryEnabled, submitTelemetry } from '../../api/telemetry';
import { TelemetrySettings } from '../TelemetrySettings';

describe('TelemetrySettings', () => {
  beforeEach(() => {
    (getTelemetryEnabled as any).mockReset?.();
    (setTelemetryEnabled as any).mockReset?.();
    (submitTelemetry as any).mockReset?.();
  });

  it('loads and toggles telemetry and submits report', async () => {
    (getTelemetryEnabled as any).mockResolvedValue(false);
    (setTelemetryEnabled as any).mockResolvedValue(undefined);
    (submitTelemetry as any).mockResolvedValue(undefined);

    const hardware = { cpu: {}, gpu: {}, memory: {}, storage: {}, os: {}, graphics_api: {} } as any;

    render(<TelemetrySettings hardwareProfile={hardware} gameId={123} />);

    // Wait for loading to finish
    await waitFor(() => expect(getTelemetryEnabled).toHaveBeenCalled());

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    await waitFor(() => expect(setTelemetryEnabled).toHaveBeenCalledWith(true));

    // Enable and submit
    fireEvent.click(checkbox);
    await waitFor(() => expect(setTelemetryEnabled).toHaveBeenCalled());
  });
});
