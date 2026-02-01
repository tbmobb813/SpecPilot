import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { ReadyUp } from '../ReadyUp';

vi.mock('../../api/tauri', () => ({
  invokeTauri: vi.fn(),
}));

import { invokeTauri } from '../../api/tauri';

const mockedInvoke = vi.mocked(invokeTauri);

const sampleReport = {
  overall_status: 'warning',
  summary: 'Minor issues detected',
  checks: [
    { id: '1', name: 'RAM', status: 'good', message: 'OK', details: null, action: null },
    { id: '2', name: 'Driver', status: 'warning', message: 'Outdated', details: 'Old driver', action: { label: 'Fix', command: 'echo fix' } },
  ],
};

describe('ReadyUp', () => {
  beforeEach(() => {
    mockedInvoke.mockReset();
    // default: readyup checks succeed
    mockedInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'run_readyup_checks') return Promise.resolve(sampleReport);
      return Promise.reject(new Error('unexpected'));
    });
    // mock clipboard and alert
    (global as any).navigator.clipboard = { writeText: vi.fn().mockResolvedValue(undefined) };
    (global as any).alert = vi.fn();
  });

  it('runs checks and displays report with actions', async () => {
    render(<ReadyUp />);

    const btn = screen.getByRole('button', { name: /Run System Check/i });
    fireEvent.click(btn);

    await waitFor(() => expect(screen.getByText(/Minor issues detected/)).toBeInTheDocument());
    expect(screen.getByText('Driver')).toBeInTheDocument();

    const actionBtn = screen.getByRole('button', { name: /Fix/i });
    fireEvent.click(actionBtn);

    await waitFor(() => expect((navigator.clipboard.writeText as any)).toHaveBeenCalledWith('echo fix'));
    expect((global as any).alert).toHaveBeenCalled();
  });

  it('shows error when invoke fails', async () => {
    mockedInvoke.mockRejectedValueOnce(new Error('boom'));

    render(<ReadyUp />);
    const btn = screen.getByRole('button', { name: /Run System Check/i });
    fireEvent.click(btn);

    expect(await screen.findByText(/Error running checks/)).toBeInTheDocument();
  });
});
