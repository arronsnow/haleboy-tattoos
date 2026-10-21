import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Tests fake D1 with node:sqlite, which Node 22 flags as experimental on every run.
  test: { execArgv: ['--disable-warning=ExperimentalWarning'] },
});
