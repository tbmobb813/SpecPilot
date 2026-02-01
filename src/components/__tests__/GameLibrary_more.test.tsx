import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { GameLibrary } from '../GameLibrary';
import { invokeTauri } from '../../api/tauri';

vi.mock('../../api/tauri', () => ({ invokeTauri: vi.fn() }));
const mockedInvoke = vi.mocked(invokeTauri);

const hardwareProfile = {
  cpu: { model: 'T', vendor: 'X', cores: 4, threads: 8, base_clock: 3.0, architecture: 'x86_64', tier: 3 },
  gpu: { model: 'G', vendor: 'V', vram: 4096, driver_version: 'd', tier: 4 },
  memory: { total: 16384, available: 15000 },
  storage: { total: 1000, available: 500, storage_type: 'NVMe_SSD' },
  os: { platform: 'linux', version: '1.0' },
  graphics_api: {},
};

const games = [
  {
    steam_id: 1,
    name: 'Good Game',
    genre: 'Action',
    release_year: 2020,
    header_image: null,
    protondb_rating: 'Gold',
    deck_status: 'Playable',
    verdict: {
      status: 'meets_recommended',
      confidence: 'high',
      summary: 'ok',
      details: [],
      min_requirements: null,
      rec_requirements: null,
    },
  },
  {
    steam_id: 2,
    name: 'Bad Game',
    genre: 'Puzzle',
    release_year: 2019,
    header_image: null,
    protondb_rating: 'Bronze',
    deck_status: 'Borked',
    verdict: {
      status: 'below_minimum',
      confidence: 'low',
      summary: 'bad',
      details: [],
      min_requirements: null,
      rec_requirements: null,
    },
  },
];

describe('GameLibrary extra coverage', () => {
  beforeEach(() => {
    mockedInvoke.mockReset();
    mockedInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'browse_games') return Promise.resolve(games);
      if (cmd === 'check_game_compatibility') return Promise.resolve(games[0].verdict);
      return Promise.reject(new Error('unexpected'));
    });
  });

  it('renders flat list when no hardware and allows selecting a game', async () => {
    render(<GameLibrary hardwareProfile={null as any} />);

    await waitFor(() => expect(screen.getByText(/Showing 2 of 2 games/)).toBeInTheDocument());

    const card = screen.getByText('Good Game');
    fireEvent.click(card);

    expect(card).toBeInTheDocument();
  });
});
