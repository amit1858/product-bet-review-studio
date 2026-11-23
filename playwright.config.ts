import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  workers: 2,
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:3030',
    launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
    serviceWorkers: 'allow',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 }, colorScheme: 'light' } },
    { name: 'phone', use: { viewport: { width: 390, height: 844 }, colorScheme: 'light' } },
    { name: 'phone-dark-system', use: { viewport: { width: 390, height: 844 }, colorScheme: 'dark' } },
  ],
  webServer: {
    command: 'npm run start',
    url: 'http://localhost:3030/api/status',
    env: { PORT: '3030', HOST: '127.0.0.1', APP_ORIGIN: 'http://localhost:3030', ANTHROPIC_API_KEY: '', SARVAM_API_KEY: '' },
    reuseExistingServer: false,
  },
});
