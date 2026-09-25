import { getEnvConfig } from '../config/env.js';
import { launchBrowser } from '../linkedin/browser.js';
import { ensureAuthenticated } from '../auth/login.js';
import { loadMessageRecords, LinkedInMessageRecord } from '../input/json.js';
import { fetchSheetRecords, updateSheetRowStatus } from '../input/sheet.js';
import { isProfileSuccess, isProfileSeen } from '../tracking/processedProfiles.js';
import { runProfileWorkflow } from './workflow.js';
import logger from '../logging/logger.js';

export interface CliArgs {
  start?: number;
  end?: number;
}

/**
 * Parses command line arguments like --start 1 --end 3 or -s 1 -e 3.
 */
export function parseCliArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--start' || arg === '-s') {
      const val = parseInt(args[i + 1], 10);
      if (!isNaN(val)) result.start = val;
    } else if (arg.startsWith('--start=')) {
      const val = parseInt(arg.split('=')[1], 10);
      if (!isNaN(val)) result.start = val;
    } else if (arg === '--end' || arg === '-e') {
      const val = parseInt(args[i + 1], 10);
      if (!isNaN(val)) result.end = val;
    } else if (arg.startsWith('--end=')) {
      const val = parseInt(arg.split('=')[1], 10);
      if (!isNaN(val)) result.end = val;
    }
  }

  return result;
}

/**
 * Runs the complete batch automation orchestration workflow.
 */
export async function runOrchestration(): Promise<void> {
  logger.divider();
  console.log('     LinkedIn Connection Automation');
  logger.divider();
  console.log('');

  // 1. Load Configurations
  let config;
  try {
    config = await getEnvConfig();
  } catch (error: any) {
    logger.error(`Configuration Error: ${error.message}`);
    return;
  }

  // 2. Parse CLI Arguments (--start and --end)
  const cliArgs = parseCliArgs();

  // 3. Load Input Source (Google Sheet or local messages.json fallback)
  let allRecords: LinkedInMessageRecord[] = [];
  try {
    if (config.googleSheetWebAppLink) {
      allRecords = await fetchSheetRecords(
        config.googleSheetWebAppLink,
        config.senderName,
        config.targetType
      );
    } else {
      logger.warn('GOOGLE_SHEET_WEB_APP_LINK not set in .env. Falling back to local data/messages.json...');
      allRecords = loadMessageRecords();
    }
  } catch (error: any) {
    logger.error('Failed to load connection data:', error);
    return;
  }

  if (allRecords.length === 0) {
    logger.warn('No profiles found to process. Exiting.');
    return;
  }

  // 4. Calculate batch range based on --start and --end flags
  const start = Math.max(1, cliArgs.start ?? 1);
  const end = cliArgs.end ? Math.min(allRecords.length, cliArgs.end) : allRecords.length;

  if (start > allRecords.length) {
    logger.error(`Start index (${start}) is greater than total records count (${allRecords.length}). Exiting.`);
    return;
  }

  if (start > end) {
    logger.error(`Start index (${start}) cannot be greater than end index (${end}). Exiting.`);
    return;
  }

  const batchRecords = allRecords.slice(start - 1, end);

  console.log('');
  logger.info(`Total available profiles: ${allRecords.length}`);
  logger.info(`Processing batch range: Record #${start} to #${end} (${batchRecords.length} profile(s)).`);
  console.log('');

  // 5. Launch Persistent Playwright Browser
  let context;
  try {
    context = await launchBrowser(config);
  } catch (error: any) {
    logger.error('Failed to launch Playwright browser context:', error);
    return;
  }

  try {
    const page = await context.newPage();

    // 6. Ensure Authenticated
    await ensureAuthenticated(page, config);

    let successful = 0;
    let failed = 0;
    let skipped = 0;

    // 7. Sequential Profile Processing Loop
    for (let i = 0; i < batchRecords.length; i++) {
      const record = batchRecords[i];
      const recordNumber = start + i;
      const indexStr = `[${i + 1}/${batchRecords.length}]`;
      const sheetRowStr = record.rowIndex ? `(Sheet Row ${record.rowIndex})` : '';

      console.log('');
      logger.info(`${indexStr} Record #${recordNumber} ${sheetRowStr} - ${record.name || record.username}`);

      // Check if status is already sent in sheet or already processed in local tracking
      const isAlreadySent = record.status?.toLowerCase() === 'send' || record.status?.toLowerCase() === 'sent';
      if (isAlreadySent || isProfileSuccess(record.username) || isProfileSeen(record.username)) {
        logger.info(`Status: SKIPPED (Already sent or processed)`);
        skipped++;
        continue;
      }

      // Check if LinkedIn URL is missing
      if (!record.url) {
        logger.error(`No LinkedIn URL found for this profile. Marking as FAILED.`);
        failed++;
        if (record.rowIndex && config.googleSheetWebAppLink) {
          await updateSheetRowStatus(config.googleSheetWebAppLink, record.rowIndex, 'Failed');
        }
        continue;
      }

      // Execute Connection Workflow
      const result = await runProfileWorkflow(page, record);

      if (result.success) {
        successful++;
        if (record.rowIndex && config.googleSheetWebAppLink) {
          await updateSheetRowStatus(config.googleSheetWebAppLink, record.rowIndex, 'Send');
        }
      } else {
        failed++;
        if (record.rowIndex && config.googleSheetWebAppLink) {
          await updateSheetRowStatus(config.googleSheetWebAppLink, record.rowIndex, 'Failed');
        }
        logger.info('Continuing to next profile...');
      }

      // Human-like pause between profiles to stay within limits and avoid rate-limiting triggers
      if (i < batchRecords.length - 1) {
        const pauseTime = Math.floor(Math.random() * 4000) + 4000; // 4 to 8 second random pause
        logger.info(`Waiting ${pauseTime / 1000}s before next profile...`);
        await page.waitForTimeout(pauseTime);
      }
    }

    // 8. Output Summary Report
    console.log('');
    logger.divider();
    console.log('             BATCH SUMMARY');
    logger.divider();
    console.log(`Range:       #${start} to #${end}`);
    console.log(`Total Batch: ${batchRecords.length}`);
    console.log(`Successful:  ${successful}`);
    console.log(`Failed:      ${failed}`);
    console.log(`Skipped:     ${skipped}`);
    logger.divider();
    console.log('');

  } catch (error: any) {
    logger.error('An unexpected orchestrator error occurred:', error);
  } finally {
    logger.info('Closing browser and cleaning up...');
    try {
      await context.close();
      logger.success('Browser context closed successfully.');
    } catch (closeError: any) {
      logger.error('Failed to close browser context:', closeError);
    }
    logger.close();
  }
}
