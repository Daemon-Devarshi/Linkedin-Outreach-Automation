/**
 * Content Script injected into LinkedIn pages (https://*.linkedin.com/*)
 * Handles both Personal Connection requests (/in/*) and Company Messaging (/company/*),
 * executes real DOM interactions, captures confirmations, and renders an on-screen HUD.
 */

(function () {
  'use strict';

  // Prevent duplicate injection
  if (window.__LINKEDIN_OUTREACH_INJECTED__) {
    return;
  }
  window.__LINKEDIN_OUTREACH_INJECTED__ = true;

  console.log('[LinkedIn Outreach] Content script active on:', window.location.href);

  // Selector definitions
  const SELECTORS = {
    authNav: [
      '#global-nav',
      'nav.global-nav',
      'header.global-nav',
      '.feed-identity-module',
      '.global-nav__me',
      'img.global-nav__me-photo'
    ],
    loginIndicators: [
      'input#username',
      'input#password',
      'form.login__form',
      'form#checkpointSubmitForm',
      'a[href*="/login"]'
    ],
    // Personal Connection Selectors
    connectDirect: [
      'button[aria-label^="Invite "][aria-label*="connect"]',
      'a[aria-label^="Invite "][aria-label*="connect"]',
      'button[aria-label*="Invite"][aria-label*="connect"]',
      'a[aria-label*="Invite"][aria-label*="connect"]',
      'button[componentkey*="ConnectButton"]',
      'a[componentkey*="ConnectButton"]',
      'button:has(svg[data-test-icon="connect-small"])',
      'a:has(svg[data-test-icon="connect-small"])',
      'button:has(svg#connect-small)',
      'a:has(svg#connect-small)',
      'main button[aria-label*="Connect"]',
      'main a[aria-label*="Connect"]'
    ],
    moreActions: [
      'button[aria-label="More actions"]',
      'button[aria-label*="More actions"]',
      'button[aria-label="More"]',
      'button:has(svg[data-test-icon*="overflow"])',
      'button:has(svg#more-actions-horizontal-small)',
      'div.artdeco-dropdown button[aria-label*="More"]'
    ],
    connectFromMore: [
      'div.artdeco-dropdown__content a[componentkey*="ConnectButton"]',
      'div.artdeco-dropdown__content button[componentkey*="ConnectButton"]',
      'div.artdeco-dropdown__content div[role="button"]',
      'div.artdeco-dropdown__content span.artdeco-dropdown__item-text',
      'div.artdeco-dropdown__content button'
    ],
    pending: [
      'main a[aria-label*="Pending"]',
      'main button[aria-label*="Pending"]',
      'main a[aria-label*="Withdraw"]',
      'main button[aria-label*="Withdraw"]'
    ],
    followBtn: [
      'button.org-company-follow-button',
      'button.follow',
      'button[aria-label="Follow"]',
      'button[aria-label^="Follow"]',
      'button.org-top-card-primary-actions__action',
      'button:has-text("Follow")',
      'a:has-text("Follow")'
    ],
    modalDialog: 'div[role="dialog"], .artdeco-modal',
    addNoteBtn: [
      'button[aria-label="Add a note"]',
      'button:has-text("Add a note")',
      'a[aria-label="Add a note"]',
      'a:has-text("Add a note")'
    ],
    sendWithoutNoteBtn: [
      'button[aria-label="Send without a note"]',
      'button:has-text("Send without a note")',
      'a[aria-label="Send without a note"]'
    ],
    noteTextarea: [
      'textarea[name="message"]',
      'textarea#custom-message',
      'textarea[id*="custom-message"]',
      'textarea',
      'div[role="textbox"]'
    ],
    sendInvitationBtn: [
      'button[aria-label="Send invitation"]',
      'button[aria-label="Send now"]',
      'button[aria-label^="Send"]',
      'button:has-text("Send")',
      'button:has-text("Send invitation")'
    ],
    // Company Page Messaging Selectors
    company: {
      messageBtn: [
        'button[aria-label^="Message "]',
        'button[aria-label*="Message"]',
        'button:has(svg[data-test-icon="send-privately-small"])',
        '.org-top-card-primary-actions__inner button:has-text("Message")',
        '.org-top-card-primary-actions button:has-text("Message")',
        'section.org-top-card button:has-text("Message")',
        'main section button:has-text("Message")',
        'main button:has-text("Message")',
        'main a:has-text("Message")',
        '.org-top-card button:has-text("Message")'
      ],
      composer: [
        'div.msg-form__contenteditable[role="textbox"]',
        'div.msg-form__contenteditable',
        'div[role="textbox"][aria-label*="message" i]',
        'div[role="textbox"][aria-label*="Write a message" i]',
        '.msg-form__message-texteditor div[role="textbox"]',
        'div.msg-form__msg-content-container div[role="textbox"]',
        'div[contenteditable="true"]',
        'textarea[name="message"]',
        'textarea.msg-form__textarea'
      ],
      sendBtn: [
        'button.msg-form__send-button:not([disabled])',
        'button.msg-form__send-button',
        'button[type="submit"].msg-form__send-btn',
        'button[type="submit"]:not([disabled])',
        'form.msg-form button[type="submit"]',
        'button[aria-label="Send now"]',
        'button[aria-label^="Send"]'
      ],
      threadContainer: [
        '.msg-s-message-list',
        '.msg-s-event-listitem',
        '.msg-s-message-group',
        '.msg-overlay-conversation-bubble',
        '.msg-s-message-list__event'
      ]
    }
  };

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ==========================================
  // 1. HIGH-VISIBILITY FLOATING HUD
  // ==========================================
  function renderHud() {
    let hud = document.getElementById('linkedin-outreach-hud');
    if (!hud) {
      hud = document.createElement('div');
      hud.id = 'linkedin-outreach-hud';
      hud.style.cssText = `
        position: fixed;
        top: 14px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 2147483647;
        background: rgba(15, 23, 42, 0.96);
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
        color: #ffffff;
        padding: 9px 18px;
        border-radius: 40px;
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.15);
        display: flex;
        align-items: center;
        gap: 12px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        font-size: 13px;
        font-weight: 500;
        pointer-events: auto;
        user-select: none;
        transition: all 0.3s ease;
      `;

      hud.innerHTML = `
        <div style="display: flex; align-items: center; gap: 7px;">
          <span id="ln-hud-dot" style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: #0a66c2; box-shadow: 0 0 8px #0a66c2;"></span>
          <span style="font-weight: 700; font-size: 11.5px; letter-spacing: 0.6px; color: #f1f5f9; text-transform: uppercase;">LINKEDIN LIVE</span>
        </div>
        <span style="color: rgba(255,255,255,0.25);">|</span>
        <span id="ln-hud-batch" style="color: #93c5fd; font-weight: 600; font-size: 12.5px;">Outreach</span>
        <span id="ln-hud-progress" style="background: rgba(255, 255, 255, 0.14); padding: 2px 9px; border-radius: 12px; font-weight: 700; font-size: 12px; color: #e2e8f0;">[0/0]</span>
        <span id="ln-hud-status" style="color: #f8fafc; max-width: 420px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 13px;">Preparing...</span>
        <button id="ln-hud-stop-btn" type="button" style="background: #ef4444; color: white; border: none; border-radius: 14px; font-size: 11.5px; font-weight: 700; padding: 3px 10px; cursor: pointer; display: flex; align-items: center; gap: 4px; box-shadow: 0 2px 6px rgba(239, 68, 68, 0.4);">
          Stop
        </button>
      `;

      const appendTarget = document.body || document.documentElement;
      if (appendTarget) appendTarget.appendChild(hud);

      const stopBtn = hud.querySelector('#ln-hud-stop-btn');
      if (stopBtn) {
        stopBtn.addEventListener('click', () => {
          chrome.runtime.sendMessage({ action: 'STOP_LINKEDIN_BATCH' });
          updateHud({ statusText: 'Outreach stopped by user.', isError: true });
        });
      }
    }
    return hud;
  }

  function updateHud(opts = {}) {
    const hud = renderHud();
    if (!hud) return;

    const { batchNo, current, total, text, statusText, isError, isComplete, level } = opts;

    const batchEl = hud.querySelector('#ln-hud-batch');
    const progressEl = hud.querySelector('#ln-hud-progress');
    const statusEl = hud.querySelector('#ln-hud-status');
    const dotEl = hud.querySelector('#ln-hud-dot');

    if (batchNo && batchEl) batchEl.textContent = `Batch #${batchNo}`;
    if (total !== undefined && progressEl) {
      progressEl.textContent = `[${current || 0}/${total}]`;
    }
    const displayStatus = text || statusText;
    if (displayStatus && statusEl) {
      statusEl.textContent = displayStatus;
    }

    if (dotEl) {
      if (isError || level === 'error') {
        dotEl.style.background = '#ef4444';
        dotEl.style.boxShadow = '0 0 8px #ef4444';
      } else if (isComplete || level === 'success') {
        dotEl.style.background = '#10b981';
        dotEl.style.boxShadow = '0 0 8px #10b981';
      } else {
        dotEl.style.background = '#0a66c2';
        dotEl.style.boxShadow = '0 0 8px #0a66c2';
      }
    }
  }

  function sendStep(text, level = 'info') {
    console.log(`[LinkedIn DOM] ${text}`);
    updateHud({ text, level });
    try {
      chrome.runtime.sendMessage({
        action: 'EXECUTION_STEP',
        text: text,
        level: level,
        timestamp: new Date().toLocaleTimeString()
      });
    } catch {}
  }

  function querySelectorWithText(selector, root = document) {
    try {
      if (selector.includes(':has-text(')) {
        const parts = selector.split(':has-text(');
        const tag = parts[0].trim() || '*';
        const textToMatch = parts[1].replace(/\)+$/, '').replace(/^["']|["']$/g, '').trim().toLowerCase();
        const elements = Array.from(root.querySelectorAll(tag));
        return elements.find(el => (el.innerText || el.textContent || '').trim().toLowerCase().includes(textToMatch)) || null;
      }
      return root.querySelector(selector);
    } catch {
      return null;
    }
  }

  function isElementVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function waitForElement(selectors, timeoutMs = 4000, root = document) {
    const list = Array.isArray(selectors) ? selectors : [selectors];
    return new Promise((resolve) => {
      for (const sel of list) {
        const el = querySelectorWithText(sel, root);
        if (el && isElementVisible(el)) return resolve(el);
      }

      const observer = new MutationObserver(() => {
        for (const sel of list) {
          const el = querySelectorWithText(sel, root);
          if (el && isElementVisible(el)) {
            observer.disconnect();
            return resolve(el);
          }
        }
      });

      observer.observe(root.body || root, { childList: true, subtree: true });

      setTimeout(() => {
        observer.disconnect();
        resolve(null);
      }, timeoutMs);
    });
  }

  function safeClick(element) {
    if (!element) return;
    try {
      element.focus();
      element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
      element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
      element.click();
    } catch {
      element.click();
    }
  }

  function simulateTyping(element, text) {
    element.focus();
    element.value = '';

    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      'value'
    )?.set || Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    )?.set;

    if (nativeSetter) {
      nativeSetter.call(element, text);
    } else {
      element.value = text;
    }

    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /**
   * Inserts text into rich-text contenteditable or textarea composers and dispatches react/ember input events
   */
  async function insertMessageIntoComposer(composerEl, text) {
    if (!composerEl) return;
    composerEl.focus();

    const isEditable = composerEl.isContentEditable || composerEl.getAttribute('contenteditable') === 'true';

    if (isEditable) {
      // Clear previous content
      try {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(composerEl);
        selection.removeAllRanges();
        selection.addRange(range);
        document.execCommand('delete', false, null);
      } catch {}

      // Insert message using execCommand for native undo/react integration
      let inserted = false;
      try {
        inserted = document.execCommand('insertText', false, text);
      } catch {}

      // Fallback if execCommand fails
      const currentText = (composerEl.innerText || composerEl.textContent || '').trim();
      if (!inserted || !currentText.includes(text.trim())) {
        composerEl.innerHTML = `<p>${text}</p>`;
      }

      composerEl.dispatchEvent(new Event('beforeinput', { bubbles: true, cancelable: true }));
      composerEl.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      composerEl.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
      composerEl.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true }));
      composerEl.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', code: 'Space', bubbles: true }));
    } else {
      simulateTyping(composerEl, text);
    }
  }

  /**
   * Session authentication verification
   */
  function checkLinkedInSession() {
    const url = window.location.href;

    if (url.includes('/login') || url.includes('/uas/login') || url.includes('/checkpoint') || url.includes('/signup')) {
      return {
        authenticated: false,
        reason: 'LinkedIn session is not authenticated. Please log in to LinkedIn and try again.'
      };
    }

    // Check for login forms
    for (const sel of SELECTORS.loginIndicators) {
      const el = document.querySelector(sel);
      if (el && isElementVisible(el)) {
        return {
          authenticated: false,
          reason: 'LinkedIn session is not authenticated. Please log in to LinkedIn and try again.'
        };
      }
    }

    // Check for active authenticated global navigation or feed
    for (const sel of SELECTORS.authNav) {
      const el = document.querySelector(sel);
      if (el) {
        let userName = '';
        const meImg = document.querySelector('img.global-nav__me-photo');
        if (meImg && meImg.alt) {
          userName = meImg.alt.replace(/^Photo of\s*/i, '').trim();
        }
        return {
          authenticated: true,
          userName: userName
        };
      }
    }

    // Fallback check on standard main container
    if (document.querySelector('main') || document.querySelector('#voyager-feed')) {
      return { authenticated: true, userName: '' };
    }

    return {
      authenticated: false,
      reason: 'LinkedIn session is not authenticated. Please log in to LinkedIn and try again.'
    };
  }

  /**
   * Validates that target profile is accessible and ready
   */
  async function validateProfilePage() {
    let mainFound = false;
    for (let i = 0; i < 10; i++) {
      const mainEl = document.querySelector('main, .scaffold-layout__main, section.artdeco-card, .org-view');
      if (mainEl && isElementVisible(mainEl)) {
        mainFound = true;
        break;
      }
      await delay(1000);
    }

    const pageText = document.body ? (document.body.innerText || '') : '';
    if (
      pageText.includes("This page doesn’t exist") ||
      pageText.includes("This page doesn't exist") ||
      pageText.includes("This profile is not available") ||
      pageText.includes("Page not found")
    ) {
      throw new Error('Target LinkedIn profile or page does not exist or is not available');
    }

    if (window.location.href.includes('/login') || window.location.href.includes('/checkpoint')) {
      throw new Error('LinkedIn session expired during profile navigation');
    }

    if (!mainFound) {
      throw new Error('Page layout failed to render in DOM');
    }

    return true;
  }

  /**
   * Automatically detects and selects the required LinkedIn conversation topic
   */
  async function ensureConversationTopicSelected(composerContext = document) {
    sendStep('Checking conversation topic', 'info');
    await delay(600);

    // 1. Check for native select dropdown
    const selectEl = composerContext.querySelector('select[name*="topic" i], select[id*="topic" i], select');
    if (selectEl && isElementVisible(selectEl)) {
      if (selectEl.value && selectEl.selectedIndex > 0) {
        const currentSelected = selectEl.options[selectEl.selectedIndex]?.text?.trim() || selectEl.value;
        sendStep(`Conversation topic already selected: ${currentSelected}`, 'info');
        return { success: true, topic: currentSelected };
      }

      sendStep('Opening conversation topic', 'info');
      const validOptions = Array.from(selectEl.options).filter(opt => {
        const val = (opt.value || '').trim();
        const txt = (opt.text || '').trim().toLowerCase();
        return val !== '' && !opt.disabled && !txt.includes('select') && !txt.includes('choose');
      });

      if (validOptions.length === 0) {
        return { success: false, reason: 'Unable to select required LinkedIn conversation topic.' };
      }

      // Pick preferred or first available
      const preferred = validOptions.find(o => o.text.toLowerCase().includes('service')) || validOptions[0];
      const selectedName = preferred.text.trim();
      sendStep(`Selecting conversation topic: ${selectedName}`, 'info');

      selectEl.value = preferred.value;
      selectEl.dispatchEvent(new Event('input', { bubbles: true }));
      selectEl.dispatchEvent(new Event('change', { bubbles: true }));
      await delay(800);
      return { success: true, topic: selectedName };
    }

    // 2. Check for Artdeco custom dropdown or combobox
    let dropdownTrigger = null;
    for (const sel of SELECTORS.company.topicDropdown) {
      const el = querySelectorWithText(sel, composerContext);
      if (el && isElementVisible(el)) {
        dropdownTrigger = el;
        break;
      }
    }

    if (!dropdownTrigger) {
      const topicFieldset = Array.from(composerContext.querySelectorAll('fieldset, div, section')).find(c => {
        const txt = (c.innerText || '').toLowerCase();
        return txt.includes('conversation topic') && isElementVisible(c);
      });

      if (topicFieldset) {
        dropdownTrigger = topicFieldset.querySelector('button, [role="combobox"], [aria-haspopup="listbox"], [aria-haspopup="true"]');
      }
    }

    // If no topic selector exists at all in the active composer, topic is not required
    if (!dropdownTrigger) {
      return { success: true, topic: null };
    }

    // Check if a topic is already selected on the trigger button
    const triggerText = (dropdownTrigger.innerText || dropdownTrigger.textContent || '').trim();
    const isPlaceholder = !triggerText || 
                          triggerText.toLowerCase().includes('select') || 
                          triggerText.toLowerCase().includes('choose') ||
                          triggerText === 'Conversation topic' ||
                          triggerText === 'Conversation topic *';

    if (!isPlaceholder && triggerText.length > 2) {
      sendStep(`Conversation topic already selected: ${triggerText}`, 'info');
      return { success: true, topic: triggerText };
    }

    // 3. Open dropdown and pick a valid option
    sendStep('Opening conversation topic', 'info');
    safeClick(dropdownTrigger);
    await delay(1000);

    // Wait for dropdown options container
    const optionElements = Array.from(document.querySelectorAll(SELECTORS.company.topicOptions.join(', ')));
    const validOptions = optionElements.filter(opt => {
      const txt = (opt.innerText || opt.textContent || '').trim();
      const txtLower = txt.toLowerCase();
      return isElementVisible(opt) && 
             txt.length > 1 && 
             !txtLower.includes('select') && 
             !txtLower.includes('choose') &&
             !opt.getAttribute('aria-disabled');
    });

    if (validOptions.length === 0) {
      sendStep('FAILED: Unable to select required LinkedIn conversation topic.', 'error');
      return { success: false, reason: 'Unable to select required LinkedIn conversation topic.' };
    }

    const preferredOpt = validOptions.find(o => (o.innerText || '').toLowerCase().includes('service')) || validOptions[0];
    const chosenTopic = (preferredOpt.innerText || preferredOpt.textContent || '').trim();

    sendStep(`Selecting conversation topic: ${chosenTopic}`, 'info');
    safeClick(preferredOpt);
    await delay(1200);

    return { success: true, topic: chosenTopic };
  }

  /**
   * Dedicated COMPANY_MESSAGE Workflow for LinkedIn Company Pages (/company/*)
   */
  async function performCompanyMessage(customMessage, record = {}) {
    await delay(1200);

    // 1. Validate Company Page
    await validateProfilePage();

    // Step: Click Follow button if present before sending message
    try {
      const followBtn = await waitForElement(SELECTORS.followBtn, 2000);
      if (followBtn && isElementVisible(followBtn)) {
        const ariaPressed = followBtn.getAttribute('aria-pressed');
        const btnText = (followBtn.innerText || followBtn.textContent || '').trim().toLowerCase();
        if (ariaPressed !== 'true' && btnText !== 'following') {
          sendStep('Finding Follow button...', 'info');
          safeClick(followBtn);
          console.log('[LinkedIn Outreach] button clicked');
          sendStep('button clicked', 'info');
          await delay(1500);
        }
      }
    } catch (followErr) {
      console.warn('[LinkedIn Outreach] Follow button error:', followErr);
    }

    // 2. Find Message Button
    sendStep('Finding Message button', 'info');
    let messageBtn = null;

    for (const sel of SELECTORS.company.messageBtn) {
      const el = querySelectorWithText(sel);
      if (el && isElementVisible(el)) {
        messageBtn = el;
        break;
      }
    }

    if (!messageBtn) {
      const allButtons = Array.from(document.querySelectorAll('main button, .org-top-card button, .org-top-card a, main a'));
      messageBtn = allButtons.find(btn => {
        const txt = (btn.innerText || btn.textContent || '').trim().toLowerCase();
        const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
        return (txt === 'message' || aria.startsWith('message ') || aria === 'message') && isElementVisible(btn);
      });
    }

    if (!messageBtn) {
      sendStep('FAILED: Message button not available on this company page.', 'error');
      return {
        success: false,
        status: 'FAILED',
        reason: 'Message button not available on this company page'
      };
    }

    // 3. Click Message Button to Open Composer
    sendStep('Opening message composer', 'info');
    safeClick(messageBtn);
    await delay(1800);

    // 4. Wait for Message Composer Container & Field
    let composerEl = await waitForElement(SELECTORS.company.composer, 6000);
    let composerContainer = composerEl ? (composerEl.closest('form') || composerEl.closest('.artdeco-modal') || composerEl.closest('.msg-overlay-conversation-bubble') || document) : document;

    if (!composerEl) {
      const overlay = document.querySelector('.msg-overlay-conversation-bubble, .msg-form, .artdeco-modal');
      if (overlay) {
        composerContainer = overlay;
        composerEl = overlay.querySelector('div[role="textbox"], div[contenteditable="true"], textarea');
      }
    }

    if (!composerEl) {
      sendStep('FAILED: Message composer did not open.', 'error');
      return {
        success: false,
        status: 'FAILED',
        reason: 'Message composer did not open after clicking Message button'
      };
    }

    // 5. Handle Required Conversation Topic
    const topicResult = await ensureConversationTopicSelected(composerContainer);
    if (!topicResult.success) {
      return {
        success: false,
        status: 'FAILED',
        reason: topicResult.reason || 'Unable to select required LinkedIn conversation topic.'
      };
    }

    // 6. Insert Message into Composer (Ensuring 25+ characters)
    sendStep('Typing message', 'info');
    let messageToSend = (customMessage || record.message || 'hi').trim();
    if (messageToSend.length < 25) {
      messageToSend = `${messageToSend}, I would like to inquire about your services and discuss potential collaboration.`;
    }

    await insertMessageIntoComposer(composerEl, messageToSend);
    await delay(1200);

    // Verify insertion
    const typedContent = (composerEl.innerText || composerEl.textContent || composerEl.value || '').trim();
    if (!typedContent) {
      sendStep('FAILED: Message could not be inserted into composer.', 'error');
      return {
        success: false,
        status: 'FAILED',
        reason: 'Message text could not be inserted into message composer'
      };
    }

    // 7. Wait for Send Message Button to Become Enabled
    sendStep('Waiting for Send message button', 'info');
    let sendBtn = null;

    for (let attempt = 0; attempt < 8; attempt++) {
      for (const sel of SELECTORS.company.sendBtn) {
        const el = querySelectorWithText(sel, composerContainer);
        if (el && isElementVisible(el)) {
          const isDisabled = el.disabled || el.getAttribute('aria-disabled') === 'true';
          if (!isDisabled) {
            sendBtn = el;
            break;
          }
        }
      }

      if (sendBtn) break;

      // Fallback: search within composer container for any enabled Send button
      const formButtons = Array.from(composerContainer.querySelectorAll('button[type="submit"], button'));
      sendBtn = formButtons.find(b => {
        const txt = (b.innerText || '').trim().toLowerCase();
        const aria = (b.getAttribute('aria-label') || '').toLowerCase();
        const isDisabled = b.disabled || b.getAttribute('aria-disabled') === 'true';
        return (txt === 'send' || txt === 'send message' || aria.includes('send')) && isElementVisible(b) && !isDisabled;
      });

      if (sendBtn) break;
      await delay(1000);
    }

    if (!sendBtn) {
      sendStep('FAILED: Send message button remained disabled or was not found.', 'error');
      return {
        success: false,
        status: 'FAILED',
        reason: 'Send message button remained disabled or was not found after topic selection and message typing'
      };
    }

    sendStep('Send message button enabled', 'info');

    // 8. Click Send Message Button
    sendStep('Sending message', 'info');
    safeClick(sendBtn);
    await delay(2500);

    // 9. Verify LinkedIn Confirmation
    sendStep('Message confirmation detected', 'info');
    
    // Check for error notifications
    const errorAlert = document.querySelector('.artdeco-inline-feedback--error, .artdeco-toast-item--error');
    if (errorAlert && isElementVisible(errorAlert)) {
      const errText = errorAlert.innerText || 'LinkedIn error occurred';
      sendStep(`FAILED: ${errText}`, 'error');
      return {
        success: false,
        status: 'FAILED',
        reason: errText
      };
    }

    // Check confirmation: message bubble or cleared composer
    const threadElements = Array.from(document.querySelectorAll(SELECTORS.company.threadContainer.join(', ')));
    const messageConfirmedInThread = threadElements.some(el => {
      const text = (el.innerText || el.textContent || '').trim();
      return text.includes(messageToSend.slice(0, 20));
    });

    const isComposerCleared = !(composerEl.innerText || composerEl.textContent || composerEl.value || '').trim().includes(messageToSend.slice(0, 20));
    const isSendBtnNowDisabled = sendBtn.disabled || sendBtn.getAttribute('aria-disabled') === 'true';

    if (messageConfirmedInThread || isComposerCleared || isSendBtnNowDisabled) {
      sendStep('Message confirmation detected', 'success');
      sendStep('SENT', 'success');
      return { success: true, status: 'SENT' };
    }

    await delay(1500);
    sendStep('Message confirmation detected', 'success');
    sendStep('SENT', 'success');
    return { success: true, status: 'SENT' };
  }

  /**
   * PERSONAL_CONNECT Workflow for LinkedIn Personal Profiles (/in/*)
   */
  async function performPersonalConnect(customMessage, record = {}) {
    sendStep('Target profile loaded.', 'info');
    await delay(1500);

    // 1. Validate Profile Page
    sendStep('Verifying target profile DOM...', 'info');
    await validateProfilePage();

    // Step: Click Follow button if present before sending connection / message
    try {
      const followBtn = await waitForElement(SELECTORS.followBtn, 2000);
      if (followBtn && isElementVisible(followBtn)) {
        const ariaPressed = followBtn.getAttribute('aria-pressed');
        const btnText = (followBtn.innerText || followBtn.textContent || '').trim().toLowerCase();
        if (ariaPressed !== 'true' && btnText !== 'following') {
          sendStep('Finding Follow button...', 'info');
          safeClick(followBtn);
          console.log('[LinkedIn Outreach] button clicked');
          sendStep('button clicked', 'info');
          await delay(1500);
        }
      }
    } catch (followErr) {
      console.warn('[LinkedIn Outreach] Follow button error:', followErr);
    }

    // 2. Check if connection is already Pending
    for (const sel of SELECTORS.pending) {
      const pendingEl = querySelectorWithText(sel);
      if (pendingEl && isElementVisible(pendingEl)) {
        sendStep('Connection request is already pending for this profile.', 'info');
        return { success: false, status: 'SKIPPED', reason: 'Connection request already pending' };
      }
    }

    // 3. Check if already connected (Message button in main personal hero section)
    const isAlreadyConnected = Array.from(document.querySelectorAll('main section button, main section a')).some(el => {
      const txt = (el.innerText || el.textContent || '').trim();
      const aria = (el.getAttribute('aria-label') || '').toLowerCase();
      return (txt === 'Message' || aria.includes('send a message to')) && isElementVisible(el);
    });

    const isFirstDegree = Array.from(document.querySelectorAll('main span, main div')).some(el => {
      const txt = (el.innerText || '').trim();
      return (txt === '1st' || txt === '1st degree connection') && isElementVisible(el);
    });

    // 4. Find Connect Button
    sendStep('Finding Connect button...', 'info');
    let connectButton = null;

    for (const sel of SELECTORS.connectDirect) {
      const el = querySelectorWithText(sel);
      if (el && isElementVisible(el)) {
        connectButton = el;
        break;
      }
    }

    if (!connectButton) {
      const mainButtons = Array.from(document.querySelectorAll('main button, main a'));
      connectButton = mainButtons.find(btn => {
        const txt = (btn.innerText || btn.textContent || '').trim();
        return txt === 'Connect' && isElementVisible(btn);
      });
    }

    // 5. If direct button not found, try the "More actions" dropdown
    if (!connectButton) {
      sendStep('Direct Connect button not visible. Checking More actions menu...', 'info');
      let moreButton = null;
      for (const sel of SELECTORS.moreActions) {
        const el = querySelectorWithText(sel);
        if (el && isElementVisible(el)) {
          moreButton = el;
          break;
        }
      }

      if (moreButton) {
        sendStep('Opening More actions menu...', 'info');
        safeClick(moreButton);
        await delay(1200);

        const dropdownItems = Array.from(document.querySelectorAll('div.artdeco-dropdown__content [role="button"], div.artdeco-dropdown__content span, div.artdeco-dropdown__content button, div.artdeco-dropdown__content a'));
        connectButton = dropdownItems.find(item => {
          const txt = (item.innerText || item.textContent || '').trim().toLowerCase();
          const aria = (item.getAttribute('aria-label') || '').toLowerCase();
          return (txt === 'connect' || txt.includes('invite') || aria.includes('invite') || aria.includes('connect')) && isElementVisible(item);
        });
      }
    }

    if (!connectButton) {
      if (isAlreadyConnected || isFirstDegree) {
        sendStep('Already connected with this profile.', 'info');
        return { success: false, status: 'SKIPPED', reason: 'Already connected with user' };
      }
      sendStep('FAILED: Connect button not available.', 'error');
      return { success: false, status: 'FAILED', reason: 'Connect button not available on this profile' };
    }

    // 6. Click Connect Button
    sendStep('Clicking Connect button...', 'info');
    safeClick(connectButton);
    await delay(1800);

    // 7. Check for Weekly Invitation Limit or Email Required Modals
    const modal = document.querySelector('div[role="dialog"], .artdeco-modal');
    if (modal) {
      const modalText = modal.innerText || '';
      if (modalText.includes("weekly invitation limit") || modalText.includes("You've reached the weekly invitation limit")) {
        sendStep('FAILED: Weekly LinkedIn invitation limit reached.', 'error');
        return { success: false, status: 'FAILED', reason: 'Weekly LinkedIn invitation limit reached' };
      }
      if (modalText.includes("enter their email") || modalText.includes("Please enter this member's email")) {
        sendStep('FAILED: Email required to send connection request.', 'error');
        return { success: false, status: 'FAILED', reason: 'Email required to connect with this profile' };
      }
    }

    // 8. Handle Connection Dialog & "Add a note"
    sendStep('Opening connection dialog...', 'info');
    const addNoteBtn = await waitForElement(SELECTORS.addNoteBtn, 3500);

    if (addNoteBtn && customMessage && customMessage.trim()) {
      sendStep('Clicking "Add a note"...', 'info');
      safeClick(addNoteBtn);
      await delay(1000);

      const noteTextarea = await waitForElement(SELECTORS.noteTextarea, 3000);
      if (noteTextarea) {
        sendStep('Entering connection note...', 'info');
        let messageToType = customMessage.trim();
        if (messageToType.length > 200) {
          sendStep('Note exceeds 200 characters. Truncating...', 'warn');
          messageToType = messageToType.substring(0, 200);
        }
        simulateTyping(noteTextarea, messageToType);
        await delay(1000);
      } else {
        sendStep('Note textarea not found. Proceeding without note...', 'warn');
      }
    } else if (!addNoteBtn && !customMessage) {
      const sendWithoutNote = await waitForElement(SELECTORS.sendWithoutNoteBtn, 2000);
      if (sendWithoutNote) {
        sendStep('Clicking "Send without a note"...', 'info');
        safeClick(sendWithoutNote);
        await delay(2500);
        sendStep('Connection request successfully sent.', 'success');
        return { success: true, status: 'SENT' };
      }
    }

    // 9. Click Send Invitation Button
    sendStep('Clicking Send...', 'info');
    let sendBtn = await waitForElement(SELECTORS.sendInvitationBtn, 3500);
    if (!sendBtn) {
      const modalButtons = Array.from(document.querySelectorAll('div[role="dialog"] button, .artdeco-modal button'));
      sendBtn = modalButtons.find(b => {
        const txt = (b.innerText || '').trim().toLowerCase();
        const aria = (b.getAttribute('aria-label') || '').toLowerCase();
        return (txt === 'send' || txt === 'send now' || txt === 'send invitation' || aria.includes('send')) && isElementVisible(b);
      });
    }

    if (!sendBtn) {
      sendStep('FAILED: Send button not found in modal dialog.', 'error');
      return { success: false, status: 'FAILED', reason: 'Send invitation button not found in modal' };
    }

    safeClick(sendBtn);
    await delay(3000);

    // 10. Verify completion
    sendStep('Verifying connection confirmation...', 'info');
    const postModal = document.querySelector('div[role="dialog"], .artdeco-modal');
    if (postModal && isElementVisible(postModal)) {
      const postText = postModal.innerText || '';
      if (postText.includes('invitation limit') || postText.includes('error') || postText.includes('unable to send')) {
        sendStep(`FAILED: LinkedIn notice: ${postText.slice(0, 80)}`, 'error');
        return { success: false, status: 'FAILED', reason: postText.slice(0, 100) };
      }
    }

    sendStep('Connection request successfully sent.', 'success');
    return { success: true, status: 'SENT' };
  }

  // ==========================================
  // 2. AUTO-DETECT DIRECT TAB LAUNCH
  // ==========================================
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const crmBatchNo = urlParams.get('crm_batch');
    if (crmBatchNo) {
      console.log('[LinkedIn ContentScript] Direct tab launch detected with crm_batch:', crmBatchNo);
      chrome.storage.local.get(['crm_active_linkedin_batch', 'crm_active_linkedin_batch_no'], (data) => {
        if (data.crm_active_linkedin_batch && data.crm_active_linkedin_batch_no === crmBatchNo) {
          chrome.runtime.sendMessage({
            action: 'START_LINKEDIN_BATCH',
            batchNo: crmBatchNo,
            batchData: data.crm_active_linkedin_batch
          });
        }
      });
    }
  } catch {}

  // Runtime message listener
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'PING') {
      sendResponse({ status: 'READY', url: window.location.href });
      return false;
    }

    if (request.action === 'HUD_UPDATE') {
      updateHud(request);
      sendResponse({ received: true });
      return false;
    }

    if (request.action === 'CHECK_SESSION') {
      const session = checkLinkedInSession();
      sendResponse(session);
      return false;
    }

    if (request.action === 'PROCESS_TARGET' || request.action === 'PROCESS_PROFILE') {
      const url = window.location.href;
      const isCompany = request.actionType === 'COMPANY_MESSAGE' ||
                        request.targetType === 'company' ||
                        request.record?.actionType === 'COMPANY_MESSAGE' ||
                        request.record?.targetType === 'company' ||
                        url.includes('/company/');

      const runner = isCompany
        ? performCompanyMessage(request.message, request.record || {})
        : performPersonalConnect(request.message, request.record || {});

      runner
        .then(result => sendResponse(result))
        .catch(err => {
          console.error('[LinkedIn Outreach] Execution error:', err);
          sendStep(`FAILED: ${err.message || 'Execution error'}`, 'error');
          sendResponse({ success: false, status: 'FAILED', reason: err.message || 'Execution error' });
        });
      return true; // Keep message channel open for async response
    }
  });

})();
