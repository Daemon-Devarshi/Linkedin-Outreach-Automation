import { Page } from 'playwright';
import { LinkedInMessageRecord } from '../input/json.js';
import { loadAndValidateProfile } from '../linkedin/profile.js';
import { sendConnectionRequest } from '../linkedin/connection.js';
import { markProfileSuccess, markProfileFailed } from '../tracking/processedProfiles.js';
import logger from '../logging/logger.js';

export interface WorkflowResult {
  success: boolean;
  skipped: boolean;
  error?: string;
}

/**
 * Handles the complete connection process for a single profile:
 * 1. Navigates to the profile page.
 * 2. Connects and inputs the custom message note.
 * 3. Handles any unexpected errors by logging and marking status.
 * 
 * @param page Playwright Page instance
 * @param record Message record details (username, URL, message)
 * @returns WorkflowResult status
 */
export async function runProfileWorkflow(
  page: Page,
  record: LinkedInMessageRecord
): Promise<WorkflowResult> {
  const { username, url } = record;
  logger.info(`Processing profile: ${username}`);

  try {
    // Step 1: Open profile and validate loading
    await loadAndValidateProfile(page, url);

    // Step 2: Perform connection and message entry
    await sendConnectionRequest(page, record);

    // Step 3: Record tracking status as SUCCESS
    markProfileSuccess(username);
    return { success: true, skipped: false };
  } catch (error: any) {
    const errorMsg = error.message || 'Unknown error';

    // Log failure details
    logger.error(`FAILED: ${username}`);
    logger.error(`Reason: ${errorMsg}`);

    // Record tracking status as FAILED (re-attemptable on subsequent runs)
    markProfileFailed(username, errorMsg);

    return { success: false, skipped: false, error: errorMsg };
  }
}


