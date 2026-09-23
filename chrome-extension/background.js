/**
 * Background Service Worker for LinkedIn Outreach Automation (Manifest V3)
 * Orchestrates queue execution, manages browser tabs, timers, storage persistence,
 * routes between Personal Connect and Company Message workflows, and integrates with CRM Portal.
 */

import { getQueue, setQueue, getHistory, recordHistory, isProfileProcessed, getSettings, setRunningState, getRunningState, getActiveCRMBatch, setActiveCRMBatch } from './modules/storage.js';
import { getRandomDelayMs, delay } from './modules/utils.js';
import { reportStatus, startSendJob, getCRMSettings, saveCRMSettings } from './modules/crmClient.js';

let activeWorkerTabId = null;
let popupWindowId = null;
let isStopping = false;
let batchIsStarting = false;

// Initialize default state
chrome.runtime.onInstalled.addListener(() => {
  console.log('[LinkedIn Outreach] Extension installed successfully.');
  setRunningState({ isRunning: false, isPaused: false, currentIndex: 0, total: 0 });
});

/**
 * Reads CRM base API URL from storage or settings
 */
async function getApiUrl() {
  const cfg = await getCRMSettings();
  return cfg.apiUrl || 'http://localhost:3002';
}

/**
 * Opens or focuses the extension popup window for real-time live monitoring
 */
async function openPopupWindow() {
  if (popupWindowId !== null) {
    try {
      const win = await chrome.windows.get(popupWindowId);
      if (win) {
        await chrome.windows.update(popupWindowId, { focused: true });
        return;
      }
    } catch {
      popupWindowId = null;
    }
  }

  try {
    const popupUrl = chrome.runtime.getURL('popup.html');
    const newWin = await chrome.windows.create({
      url: popupUrl,
      type: 'popup',
      width: 460,
      height: 700,
      top: 60,
      left: 60,
      focused: true
    });
    if (newWin) {
      popupWindowId = newWin.id;
    }
  } catch (err) {
    console.warn('[LinkedIn BG] Notice opening popup window:', err.message);
  }
}

chrome.windows.onRemoved.addListener((winId) => {
  if (winId === popupWindowId) {
    popupWindowId = null;
  }
});

/**
 * Finds an existing LinkedIn tab or creates a new one
 */
async function getOrCreateLinkedInTab(targetUrl = null) {
  try {
    if (activeWorkerTabId) {
      const tab = await chrome.tabs.get(activeWorkerTabId).catch(() => null);
      if (tab) {
        if (targetUrl && tab.url !== targetUrl) {
          await chrome.tabs.update(tab.id, { url: targetUrl, active: true });
        } else {
          await chrome.tabs.update(tab.id, { active: true });
        }
        return tab.id;
      }
    }

    // Search for existing LinkedIn tabs in current window
    const tabs = await chrome.tabs.query({ url: '*://*.linkedin.com/*' });
    if (tabs && tabs.length > 0) {
      const existing = tabs[0];
      activeWorkerTabId = existing.id;
      if (targetUrl) {
        await chrome.tabs.update(existing.id, { url: targetUrl, active: true });
      } else {
        await chrome.tabs.update(existing.id, { active: true });
      }
      return existing.id;
    }

    // Create a new tab
    const initialUrl = targetUrl || 'https://www.linkedin.com/feed/';
    const newTab = await chrome.tabs.create({ url: initialUrl, active: true });
    activeWorkerTabId = newTab.id;
    return newTab.id;
  } catch (err) {
    console.error('[LinkedIn BG] Error getting or creating LinkedIn tab:', err);
    return null;
  }
}

/**
 * Waits for a Chrome tab to completely finish loading its DOM and scripts.
 */
function waitForTabComplete(tabId, timeoutMs = 25000) {
  return new Promise((resolve) => {
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
 * Ensures the content script is ready to receive messages on the given tab.
 */
async function ensureContentScriptReady(tabId, maxAttempts = 8) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, { action: 'PING' });
      if (response && response.status === 'READY') {
        return true;
      }
    } catch {
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['contentScript.js']
        });
      } catch {
        // ignore fallback errors
      }
    }
    await delay(1200);
  }
  return false;
}

