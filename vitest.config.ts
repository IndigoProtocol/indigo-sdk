import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 180000, // 3 minutes
    reporters: 'verbose',
    include: ['./tests/**/*.test.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
  },
});
