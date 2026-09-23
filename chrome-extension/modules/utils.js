/**
 * Utility helpers for DOM interaction, human-like random pacing, and storage helpers.
 */

/**
 * Delays execution for a specified number of milliseconds.
 * @param {number} ms 
 * @returns {Promise<void>}
 */
export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Returns a randomized delay duration between min and max seconds.
 * @param {number} minSeconds 
 * @param {number} maxSeconds 
 * @returns {number} Delay in milliseconds
 */
export function getRandomDelayMs(minSeconds = 5, maxSeconds = 12) {
  const min = Math.min(minSeconds, maxSeconds);
  const max = Math.max(minSeconds, maxSeconds);
  const sec = Math.random() * (max - min) + min;
  return Math.floor(sec * 1000);
}

/**
 * Waits for an element matching any of the selector strings to appear in the DOM.
 * @param {string|string[]} selectors - Single CSS selector or array of selectors
 * @param {number} timeoutMs - Maximum wait time in milliseconds
 * @param {Element|Document} root - Context element (default: document)
 * @returns {Promise<Element|null>}
 */
export function waitForElement(selectors, timeoutMs = 5000, root = document) {
  const selectorList = Array.isArray(selectors) ? selectors : [selectors];

  return new Promise((resolve) => {
    // 1. Check if element is already present
    for (const sel of selectorList) {
      const el = querySelectorRobust(sel, root);
      if (el) return resolve(el);
    }

    // 2. Set up MutationObserver
    const observer = new MutationObserver(() => {
      for (const sel of selectorList) {
        const el = querySelectorRobust(sel, root);
        if (el) {
          observer.disconnect();
          return resolve(el);
        }
      }
    });

    observer.observe(root.body || root, { childList: true, subtree: true });

    // 3. Timeout fallback
    setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeoutMs);
  });
}

/**
 * Supports custom pseudo-selectors like :has-text("...") in vanilla JS
 * @param {string} selector 
 * @param {Element|Document} root 
 * @returns {Element|null}
 */
export function querySelectorRobust(selector, root = document) {
  try {
    if (selector.includes(':has-text(')) {
      const parts = selector.split(':has-text(');
      const tag = parts[0].trim() || '*';
      const textToMatch = parts[1].replace(/\)+$/, '').replace(/^["']|["']$/g, '').trim().toLowerCase();
      
      const elements = Array.from(root.querySelectorAll(tag));
      return elements.find(el => {
        const directText = (el.innerText || el.textContent || '').trim().toLowerCase();
        return directText.includes(textToMatch);
      }) || null;
    }

    return root.querySelector(selector);
  } catch (err) {
    return null;
  }
}

/**
 * Types text into a textarea or input and safely triggers React/Ember synthetic events.
 * @param {HTMLInputElement|HTMLTextAreaElement} element 
 * @param {string} text 
 */
export async function simulateTyping(element, text) {
  element.focus();
  
  // Clear existing value
  element.value = '';
  
  // Set value property via prototype to trigger React internal value trackers
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    'value'
  )?.set || Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  )?.set;

  if (nativeInputValueSetter) {
    nativeInputValueSetter.call(element, text);
  } else {
    element.value = text;
  }

  // Dispatch events to notify page frameworks
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  
  await delay(200);
}
