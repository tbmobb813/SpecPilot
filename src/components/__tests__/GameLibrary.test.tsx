import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { GameLibrary } from '../GameLibrary';
import { invokeTauri } from '../../api/tauri';

vi.mock('../../api/tauri', () => ({
  invokeTauri: vi.fn(),
}));

const mockedInvoke = vi.mocked(invokeTauri);

const mockGames = [
  {
    steam_id: 1,
    name: 'RPG Hero',
    genre: 'RPG',
    release_year: 2023,
    header_image: null,
    protondb_rating: 'Gold',
    deck_status: 'Playable',
    verdict: null,
  },
  {
    steam_id: 2,
    name: 'Action Vanguard',
    genre: 'Action',
    release_year: 2021,
    header_image: null,
    protondb_rating: 'Bronze',
    deck_status: 'Borked',
    verdict: null,
  },
];

describe('GameLibrary', () => {
  beforeEach(() => {
    mockedInvoke.mockReset();
    mockedInvoke.mockImplementation((command) => {
      if (command === 'browse_games') {
        return Promise.resolve(mockGames);
      }
      return Promise.reject(new Error('Unexpected command'));
    });
  });

  it('filters games by search query and shows empty state', async () => {
    render(<GameLibrary hardwareProfile={null} />);

    await waitFor(() => expect(screen.getByText(/Showing 2 of 2 games/)).toBeInTheDocument());

    const searchInput = screen.getByPlaceholderText('Search games...');
    fireEvent.change(searchInput, { target: { value: 'Action' } });

    await waitFor(() => expect(screen.getByText(/Showing 1 of 2 games/)).toBeInTheDocument());

    fireEvent.change(searchInput, { target: { value: 'Missing' } });

    await screen.findByText(/No games found matching your filters/);
    expect(mockedInvoke).toHaveBeenCalledWith('browse_games', expect.any(Object));
  });
});
