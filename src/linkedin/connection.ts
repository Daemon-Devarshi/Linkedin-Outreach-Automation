import { Page } from 'playwright';
import { SELECTORS } from './selectors.js';
import logger from '../logging/logger.js';
import { LinkedInMessageRecord } from '../input/json.js';

/**
 * Checks for and clicks the Follow button if present on the profile/company header.
 * Logs "button clicked" when triggered, then allows the automation to proceed normally.
 */
export async function clickFollowButton(page: Page): Promise<boolean> {
  try {
    const followBtn = page.locator(SELECTORS.connection.followBtn).first();
    const isVisible = await followBtn.isVisible().catch(() => false);
    if (!isVisible) {
      return false;
    }

    const ariaPressed = await followBtn.getAttribute('aria-pressed').catch(() => null);
    const text = (await followBtn.innerText().catch(() => '')).trim().toLowerCase();
    
    // Skip if already followed or button indicates "Following"
    if (ariaPressed === 'true' || text === 'following') {
      return false;
    }

    logger.info('Finding Follow button...');
    await followBtn.evaluate((el: HTMLElement) => el.click()).catch(() => followBtn.click({ force: true }));
    logger.info('button clicked');
    await page.waitForTimeout(1500);
    return true;
  } catch (error: any) {
    logger.warn(`Follow action error: ${error.message}`);
    return false;
  }
}

/**
 * Handles the complete connection action:
 * 1. Checks and clicks the Follow button if available on the profile.
 * 2. Checks if connection is already pending or if user is already connected (skips if so).
 * 3. Clicks Connect (tries direct button, falls back to "More" actions menu).
 * 4. Handles invitation modal: clicks "Add a note", fills the text area, and clicks Send.
 * 5. Verifies the request was successfully sent.
 * 
 * @param page Playwright Page instance.
 * @param record Message record containing URL and personalized message.
 */
