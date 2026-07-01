import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  timeout: 180_000,
  workers: 1,
  retries: 0,
  use: {
    trace: 'retain-on-failure'
  }
})
