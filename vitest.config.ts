import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 20000,
    hookTimeout: 20000,
    reporters: ['verbose'],
    env: {
      TEST_BASE_URL: 'https://onboard.nak-inf.de',
    },
  },
});
