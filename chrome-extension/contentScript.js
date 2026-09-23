/**
 * Content Script injected into LinkedIn profile pages (https://*.linkedin.com/in/*)
 * Interacts with DOM to click Connect, open Note dialog, fill custom message, and send invitation.
 */

(function () {
  'use strict';

  // Prevent duplicate injection
  if (window.__LINKEDIN_OUTREACH_INJECTED__) return;
  window.__LINKEDIN_OUTREACH_INJECTED__ = true;

  console.log('[LinkedIn Outreach Automation] Content script initialized on:', window.location.href);

  // Selector definitions
  const SELECTORS = {
    connectDirect: [
      'a[componentkey*="ConnectButton"]',
      'button[componentkey*="ConnectButton"]',
      'a[aria-label^="Invite "][aria-label*="connect"]',
      'button[aria-label^="Invite "][aria-label*="connect"]',
      'button:has(svg#connect-small)',
      'a:has(svg#connect-small)'
    ],
    moreActions: [
      'button[aria-label="More actions"]',
      'button[aria-label="More"]',
      'button:has(svg#more-actions-horizontal-small)',
      'div.artdeco-dropdown button[aria-label*="More"]'
    ],
    connectFromMore: [
      'div.artdeco-dropdown__content a[componentkey*="ConnectButton"]',
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
    modalDialog: 'div[role="dialog"], .artdeco-modal',
    addNoteBtn: [
      'button[aria-label="Add a note"]',
      'button:has-text("Add a note")',
      'a[aria-label="Add a note"]'
    ],
    sendWithoutNoteBtn: [
      'button[aria-label="Send without a note"]',
      'button:has-text("Send without a note")'
    ],
    noteTextarea: [
      'textarea[name="message"]',
      'textarea#custom-message',
      'textarea',
      'div[role="textbox"]'
    ],
    sendInvitationBtn: [
      'button[aria-label="Send invitation"]',
      'button[aria-label="Send now"]',
      'button[aria-label^="Send"]'
    ]
  };

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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

  function isElementVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
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
   * Main connection execution logic
   */
  async function performOutreach(customMessage) {
    console.log('[LinkedIn Outreach] Starting connection flow...');

    // Wait 2 seconds for initial page render
    await delay(2000);

    // 1. Check if already connected or invitation is already pending
    for (const sel of SELECTORS.pending) {
      const pendingEl = querySelectorWithText(sel);
      if (pendingEl && isElementVisible(pendingEl)) {
        console.log('[LinkedIn Outreach] Connection is already Pending. Skipping.');
        return { success: false, status: 'SKIPPED', reason: 'Connection request already pending' };
      }
    }

    // 2. Search for direct "Connect" button
    let connectButton = null;

    // Check direct selectors
    for (const sel of SELECTORS.connectDirect) {
      const el = querySelectorWithText(sel);
      if (el && isElementVisible(el)) {
        connectButton = el;
        break;
      }
    }

    // Fallback: search main profile buttons with text "Connect"
    if (!connectButton) {
      const mainButtons = Array.from(document.querySelectorAll('main button, main a'));
      connectButton = mainButtons.find(btn => {
        const txt = (btn.innerText || btn.textContent || '').trim();
        return txt === 'Connect' && isElementVisible(btn);
      });
    }

    // 3. If direct button not found, try the "More" dropdown
    if (!connectButton) {
      console.log('[LinkedIn Outreach] Direct connect button not found. Checking More dropdown...');
      let moreButton = null;
      for (const sel of SELECTORS.moreActions) {
        const el = querySelectorWithText(sel);
        if (el && isElementVisible(el)) {
          moreButton = el;
          break;
        }
      }

      if (moreButton) {
        moreButton.click();
        await delay(1200);

        // Find connect button inside opened dropdown
        const dropdownItems = Array.from(document.querySelectorAll('div.artdeco-dropdown__content [role="button"], div.artdeco-dropdown__content span, div.artdeco-dropdown__content button, div.artdeco-dropdown__content a'));
        connectButton = dropdownItems.find(item => {
          const txt = (item.innerText || item.textContent || '').trim().toLowerCase();
          return (txt === 'connect' || txt.includes('invite')) && isElementVisible(item);
        });
      }
    }

    if (!connectButton) {
      // Final check: maybe already connected (shows "Message" button prominently)
      const isAlreadyConnected = Array.from(document.querySelectorAll('main button, main a')).some(el => 
        (el.innerText || '').trim() === 'Message' && isElementVisible(el)
      );
      if (isAlreadyConnected) {
        return { success: false, status: 'SKIPPED', reason: 'Already connected with user' };
      }
      return { success: false, status: 'FAILED', reason: 'Connect button could not be located on profile' };
    }

    // 4. Click Connect Button
    console.log('[LinkedIn Outreach] Clicking Connect button...');
    connectButton.click();
    await delay(1500);

    // 5. Handle Modal / "Add a note"
    const addNoteBtn = await waitForElement(SELECTORS.addNoteBtn, 3500);
    if (addNoteBtn) {
      console.log('[LinkedIn Outreach] Clicking "Add a note"...');
      addNoteBtn.click();
      await delay(1000);
    }

    // 6. Fill custom note if textarea exists
    const noteTextarea = await waitForElement(SELECTORS.noteTextarea, 3000);
    if (noteTextarea && customMessage) {
      console.log('[LinkedIn Outreach] Filling custom note...');
      const messageToType = customMessage.length > 200 ? customMessage.substring(0, 200) : customMessage;
      simulateTyping(noteTextarea, messageToType);
      await delay(1000);
    } else if (!noteTextarea) {
      console.log('[LinkedIn Outreach] Note textarea not found, checking for direct Send without note...');
      const sendWithoutNote = await waitForElement(SELECTORS.sendWithoutNoteBtn, 2000);
      if (sendWithoutNote) {
        sendWithoutNote.click();
        await delay(2000);
        return { success: true, status: 'SUCCESS' };
      }
    }

    // 7. Click Send Invitation
    let sendBtn = await waitForElement(SELECTORS.sendInvitationBtn, 3500);
    if (!sendBtn) {
      const modalButtons = Array.from(document.querySelectorAll('div[role="dialog"] button, .artdeco-modal button'));
      sendBtn = modalButtons.find(b => {
        const txt = (b.innerText || '').trim().toLowerCase();
        return (txt === 'send' || txt === 'send now') && isElementVisible(b);
      });
    }

    if (!sendBtn) {
      return { success: false, status: 'FAILED', reason: 'Send invitation button not found in modal' };
    }

    console.log('[LinkedIn Outreach] Clicking Send...');
    sendBtn.click();
    await delay(2500);

    return { success: true, status: 'SUCCESS' };
  }

  // Listen for messages from background script
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'PING') {
      sendResponse({ status: 'READY' });
      return false;
    }

    if (request.action === 'PROCESS_PROFILE') {
      performOutreach(request.message)
        .then(result => sendResponse(result))
        .catch(err => {
          console.error('[LinkedIn Outreach] Execution error:', err);
          sendResponse({ success: false, status: 'FAILED', reason: err.message || 'Unknown error' });
        });
      return true; // Keep channel open for async callback
    }
  });

})();
