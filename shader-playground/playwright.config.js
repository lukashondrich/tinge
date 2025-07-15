// playwright.config.js
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://localhost:5173',
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
    /* Take screenshot on failure */
    screenshot: 'only-on-failure',
    /* Record video on failure */
    video: 'retain-on-failure',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { 
        ...devices['Desktop Chrome'],
        // Enable autoplay for audio testing
        launchOptions: {
          args: ['--autoplay-policy=no-user-gesture-required', '--disable-web-security']
        }
      },
    },

    {
      name: 'firefox',
      use: { 
        ...devices['Desktop Firefox'],
        // Firefox autoplay settings
        launchOptions: {
          firefoxUserPrefs: {
            'media.autoplay.default': 0,
            'media.autoplay.enabled': true
          }
        }
      },
    },

    {
      name: 'webkit',
      use: { 
        ...devices['Desktop Safari'],
        // Safari autoplay settings
        launchOptions: {
          args: ['--disable-web-security']
        }
      },
    },

    /* Test against mobile viewports. */
    {
      name: 'Mobile Chrome',
      use: { 
        ...devices['Pixel 5'],
        // Mobile Chrome autoplay settings
        launchOptions: {
          args: ['--autoplay-policy=no-user-gesture-required', '--disable-web-security']
        }
      },
    },
    {
      name: 'Mobile Safari',
      use: { 
        ...devices['iPhone 12'],
        // Mobile Safari settings
        launchOptions: {
          args: ['--disable-web-security']
        }
      },
    },

    /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});