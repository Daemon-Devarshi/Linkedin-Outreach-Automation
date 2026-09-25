import { Page } from 'playwright';
import logger from '../logging/logger.js';

/**
 * Navigates to a profile URL and verifies that the profile page loaded successfully.
 * 
 * @param page Playwright Page instance
 * @param url The profile URL to open
 * @returns boolean true if successfully loaded and verified
 */
export async function loadAndValidateProfile(page: Page, url: string): Promise<boolean> {
  logger.info(`Opening profile: ${url}`);
  
  try {
    // Navigate to profile URL with retry logic
    let response = null;
    for (let i = 0; i < 3; i++) {
      try {
        response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        break;
      } catch (e: any) {
        logger.warn(`Navigation to profile encountered an issue (${e.message}). Retrying in 2 seconds (attempt ${i + 1}/3)...`);
        await page.waitForTimeout(2000);
      }
    }
    
    // Check HTTP status code
    if (response) {
      const status = response.status();
      if (status === 404) {
        throw new Error('Profile page returned HTTP 404 (Not Found)');
      }
      if (status >= 500) {
        throw new Error(`LinkedIn server error (HTTP ${status})`);
      }
    }

    // Check immediately for 404 / missing profile error states
    const pageText = await page.innerText('body').catch(() => '');
    if (
      pageText.includes("This page doesn’t exist") ||
      pageText.includes("This page doesn't exist") ||
      pageText.includes("This profile is not available") ||
      pageText.includes("Page not found")
    ) {
      throw new Error('Profile does not exist (LinkedIn shows "This page doesn’t exist")');
    }

    // Wait dynamically for the profile/company page layout to render (up to 15 seconds)
    const profileLayout = page.locator('main, .org-top-card, .scaffold-layout__main').first();
    try {
      await profileLayout.waitFor({ state: 'visible', timeout: 15000 });
    } catch {
      // Re-check if 404 error page rendered after delay
      const delayedText = await page.innerText('body').catch(() => '');
      if (delayedText.includes("This page doesn’t exist") || delayedText.includes("This page doesn't exist")) {
        throw new Error('Profile does not exist (LinkedIn shows "This page doesn’t exist")');
      }

      // Check if we are redirected to a login page (expired session)
      if (page.url().includes('linkedin.com/login')) {
        throw new Error('LinkedIn session expired. Redirected to login page.');
      }
      throw new Error('Profile page layout was not detected within 15 seconds (possibly restricted, network delay, or changed UI)');
    }

    // Wait for dynamic page elements (like connection status spinners) to stabilize
    await page.waitForTimeout(4000);

    // Validate page contents using title and common error page indicators
    const title = await page.title();
    if (title.includes('Page Not Found') || title.includes('404')) {
      throw new Error('Profile page title indicates "Page Not Found"');
    }

    // Inspect main page body text for unavailable indicators
    const bodyText = await page.innerText('body').catch(() => '');
    if (bodyText.includes('This profile is not available') || bodyText.includes('Page not found')) {
      throw new Error('LinkedIn text indicates "Profile is not available"');
    }

    return true;
  } catch (error) {
    throw new Error(`Profile load failed: ${(error as Error).message}`);
  }
}
