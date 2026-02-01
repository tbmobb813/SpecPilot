import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';

vi.mock('../../api/tauri', () => ({
  invokeTauri: vi.fn(),
}));

import { invokeTauri } from '../../api/tauri';
import { ReadyUp } from '../ReadyUp';

describe('ReadyUp', () => {
  beforeEach(() => {
    (invokeTauri as any).mockReset?.();
  });

  it('runs checks and displays report', async () => {
    (invokeTauri as any).mockResolvedValue({
      overall_status: 'good',
      checks: [
        { id: '1', name: 'RAM', status: 'good', message: 'OK', details: null, action: null }
      ],
      summary: 'All good'
    });

    render(<ReadyUp />);

    const btn = screen.getByText('Run System Check');
    fireEvent.click(btn);

    expect(await screen.findByText('All good')).toBeInTheDocument();
  });
});