/**
 * Determines whether a target record should execute the Company Message or Personal Connect workflow
 */
export function determineTargetWorkflow(record = {}, url = '') {
  const targetType = (record.targetType || record.target_type || '').toLowerCase();
  const actionType = (record.actionType || record.action_type || '').toUpperCase();
  const rawUrl = (url || record.linkedinProfile || record.url || record.linkedin_url || '').toLowerCase();

  if (targetType === 'company' || actionType === 'COMPANY_MESSAGE' || rawUrl.includes('/company/')) {
    return {
      actionType: 'COMPANY_MESSAGE',
      targetType: 'company',
      isCompany: true
    };
  }

  return {
    actionType: 'PERSONAL_CONNECT',
    targetType: 'personal',
    isCompany: false
  };
}

/**
 * Normalizes any profile/company identifier into a full LinkedIn URL.
 */
export function normalizeProfileUrl(record) {
  if (!record) return '';
  let targetUrl = record.linkedinProfile || record.url || record.linkedin_url || record.profileUrl || record.profile_url || record.target_url || '';

  const isCompany = record.targetType === 'company' ||
                    record.actionType === 'COMPANY_MESSAGE' ||
                    (targetUrl && targetUrl.includes('/company/'));

  if (!targetUrl && record.username) {
    const handle = record.username.replace(/^@/, '').trim();
    if (isCompany) {
      targetUrl = `https://www.linkedin.com/company/${handle}/`;
    } else {
      targetUrl = `https://www.linkedin.com/in/${handle}/`;
    }
  }

  if (!targetUrl) return '';

  targetUrl = targetUrl.trim();
  if (targetUrl.startsWith('/in/') || targetUrl.startsWith('/company/')) {
    targetUrl = `https://www.linkedin.com${targetUrl}`;
  } else if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    targetUrl = `https://${targetUrl}`;
  }

  try {
    const parsed = new URL(targetUrl);
    if (!parsed.pathname.endsWith('/')) {
      parsed.pathname += '/';
    }
    targetUrl = parsed.toString();
  } catch {}

  return targetUrl;
}

/**
 * Broadcasts log message to Popup, Live Monitor, HUD, and CRM Bridge
 */
async function broadcastLog(text, level = 'info', extra = {}) {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`[LinkedIn ${level.toUpperCase()}] ${text}`);

  const payload = {
    action: 'NEW_LOG',
    text,
    level,
    timestamp,
    ...extra
  };

  try {
    await chrome.runtime.sendMessage(payload);
  } catch {}

  // Also broadcast to active worker tab for on-screen HUD
  if (activeWorkerTabId) {
    try {
      await chrome.tabs.sendMessage(activeWorkerTabId, {
        action: 'HUD_UPDATE',
        text,
        level,
        ...extra
      });
    } catch {}
  }
}

/**
 * Main batch orchestrator execution loop
 */
