import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { act } from 'react';
import { vi } from 'vitest';
import { GameCheck } from '../GameCheck';
import { invokeTauri } from '../../api/tauri';
import type { HardwareProfile } from '../../api/hardware';
import { CpuTier, GpuTier } from '../../api/hardware';

vi.mock('../../api/tauri', () => ({
  invokeTauri: vi.fn(),
}));

const mockedInvoke = vi.mocked(invokeTauri);

const hardwareProfile: HardwareProfile = {
  cpu: {
    model: 'Test CPU',
    vendor: 'Test',
    cores: 8,
    threads: 16,
    base_clock: 3.2,
    architecture: 'x86_64',
    tier: CpuTier.Mainstream,
  },
  gpu: {
    model: 'Test GPU',
    vendor: 'Unknown',
    vram: 8192,
    driver_version: 'v',
    tier: GpuTier.Mainstream,
  },
  memory: {
    total: 16384,
    available: 16000,
  },
  storage: {
    total: 1000,
    available: 500,
    storage_type: 'NVMe_SSD',
  },
  os: {
    platform: 'linux',
    version: '1.0',
  },
  graphics_api: {},
};

const mockGame = {
  steam_id: 123,
  name: 'Mock Game',
  genre: 'Adventure',
  protondb_rating: 'Gold',
  deck_status: 'Playable',
};

const mockVerdict = {
  status: 'meets_recommended',
  confidence: 'high',
  summary: 'Looks great',
  details: ['Detail 1'],
  min_requirements: null,
  rec_requirements: null,
};

describe('GameCheck', () => {
  beforeEach(() => {
    mockedInvoke.mockReset();
    mockedInvoke.mockImplementation((command) => {
      if (command === 'search_games') return Promise.resolve([mockGame]);
      if (command === 'check_game_compatibility') return Promise.resolve(mockVerdict);
      return Promise.reject(new Error('unexpected command'));
    });
  });

  it('performs a search and shows verdict details', async () => {
    render(<GameCheck hardwareProfile={hardwareProfile} />);

    const searchInput = screen.getByPlaceholderText('Search for a game...');
    const searchButton = screen.getByRole('button', { name: /search/i });

    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'Mock' } });
      fireEvent.click(searchButton);
    });

    await waitFor(() => expect(screen.getByText('Results')).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByText(mockGame.name));
    });

    await waitFor(() => expect(screen.getByText(/Your Hardware/i)).toBeInTheDocument());
    expect(screen.getByText(/Confidence: high/)).toBeInTheDocument();
    expect(mockedInvoke).toHaveBeenCalledWith(
      'check_game_compatibility',
      expect.objectContaining({ steamId: mockGame.steam_id })
    );
  });

  it('warns when hardware is missing', async () => {
    mockedInvoke.mockImplementation((command) => {
      if (command === 'search_games') return Promise.resolve([mockGame]);
      return Promise.resolve(mockVerdict);
    });

    render(<GameCheck hardwareProfile={null} />);

    const searchInput = screen.getByPlaceholderText('Search for a game...');
    const searchButton = screen.getByRole('button', { name: /search/i });

    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'Mock' } });
      fireEvent.click(searchButton);
    });

    await waitFor(() => expect(screen.getByText('Results')).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByText(mockGame.name));
    });

    expect(screen.getByText('Please scan your hardware first')).toBeInTheDocument();
    expect(mockedInvoke).not.toHaveBeenCalledWith('check_game_compatibility', expect.anything());
  });
});
