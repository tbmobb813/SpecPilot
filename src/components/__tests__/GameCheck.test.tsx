import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';

vi.mock('../../api/tauri', () => ({
  invokeTauri: vi.fn(),
}));

import { invokeTauri } from '../../api/tauri';
import { GameCheck } from '../GameCheck';

describe('GameCheck', () => {
  beforeEach(() => {
    (invokeTauri as any).mockReset?.();
  });

  it('searches and displays results, and shows warning when selecting without hardware', async () => {
    (invokeTauri as any).mockImplementation(async (cmd: string) => {
      if (cmd === 'search_games') {
        return [
          { steam_id: 1, name: 'Test Game', protondb_rating: 'Gold', deck_status: 'Verified' },
        ];
      }
      return null;
    });

    render(<GameCheck hardwareProfile={null} />);

    const input = screen.getByPlaceholderText('Search for a game...');
    fireEvent.change(input, { target: { value: 'Test' } });

    const btn = screen.getByText('Search');
    fireEvent.click(btn);

    await waitFor(() => screen.getByText('Results'));
    expect(screen.getByText('Test Game')).toBeInTheDocument();

    // Click result to select — without hardwareProfile this should set an error
    fireEvent.click(screen.getByText('Test Game'));

    await waitFor(() => screen.getByText('Scan your hardware first for personalized results'));
  });
});
