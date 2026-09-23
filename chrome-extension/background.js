/**
 * Background Service Worker for LinkedIn Outreach Automation (Manifest V3)
 * Orchestrates queue execution, manages browser tabs, timers, and storage persistence.
 */

import { getQueue, setQueue, getHistory, recordHistory, isProfileProcessed, getSettings, setRunningState, getRunningState } from './modules/storage.js';
import { getRandomDelayMs, delay } from './modules/utils.js';

let activeWorkerTabId = null;
let isStopping = false;

// Initialize default state
chrome.runtime.onInstalled.addListener(() => {
  console.log('[LinkedIn Outreach] Extension installed successfully.');
  setRunningState({ isRunning: false, isPaused: false, currentIndex: 0, total: 0 });
});

/**
 * Waits for a Chrome tab to completely finish loading its DOM and scripts.
 */
function waitForTabComplete(tabId, timeoutMs = 25000) {
  return new Promise((resolve, reject) => {
    let timeoutTimer;

    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        clearTimeout(timeoutTimer);
        resolve();
      }
    };

    chrome.tabs.onUpdated.addListener(listener);

    timeoutTimer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve(); // Proceed anyway even if slow network
    }, timeoutMs);
  });
}

/**
 * Ensures the content script is ready to receive messages.
 */
async function ensureContentScriptReady(tabId, maxAttempts = 6) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, { action: 'PING' });
      if (response && response.status === 'READY') {
        return true;
      }
    } catch {
      // Content script may not have injected yet; try programmatic injection fallback
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['contentScript.js']
        });
      } catch (e) {
        // ignore
      }
    }
    await delay(1500);
  }
  return false;
}

/**
 * Main queue orchestrator loop
 */
async function runCampaign() {
  isStopping = false;
  const queue = await getQueue();
  const settings = await getSettings();

  if (!queue || queue.length === 0) {
    await broadcastLog('Queue is empty. Please add profiles first.', 'warn');
    await setRunningState({ isRunning: false, isPaused: false, currentIndex: 0, total: 0 });
    return;
  }

  await setRunningState({ isRunning: true, isPaused: false, currentIndex: 0, total: queue.length });
  await broadcastLog(`🚀 Starting campaign for ${queue.length} profiles...`, 'info');

  // Open or reuse dedicated automation tab
  try {
    const tab = await chrome.tabs.create({ url: 'https://www.linkedin.com', active: true });
    activeWorkerTabId = tab.id;
  } catch (err) {
    await broadcastLog(`Failed to open browser tab: ${err.message}`, 'error');
    await setRunningState({ isRunning: false, isPaused: false, currentIndex: 0, total: 0 });
    return;
  }

  // Wait for initial LinkedIn page load
  await waitForTabComplete(activeWorkerTabId);
  await delay(2000);

  let successCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (let i = 0; i < queue.length; i++) {
    // Check stop or pause conditions
    const currentState = await getRunningState();
    if (isStopping || !currentState.isRunning) {
      await broadcastLog('⏹️ Campaign stopped by user.', 'warn');
      break;
    }

    while (currentState.isPaused) {
      await broadcastLog('⏸️ Campaign paused. Waiting to resume...', 'info');
      await delay(3000);
      const checkState = await getRunningState();
      if (!checkState.isRunning) break;
      if (!checkState.isPaused) break;
    }

    const record = queue[i];
    await setRunningState({ isRunning: true, isPaused: false, currentIndex: i + 1, total: queue.length });
    await broadcastLog(`[${i + 1}/${queue.length}] Processing: ${record.username || record.url}`, 'info');

    // Check if already processed
    if (record.username && await isProfileProcessed(record.username)) {
      await broadcastLog(`⏩ Skipped: ${record.username} (Already successfully processed)`, 'info');
      await recordHistory({ ...record, status: 'SKIPPED', reason: 'Already in history' });
      skippedCount++;
      continue;
    }

    // Format target profile URL
    let targetUrl = record.url;
    if (!targetUrl && record.username) {
      targetUrl = `https://www.linkedin.com/in/${record.username}/`;
    }

    if (!targetUrl.startsWith('http')) {
      targetUrl = `https://${targetUrl}`;
    }

    try {
      // 1. Navigate tab to target profile
      await chrome.tabs.update(activeWorkerTabId, { url: targetUrl });
      await waitForTabComplete(activeWorkerTabId);
      await delay(2000);

      // 2. Ensure content script is active
      const isReady = await ensureContentScriptReady(activeWorkerTabId);
      if (!isReady) {
        throw new Error('Content script communication timeout');
      }

      // 3. Send message to trigger connection workflow
      const result = await chrome.tabs.sendMessage(activeWorkerTabId, {
        action: 'PROCESS_PROFILE',
        message: record.message || ''
      });

      if (result && result.success) {
        successCount++;
        await broadcastLog(`✅ Success: Connection invitation sent to ${record.username || targetUrl}`, 'success');
        await recordHistory({ ...record, status: 'SUCCESS' });
      } else if (result && result.status === 'SKIPPED') {
        skippedCount++;
        await broadcastLog(`⏩ Skipped: ${record.username || targetUrl} (${result.reason})`, 'info');
        await recordHistory({ ...record, status: 'SKIPPED', reason: result.reason });
      } else {
        failedCount++;
        const reason = result?.reason || 'Unknown failure';
        await broadcastLog(`❌ Failed: ${record.username || targetUrl} - ${reason}`, 'error');
        await recordHistory({ ...record, status: 'FAILED', reason });
      }

    } catch (profileError) {
      failedCount++;
      await broadcastLog(`❌ Error on ${record.username || targetUrl}: ${profileError.message}`, 'error');
      await recordHistory({ ...record, status: 'FAILED', reason: profileError.message });
    }

    // Pacing delay between profiles (if not the last profile)
    if (i < queue.length - 1 && !isStopping) {
      const delayMs = getRandomDelayMs(settings.minDelay, settings.maxDelay);
      const seconds = (delayMs / 1000).toFixed(1);
      await broadcastLog(`⏳ Waiting ${seconds}s before next profile for human safety...`, 'info');
      await delay(delayMs);
    }
  }

  // Summary Report
  await broadcastLog('🏁 Campaign Completed!', 'success');
  await broadcastLog(`📊 Summary: Total: ${queue.length} | Sent: ${successCount} | Skipped: ${skippedCount} | Failed: ${failedCount}`, 'info');
  await setRunningState({ isRunning: false, isPaused: false, currentIndex: 0, total: 0 });
}

/**
 * Sends real-time log messages to the popup if open
 */
async function broadcastLog(text, level = 'info') {
  console.log(`[${level.toUpperCase()}] ${text}`);
  try {
    await chrome.runtime.sendMessage({ action: 'NEW_LOG', text, level, timestamp: new Date().toLocaleTimeString() });
  } catch {
    // Popup might be closed, perfectly normal
  }
}

// Handle messages from Popup UI
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'START_CAMPAIGN') {
    runCampaign();
    sendResponse({ status: 'STARTED' });
  } else if (message.action === 'PAUSE_CAMPAIGN') {
    setRunningState({ isRunning: true, isPaused: true });
    sendResponse({ status: 'PAUSED' });
  } else if (message.action === 'RESUME_CAMPAIGN') {
    setRunningState({ isRunning: true, isPaused: false });
    sendResponse({ status: 'RESUMED' });
  } else if (message.action === 'STOP_CAMPAIGN') {
    isStopping = true;
    setRunningState({ isRunning: false, isPaused: false, currentIndex: 0, total: 0 });
    sendResponse({ status: 'STOPPED' });
  }
  return true;
});