async function executeBatchWorkflow(batchPayload = null, preferredTabId = null) {
  if (batchIsStarting) {
    await broadcastLog('Batch start is already in progress, ignoring duplicate trigger.', 'warn');
    return;
  }
  batchIsStarting = true;
  isStopping = false;

  try {
    let queue = [];
    let batchNo = null;
    let senderName = 'Tanweer';

    // 1. Parse incoming payload or load from storage
    if (batchPayload) {
      const records = batchPayload.records || batchPayload.batchData?.records || (Array.isArray(batchPayload) ? batchPayload : null);
      batchNo = batchPayload.batchNo || batchPayload.batch_no || batchPayload.batchData?.batchNo || batchPayload.batchData?.batch_no;
      senderName = batchPayload.senderName || batchPayload.batchData?.senderName || 'Tanweer';

      if (records && Array.isArray(records) && records.length > 0) {
        queue = records;
        await setQueue(queue);
        if (batchNo) {
          await setActiveCRMBatch({ batchId: batchNo, senderName });
        }
      }
    }

    if (queue.length === 0) {
      queue = await getQueue();
    }

    const activeCRMBatch = await getActiveCRMBatch();
    if (!batchNo && activeCRMBatch) {
      batchNo = activeCRMBatch.batchId;
      senderName = activeCRMBatch.senderName || senderName;
    }

    if (!queue || queue.length === 0) {
      await broadcastLog('❌ Queue is empty. No LinkedIn target records found to process.', 'warn');
      await setRunningState({ isRunning: false, isPaused: false, currentIndex: 0, total: 0 });
      return;
    }

    await setRunningState({ isRunning: true, isPaused: false, currentIndex: 0, total: queue.length });
    await broadcastLog(`🚀 Starting LinkedIn Outreach for Batch #${batchNo || 'Direct'} (${queue.length} target records)...`, 'info', {
      batchNo,
      current: 0,
      total: queue.length
    });

    // 2. Identify and setup automation tab
    const firstTargetUrl = normalizeProfileUrl(queue[0]);
    if (preferredTabId) {
      activeWorkerTabId = preferredTabId;
    } else {
      activeWorkerTabId = await getOrCreateLinkedInTab(firstTargetUrl);
    }

    if (!activeWorkerTabId) {
      await broadcastLog('❌ Failed to create or access LinkedIn browser tab.', 'error');
      await setRunningState({ isRunning: false, isPaused: false, currentIndex: 0, total: 0 });
      return;
    }

    await broadcastLog('Connecting to LinkedIn tab...', 'info');
    await waitForTabComplete(activeWorkerTabId);
    await delay(2000);

    const isReady = await ensureContentScriptReady(activeWorkerTabId);
    if (!isReady) {
      await broadcastLog('❌ Could not establish communication with LinkedIn content script.', 'error');
      await setRunningState({ isRunning: false, isPaused: false, currentIndex: 0, total: 0 });
      return;
    }

    // 3. Verify authenticated LinkedIn session
    await broadcastLog('Checking LinkedIn session...', 'info');
    try {
      const session = await chrome.tabs.sendMessage(activeWorkerTabId, { action: 'CHECK_SESSION' });
      if (!session || !session.authenticated) {
        const authErr = session?.reason || 'LinkedIn session is not authenticated. Please log in to LinkedIn and try again.';
        await broadcastLog(`❌ ${authErr}`, 'error');
        await setRunningState({ isRunning: false, isPaused: false, currentIndex: 0, total: 0 });
        return;
      }

      const senderDisplay = session.userName ? ` (${session.userName})` : ` (${senderName})`;
      await broadcastLog(`🔒 LinkedIn account verified${senderDisplay}.`, 'success');
    } catch (authEx) {
      await broadcastLog(`Notice during session check: ${authEx.message}`, 'warn');
    }

    const settings = await getSettings();
    let successCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    // 4. Process Batch Records Sequentially
    for (let i = 0; i < queue.length; i++) {
      const currentState = await getRunningState();
      if (isStopping || !currentState.isRunning) {
        await broadcastLog('⏹️ Outreach stopped by user.', 'warn');
        break;
      }

      while (currentState.isPaused) {
        await broadcastLog('⏸️ Outreach paused. Waiting to resume...', 'info');
        await delay(3000);
        const checkState = await getRunningState();
        if (!checkState.isRunning) break;
        if (!checkState.isPaused) break;
      }

      const record = queue[i];
      const currentBatchId = record.batchId || batchNo || (activeCRMBatch ? activeCRMBatch.batchId : null);
      const leadId = record.leadId || record.lead_id || record.record_id || record.id || null;
      const jobId = record.jobId || record.job_id || (currentBatchId && leadId ? `JOB-${currentBatchId}-${leadId}` : null);
      const targetUrl = normalizeProfileUrl(record);
      const messageText = record.message || record.custom_message || record.note || record.pitch || '';
      const displayName = record.displayName || record.name || record.username || (targetUrl ? targetUrl.replace('https://www.linkedin.com/in/', '').replace('https://www.linkedin.com/company/', '').replace('/', '') : `Target #${leadId || i + 1}`);

      const workflow = determineTargetWorkflow(record, targetUrl);

      await setRunningState({ isRunning: true, isPaused: false, currentIndex: i + 1, total: queue.length });

      // DIAGNOSTIC LOGGING
      console.log(`[LinkedIn] Job received:
  Job ID: ${jobId || 'N/A'}
  Batch ID: ${currentBatchId || 'N/A'}
  Action Type: ${workflow.actionType}
  Target Type: ${workflow.targetType}
  Target URL: ${targetUrl}
  Sender: ${senderName}
  Message: "${messageText}"`);

      // LIVE MONITOR: Exact required reporting format
      await broadcastLog(`Processing: ${displayName}`, 'info', {
        batchNo: currentBatchId,
        current: i + 1,
        total: queue.length
      });
      await broadcastLog(`Target Type: ${workflow.isCompany ? 'Company' : 'Personal'}`, 'info');
      await broadcastLog(`Current Action: ${workflow.isCompany ? 'Opening company message composer...' : 'Initiating connection request...'}`, 'info');

      // Send PROCESSING status to CRM
      if (currentBatchId && leadId) {
        await reportStatus({
          jobId,
          batchId: currentBatchId,
          leadId,
          username: record.username || displayName,
          status: 'PROCESSING',
          status_timestamp: new Date().toISOString()
        });
      }

      // Check if already processed (Duplicate protection)
      if (record.username && await isProfileProcessed(record.username)) {
        await broadcastLog(`⏩ Skipped: ${displayName} (Already in history)`, 'info');
        await recordHistory({ ...record, status: 'SKIPPED', reason: 'Already in history' });
        skippedCount++;

        if (currentBatchId && leadId) {
          await reportStatus({
            jobId,
            batchId: currentBatchId,
            leadId,
            username: record.username || displayName,
            status: 'SKIPPED',
            error: 'Already in outreach history',
            status_timestamp: new Date().toISOString()
          });
        }
        continue;
      }

      if (!targetUrl || targetUrl === 'https://www.linkedin.com/' || targetUrl === 'https://www.linkedin.com/feed/') {
        failedCount++;
        const reason = 'Target LinkedIn URL is missing or invalid';
        await broadcastLog(`❌ Failed: ${displayName} - ${reason}`, 'error');
        await recordHistory({ ...record, status: 'FAILED', reason });

        if (currentBatchId && leadId) {
          await reportStatus({
            jobId,
            batchId: currentBatchId,
            leadId,
            username: record.username || displayName,
            status: 'FAILED',
            error: reason,
            status_timestamp: new Date().toISOString()
          });
        }
        continue;
      }

      try {
        // Step 4.1: Direct Tab Navigation to Target URL
        await broadcastLog(`Opening target: ${targetUrl}...`, 'info');
        await chrome.tabs.update(activeWorkerTabId, { url: targetUrl, active: true });
        await waitForTabComplete(activeWorkerTabId);
        await delay(2500);

        // Step 4.2: Ensure content script on page
        const scriptReady = await ensureContentScriptReady(activeWorkerTabId);
        if (!scriptReady) {
          throw new Error('Content script communication timeout on target page');
        }

        // Step 4.3: Send automation command to content script with explicit routing
        const result = await chrome.tabs.sendMessage(activeWorkerTabId, {
          action: 'PROCESS_TARGET',
          actionType: workflow.actionType,
          targetType: workflow.targetType,
          message: messageText,
          displayName: displayName,
          record: record
        });

        if (result && (result.success || result.status === 'SENT')) {
          successCount++;
          const successMsg = workflow.isCompany
            ? `✅ Success: Message successfully sent to ${displayName}`
            : `✅ Success: Connection invitation sent to ${displayName}`;
          await broadcastLog(successMsg, 'success');
          await recordHistory({ ...record, status: 'SUCCESS' });

          if (currentBatchId && leadId) {
            await reportStatus({
              jobId,
              batchId: currentBatchId,
              leadId,
              username: record.username || displayName,
              status: 'SENT',
              status_timestamp: new Date().toISOString()
            });
          }
        } else if (result && result.status === 'SKIPPED') {
          skippedCount++;
          await broadcastLog(`⏩ Skipped: ${displayName} (${result.reason})`, 'info');
          await recordHistory({ ...record, status: 'SKIPPED', reason: result.reason });

          if (currentBatchId && leadId) {
            await reportStatus({
              jobId,
              batchId: currentBatchId,
              leadId,
              username: record.username || displayName,
              status: 'SKIPPED',
              error: result.reason,
              status_timestamp: new Date().toISOString()
            });
          }
        } else {
          failedCount++;
          const reason = result?.reason || 'Unknown execution failure';
          await broadcastLog(`❌ Failed: ${displayName} - ${reason}`, 'error');
          await recordHistory({ ...record, status: 'FAILED', reason });

          if (currentBatchId && leadId) {
            await reportStatus({
              jobId,
              batchId: currentBatchId,
              leadId,
              username: record.username || displayName,
              status: 'FAILED',
              error: reason,
              status_timestamp: new Date().toISOString()
            });
          }
        }

      } catch (targetError) {
        failedCount++;
        const reason = targetError.message || 'Execution error';
        await broadcastLog(`❌ Error on ${displayName}: ${reason}`, 'error');
        await recordHistory({ ...record, status: 'FAILED', reason });

        if (currentBatchId && leadId) {
          await reportStatus({
            jobId,
            batchId: currentBatchId,
            leadId,
            username: record.username || displayName,
            status: 'FAILED',
            error: reason,
            status_timestamp: new Date().toISOString()
          });
        }
      }

      // Human Safety Delay
      if (i < queue.length - 1 && !isStopping) {
        const delayMs = getRandomDelayMs(settings.minDelay, settings.maxDelay);
        const seconds = (delayMs / 1000).toFixed(1);
        await broadcastLog(`⏳ Pacing: waiting ${seconds}s before next target...`, 'info');
        await delay(delayMs);
      }
    }

    // 5. Summary Report
    await broadcastLog('🏁 LinkedIn Campaign Completed!', 'success');
    await broadcastLog(`📊 Summary: Total: ${queue.length} | Sent: ${successCount} | Skipped: ${skippedCount} | Failed: ${failedCount}`, 'info');
    await setRunningState({ isRunning: false, isPaused: false, currentIndex: 0, total: 0 });

  } finally {
    batchIsStarting = false;
  }
}

