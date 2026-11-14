import { defineConfig } from 'vitest/config';

// Kept separate from vite.config.js so the PWA plugin doesn't run during tests.
export default defineConfig({
  test: { include: ['src/**/*.test.js'], environment: 'node' },
});
