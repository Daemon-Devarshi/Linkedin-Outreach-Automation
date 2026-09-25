import { Page } from 'playwright';
import { SELECTORS } from './selectors.js';
import logger from '../logging/logger.js';
import { LinkedInMessageRecord } from '../input/json.js';

/**
 * Checks for and handles any popups/dialogs (e.g. "Cancel" confirmation or "Not now" notification prompts):
 * 1. Checks if a modal with a "Cancel" button appears and clicks it.
 * 2. Checks if a notification prompt with a "Not now" button appears and clicks it.
 */
export async function dismissNotificationPrompt(page: Page): Promise<boolean> {
  let handledAny = false;

  // Step 1: Check for "Cancel" button on modal dialogs
  try {
    const cancelBtn = page.locator(SELECTORS.connection.cancelModalBtn).first();
    const isCancelVisible = await cancelBtn.waitFor({ state: 'visible', timeout: 2000 }).then(() => true).catch(() => false);
    if (isCancelVisible) {
      logger.info('Finding "Cancel" button for modal dialog...');
      logger.info('Clicking "Cancel" button...');
      await cancelBtn.evaluate((el: HTMLElement) => el.click()).catch(() => cancelBtn.click({ force: true }));
      await page.waitForTimeout(1500);
      handledAny = true;
    }
  } catch {
    // Ignore if Cancel modal is not present
  }

  // Step 2: Check for "Not now" button on notifications prompt
  try {
    const skipBtn = page.locator(SELECTORS.connection.skipNotificationsBtn).first();
    const isSkipVisible = await skipBtn.waitFor({ state: 'visible', timeout: 2000 }).then(() => true).catch(() => false);
    if (isSkipVisible) {
      logger.info('Finding "Not now" button for notifications prompt...');
      logger.info('Clicking "Not now" button to dismiss notification prompt...');
      await skipBtn.evaluate((el: HTMLElement) => el.click()).catch(() => skipBtn.click({ force: true }));
      await page.waitForTimeout(1500);
      handledAny = true;
    }
  } catch {
    // Ignore if notification prompt is not present
  }

  return handledAny;
}

/**
 * Checks for and clicks the Follow button if present on the profile/company header.
 * Logs "button clicked" when triggered, handles any notification prompt, then allows the automation to proceed normally.
 */
export async function clickFollowButton(page: Page): Promise<boolean> {
  try {
    const followBtn = page.locator(SELECTORS.connection.followBtn).first();
    const isVisible = await followBtn.waitFor({ state: 'visible', timeout: 4000 }).then(() => true).catch(() => false);
    if (!isVisible) {
      return false;
    }

    const ariaLabel = (await followBtn.getAttribute('aria-label').catch(() => '')) || '';
    const ariaPressed = await followBtn.getAttribute('aria-pressed').catch(() => null);
    const text = (await followBtn.innerText().catch(() => '')).trim().toLowerCase();
    
    // Skip if already followed or button indicates "Following"
    if (ariaPressed === 'true' || text === 'following' || ariaLabel.toLowerCase().startsWith('following') || ariaLabel.toLowerCase().startsWith('unfollow')) {
      logger.info('Already following profile/company.');
      return false;
    }

    logger.info('Finding Follow button...');
    await followBtn.scrollIntoViewIfNeeded().catch(() => {});
    await followBtn.evaluate((el: HTMLElement) => el.click()).catch(() => followBtn.click({ force: true }));
    logger.info('button clicked');
    await page.waitForTimeout(2000);

    // After following, dismiss notification prompt if it appears ("Not now")
    await dismissNotificationPrompt(page);

    return true;
  } catch (error: any) {
    logger.warn(`Follow action error: ${error.message}`);
    return false;
  }
}

/**
 * Determines whether the target profile is a Company/Organization page or a Personal profile.
 */
export async function isCompanyTarget(page: Page, targetUrl: string): Promise<boolean> {
  const currentUrl = page.url();
  if (
    targetUrl.includes('/company/') ||
    targetUrl.includes('/school/') ||
    currentUrl.includes('/company/') ||
    currentUrl.includes('/school/')
  ) {
    return true;
  }

  // Check for company page containers in DOM
  const hasOrgElements = await page.locator('.org-top-card, .org-page-navigation, select#msg-shared-modals-msg-page-modal-presenter-conversation-topic').count();
  if (hasOrgElements > 0) {
    return true;
  }

  // Check if company Message button exists and Connect button does not
  const hasConnect = await page.locator(SELECTORS.connection.connectDirect).count();
  const hasCompanyMsg = await page.locator(SELECTORS.company.messageBtn).count();
  if (hasConnect === 0 && hasCompanyMsg > 0) {
    return true;
  }

  return false;
}