// Runtime Message Listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.action) return false;

  // Handle execution steps streamed from Content Script
  if (message.action === 'EXECUTION_STEP') {
    broadcastLog(message.text, message.level || 'info');
    sendResponse({ received: true });
    return false;
  }

  // Start Campaign from Popup
  if (message.action === 'START_CAMPAIGN') {
    openPopupWindow();
    executeBatchWorkflow();
    sendResponse({ status: 'STARTED' });
    return false;
  }

  // Start Batch triggered by CRM Bridge or Content Script
  if (
    message.action === 'START_LINKEDIN_BATCH' ||
    message.action === 'START_CRM_BATCH' ||
    message.action === 'START_BATCH'
  ) {
    const payload = message.payload || message;
    let preferredTabId = null;

    if (sender?.tab?.id && sender?.tab?.url && sender.tab.url.includes('linkedin.com')) {
      preferredTabId = sender.tab.id;
      activeWorkerTabId = sender.tab.id;
    }

    openPopupWindow();
    executeBatchWorkflow(payload, preferredTabId);
    sendResponse({ status: 'STARTED' });
    return false;
  }

  // Pause / Resume / Stop
  if (message.action === 'PAUSE_CAMPAIGN') {
    setRunningState({ isRunning: true, isPaused: true });
    sendResponse({ status: 'PAUSED' });
    return false;
  }

  if (message.action === 'RESUME_CAMPAIGN') {
    setRunningState({ isRunning: true, isPaused: false });
    sendResponse({ status: 'RESUMED' });
    return false;
  }

  if (message.action === 'STOP_CAMPAIGN' || message.action === 'STOP_LINKEDIN_BATCH' || message.action === 'STOP_BATCH') {
    isStopping = true;
    setRunningState({ isRunning: false, isPaused: false, currentIndex: 0, total: 0 });
    sendResponse({ status: 'STOPPED' });
    return false;
  }

  if (message.action === 'SET_API_URL') {
    if (message.apiUrl) {
      saveCRMSettings({ apiUrl: message.apiUrl });
    }
    sendResponse({ success: true });
    return false;
  }

  return true;
});
