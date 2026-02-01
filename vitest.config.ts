import { defineConfig } from 'vitest/config';

export default defineConfig(async () => {
  const { default: react } = await import('@vitejs/plugin-react');

  return {
    plugins: [react()],
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: './vitest.setup.ts',
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html'],
        reportsDirectory: 'coverage/frontend',
        all: true,
        include: ['src/**/*.tsx', 'src/**/*.ts'],
        exclude: ['src/api/**/*.ts', 'src/components/**/*.test.tsx'],
      },
    },
  };
});