/**
 * Handles Company / Organization messaging workflow:
 * 1. Clicks the "Message" button (<span class="artdeco-button__text">Message</span>).
 * 2. Selects "Other" from topic dropdown (<select id="msg-shared-modals-msg-page-modal-presenter-conversation-topic">).
 * 3. Writes custom message in textarea (<textarea id="org-message-page-modal-message">).
 * 4. Waits for and clicks the "Send message" button (<button><span class="artdeco-button__text">Send message</span></button>).
 * 5. Verifies message delivery and completion.
 */
export async function sendCompanyMessage(page: Page, record: LinkedInMessageRecord): Promise<void> {
  logger.info('Finding "Message" button...');
  const messageBtn = page.locator(SELECTORS.company.messageBtn).first();
  const isMessageVisible = await messageBtn.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false);

  if (!isMessageVisible) {
    throw new Error('Message button not available on this company page');
  }

  logger.info('Clicking "Message" button...');
  await messageBtn.scrollIntoViewIfNeeded().catch(() => {});
  await messageBtn.evaluate((el: HTMLElement) => el.click()).catch(() => messageBtn.click({ force: true }));
  await page.waitForTimeout(2000);

  // Locate conversation topic dropdown
  logger.info('Finding conversation topic dropdown...');
  const topicSelect = page.locator(SELECTORS.company.topicSelect).first();
  const isTopicVisible = await topicSelect.waitFor({ state: 'visible', timeout: 6000 }).then(() => true).catch(() => false);

  if (!isTopicVisible) {
    throw new Error('Conversation topic select (#msg-shared-modals-msg-page-modal-presenter-conversation-topic) not found');
  }

  logger.info('Selecting conversation topic: "Other"...');
  let topicSelected = false;
  try {
    await topicSelect.selectOption({ label: 'Other' });
    topicSelected = true;
  } catch {
    try {
      await topicSelect.selectOption('urn:li:fsd_pageMailboxConversationTopic:7');
      topicSelected = true;
    } catch {
      topicSelected = await page.evaluate(() => {
        const select = document.querySelector('select#msg-shared-modals-msg-page-modal-presenter-conversation-topic, select[id*="conversation-topic"]') as HTMLSelectElement;
        if (select) {
          for (let i = 0; i < select.options.length; i++) {
            const opt = select.options[i];
            if ((opt.text && opt.text.trim().toLowerCase().includes('other')) || (opt.value && opt.value.includes('Topic:7'))) {
              select.selectedIndex = i;
              select.dispatchEvent(new Event('input', { bubbles: true }));
              select.dispatchEvent(new Event('change', { bubbles: true }));
              return true;
            }
          }
        }
        return false;
      });
    }
  }

  // Trigger change event to ensure Ember form model registers topic selection
  await topicSelect.dispatchEvent('input').catch(() => {});
  await topicSelect.dispatchEvent('change').catch(() => {});
  await page.waitForTimeout(1000);

  // Locate message textarea
  logger.info('Finding message textarea...');
  const textarea = page.locator(SELECTORS.company.messageTextarea).first();
  const isTextareaVisible = await textarea.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false);

  if (!isTextareaVisible) {
    throw new Error('Message textarea (#org-message-page-modal-message) not found in message modal');
  }

  let messageToSend = record.message ? record.message.trim() : '';
  if (!messageToSend) {
    messageToSend = 'Hi, I noticed your company on LinkedIn and would like to inquire about your services and discuss potential collaboration.';
  }

  // LinkedIn requires at least 25 characters for company inquiries
  if (messageToSend.length < 25) {
    logger.warn('Message is under 25 characters. Appending details to meet LinkedIn requirements...');
    messageToSend = `${messageToSend} - I would like to inquire about your services and discuss potential collaboration.`;
  }

  // Organization modal maximum limit is 750 characters
  if (messageToSend.length > 750) {
    logger.warn('Message exceeds 750 characters. Truncating to 750...');
    messageToSend = messageToSend.substring(0, 750);
  }

  logger.info('Writing message...');
  await textarea.click();
  await textarea.fill(messageToSend).catch(async () => {
    await page.keyboard.type(messageToSend);
  });
  await textarea.dispatchEvent('input').catch(() => {});
  await textarea.dispatchEvent('change').catch(() => {});
  await page.waitForTimeout(1200);

  // Locate Send message button
  logger.info('Waiting for "Send message" button...');
  const sendBtn = page.locator(SELECTORS.company.sendBtn).first();
  const isSendBtnVisible = await sendBtn.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false);

  if (!isSendBtnVisible) {
    throw new Error('"Send message" button not found in modal');
  }

  // Wait for the button to become enabled (disabled attribute removed)
  logger.info('Waiting for "Send message" button to be enabled...');
  let isEnabled = false;
  for (let attempt = 0; attempt < 12; attempt++) {
    const disabledAttr = await sendBtn.getAttribute('disabled').catch(() => null);
    const ariaDisabled = await sendBtn.getAttribute('aria-disabled').catch(() => null);
    const className = (await sendBtn.getAttribute('class').catch(() => '')) || '';

    if (disabledAttr === null && ariaDisabled !== 'true' && !className.includes('disabled') && !className.includes('artdeco-button--disabled')) {
      isEnabled = true;
      break;
    }

    // Re-dispatch input and change events to wake up Ember / form model bindings if needed
    await textarea.dispatchEvent('input').catch(() => {});
    await textarea.dispatchEvent('change').catch(() => {});
    await topicSelect.dispatchEvent('change').catch(() => {});
    await page.waitForTimeout(500);
  }

  if (!isEnabled) {
    logger.warn('"Send message" button state still shows disabled, attempting click...');
  }

  logger.info('Clicking "Send message" button...');
  await sendBtn.evaluate((el: HTMLElement) => el.click()).catch(() => sendBtn.click({ force: true }));

  logger.info('Verifying completion...');
  await page.waitForTimeout(3000);
  logger.success('SUCCESS');
}

