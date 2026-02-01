import { defineConfig } from 'vitest/config';

export default defineConfig(async () => {
  // Dynamically import the React plugin to avoid ESM/require resolution issues
  const reactPlugin = (await import('@vitejs/plugin-react')).default;

  return {
    plugins: [reactPlugin()],
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './vitest.setup.ts',
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html'],
      },
    },
  };
});
