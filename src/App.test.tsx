import { render, screen } from '@testing-library/react';
import { act } from 'react';
import { vi } from 'vitest';
import App from './App';

vi.mock('./api/tauri', () => ({
  invokeTauri: vi.fn().mockResolvedValue([]),
}));

test('renders the main heading', async () => {
  await act(async () => {
    render(<App />);
    await Promise.resolve();
  });

  expect(screen.getByRole('heading', { name: /SpecPilot/i })).toBeInTheDocument();
});