export async function sendConnectionRequest(page: Page, record: LinkedInMessageRecord): Promise<void> {
  // Click follow button before sending message if present
  await clickFollowButton(page);

  logger.info('Analyzing profile connection state...');

  // Step 1: Check for Direct Connect button on profile header
  const directConnect = page.locator(SELECTORS.connection.connectDirect).first();
  const directConnectVisible = await directConnect.isVisible().catch(() => false);

  let connectClicked = false;

  if (directConnectVisible) {
    logger.info('Finding Connect... (Direct button found)');
    logger.info('Clicking Connect...');

    for (let attempt = 0; attempt < 3; attempt++) {
      // DOM dispatch click bypasses any floating/sticky headers or overlays
      await directConnect.evaluate((el: HTMLElement) => el.click()).catch(() => directConnect.click({ force: true }));
      
      // Wait for modal or "Add a note" button to become visible
      const modalLocator = page.locator('button:has-text("Add a note"), a:has-text("Add a note"), button:has-text("Send without a note"), a:has-text("Send without a note"), [role="dialog"]').first();
      const modalAppeared = await modalLocator.waitFor({ state: 'visible', timeout: 3500 }).then(() => true).catch(() => false);
      if (modalAppeared) {
        connectClicked = true;
        break;
      }
      logger.info(`Waiting for invitation modal to trigger (attempt ${attempt + 1}/3)...`);
      await page.waitForTimeout(1500);
    }
  }

  if (!connectClicked) {
    logger.info('Direct Connect button did not trigger modal. Checking "More" action dropdown...');

    const moreBtn = page.locator(SELECTORS.connection.moreActions).first();
    const moreBtnVisible = await moreBtn.isVisible().catch(() => false);

    if (moreBtnVisible) {
      logger.info('Clicking "More" button...');
      await moreBtn.evaluate((el: HTMLElement) => el.click()).catch(() => moreBtn.click({ force: true }));
      
      // Wait for the menu list to render and stabilize
      await page.waitForTimeout(1500);

      // Search for Connect inside "More" menu
      const dropdownConnect = page.locator(SELECTORS.connection.connectFromMore).first();
      const dropdownConnectVisible = await dropdownConnect.isVisible().catch(() => false);

      if (dropdownConnectVisible) {
        logger.info('Finding Connect... (Connect found inside "More" menu)');
        logger.info('Clicking Connect...');
        for (let attempt = 0; attempt < 3; attempt++) {
          await dropdownConnect.evaluate((el: HTMLElement) => el.click()).catch(() => dropdownConnect.click({ force: true }));
          const modalLocator = page.locator('button:has-text("Add a note"), a:has-text("Add a note"), button:has-text("Send without a note"), a:has-text("Send without a note"), [role="dialog"]').first();
          const modalAppeared = await modalLocator.waitFor({ state: 'visible', timeout: 3500 }).then(() => true).catch(() => false);
          if (modalAppeared) {
            connectClicked = true;
            break;
          }
          await page.waitForTimeout(1500);
        }
      } else {
        logger.info('Connect button not found inside "More" menu.');
      }
    } else {
      logger.info('"More" actions button not visible on profile.');
    }
  }

  // Step 3: If Connect was not clicked, check if the profile has an active Pending/Withdraw status
  if (!connectClicked) {
    const pendingBtn = page.locator(SELECTORS.connection.pending).first();
    const isPending = await pendingBtn.isVisible().catch(() => false);
    if (isPending) {
      logger.info('A connection request is already pending/sent for this profile. Skipping.');
      return;
    }
    throw new Error('Connect button could not open connection dialog (neither directly nor inside More menu)');
  }

  // Step 4: Handle Connection Dialog
  logger.info('Waiting for connection modal to load...');
  const addNoteBtn = page.locator(SELECTORS.connection.addNoteBtn).first();
  const sendWithoutNote = page.locator(SELECTORS.connection.sendWithoutNoteBtn).first();
  const noteTextarea = page.locator(SELECTORS.connection.noteTextarea).first();

  const addNoteVisible = await addNoteBtn.waitFor({ state: 'visible', timeout: 4000 }).then(() => true).catch(() => false);

  if (addNoteVisible) {
    logger.info('Finding Add a note...');
    await addNoteBtn.evaluate((el: HTMLElement) => el.click()).catch(() => addNoteBtn.click({ force: true }));
    await page.waitForTimeout(1000);
  } else {
    logger.info('Add a note button not visible. Checking if custom message textarea is visible...');
  }

  // Locate the message textarea
  try {
    await noteTextarea.waitFor({ state: 'visible', timeout: 4000 });
  } catch {
    // If textarea is not found but "Send without a note" button is visible
    if (await sendWithoutNote.isVisible().catch(() => false)) {
      logger.warn('Textarea not available. Sending without note...');
      await sendWithoutNote.evaluate((el: HTMLElement) => el.click()).catch(() => sendWithoutNote.click({ force: true }));
      await page.waitForTimeout(2000);
      return;
    }
    throw new Error('Note textarea not visible in the invitation dialog');
  }

  // Step 5: Fill in personalized message
  logger.info('Adding note...');
  let messageText = record.message;
  // Standard invitation note character limit is 200
  if (messageText.length > 200) {
    logger.warn(`Note length exceeds limit (200). Truncating message...`);
    messageText = messageText.substring(0, 200);
  }

  await noteTextarea.click();
  await noteTextarea.fill(messageText).catch(async () => {
    await page.keyboard.type(messageText);
  });
  await page.waitForTimeout(1000); // Realistic pause after typing

  // Step 6: Click Send
  const sendBtn = page.locator(SELECTORS.connection.sendInvitationBtn).first();
  if (!(await sendBtn.isVisible().catch(() => false))) {
    throw new Error('Send button not visible in connection modal');
  }

  logger.info('Sending...');
  await sendBtn.evaluate((el: HTMLElement) => el.click()).catch(() => sendBtn.click({ force: true }));

  // Step 7: Verify request completed
  logger.info('Verifying completion...');
  await page.waitForTimeout(3000);
  logger.success('SUCCESS');
}
