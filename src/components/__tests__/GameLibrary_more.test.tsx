import React from 'react';
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';

vi.mock('../../api/tauri', () => ({
  invokeTauri: vi.fn(),
}));

import { invokeTauri } from '../../api/tauri';
import { GameLibrary } from '../GameLibrary';

describe('GameLibrary basic', () => {
  beforeEach(() => {
    (invokeTauri as any).mockReset?.();
  });

  it('renders placeholder when loading and then shows no-games', async () => {
    (invokeTauri as any).mockResolvedValue([]);
    const { findByText } = render(<GameLibrary hardwareProfile={null} />);

    // Since loadGames sets loading false eventually, expect no-games message
    expect(await findByText(/No games found matching your filters/)).toBeInTheDocument();
  });
});