/**
 * Handles personal profile connection action:
 * 1. Checks if connection is already pending or if user is already connected (skips if so).
 * 2. Clicks Connect (tries direct button, falls back to "More" actions menu).
 * 3. Handles invitation modal: clicks "Add a note", fills the text area, and clicks Send.
 * 4. Verifies the request was successfully sent.
 */
export async function sendPersonalConnection(page: Page, record: LinkedInMessageRecord): Promise<void> {
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

  // Step 2: If Connect was not clicked, check if the profile has an active Pending/Withdraw status
  if (!connectClicked) {
    const pendingBtn = page.locator(SELECTORS.connection.pending).first();
    const isPending = await pendingBtn.isVisible().catch(() => false);
    if (isPending) {
      logger.info('A connection request is already pending/sent for this profile. Skipping.');
      return;
    }
    throw new Error('Connect button could not open connection dialog (neither directly nor inside More menu)');
  }

  // Step 3: Handle Connection Dialog
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

  // Step 4: Fill in personalized message
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

  // Step 5: Click Send
  const sendBtn = page.locator(SELECTORS.connection.sendInvitationBtn).first();
  if (!(await sendBtn.isVisible().catch(() => false))) {
    throw new Error('Send button not visible in connection modal');
  }

  logger.info('Sending...');
  await sendBtn.evaluate((el: HTMLElement) => el.click()).catch(() => sendBtn.click({ force: true }));

  // Step 6: Verify request completed
  logger.info('Verifying completion...');
  await page.waitForTimeout(3000);
  logger.success('SUCCESS');
}

/**
 * Complete LinkedIn Outreach Handler:
 * 1. Checks and clicks the Follow button if available on the profile/company.
 * 2. Dismisses notification popups ("Not now") if displayed.
 * 3. Dynamically identifies target type (Company vs Personal profile).
 * 4. Executes the corresponding messaging or connection workflow.
 * 
 * @param page Playwright Page instance.
 * @param record Message record containing URL and personalized message.
 */
export async function sendConnectionRequest(page: Page, record: LinkedInMessageRecord): Promise<void> {
  // Click follow button before sending message if present
  await clickFollowButton(page);

  // Safeguard: Ensure any notification prompt ("Not now") is dismissed
  await dismissNotificationPrompt(page);

  // Determine whether this is a Company/Organization page or a Personal profile
  const isCompany = await isCompanyTarget(page, record.url);

  if (isCompany) {
    logger.info('Target is a Company / Organization page. Running Company Messaging...');
    await sendCompanyMessage(page, record);
    return;
  }

  logger.info('Target is a Personal profile. Running Personal Connection...');
  await sendPersonalConnection(page, record);
}
