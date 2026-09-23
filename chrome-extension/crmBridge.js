// crmBridge.js - Connects CRM Web Application with the LinkedIn Outreach Chrome Extension
(function () {
  console.log('[LinkedIn CRM Bridge] Content script initialized on CRM portal');

  function isExtensionValid() {
    try {
      return Boolean(typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id);
    } catch {
      return false;
    }
  }

  // 1. Listen for window messages sent by the CRM frontend (outreach.js)
  window.addEventListener('message', async (event) => {
    if (event.source !== window || !event.data || !event.data.type) return;

    const { type, payload } = event.data;

    // Detection Ping
    if (
      type === 'CRM_DETECT_EXTENSION' ||
      type === 'CRM_PING_EXTENSION' ||
      type === 'CRM_DETECT_LINKEDIN_EXTENSION' ||
      type === 'CRM_PING_LINKEDIN_EXTENSION'
    ) {
      window.postMessage({
        type: 'CRM_LINKEDIN_EXTENSION_READY',
        version: '2.0.0'
      }, '*');
      window.postMessage({
        type: 'CRM_LINKEDIN_EXTENSION_DETECTED',
        version: '2.0.0'
      }, '*');
      return;
    }

    // Start LinkedIn Outreach Batch
    if (type === 'CRM_START_LINKEDIN_BATCH' || (type === 'CRM_START_BATCH' && payload?.batchData?.entity_type?.toLowerCase() === 'linkedin')) {
      console.log('[LinkedIn CRM Bridge] Received start batch command from CRM:', payload?.batchNo);

      if (!isExtensionValid()) {
        console.warn('[LinkedIn CRM Bridge] Extension context invalidated or not available.');
        return;
      }

      // Store active batch data in extension storage for instant tab access
      if (payload?.batchData) {
        chrome.storage.local.set({
          crm_active_linkedin_batch: payload.batchData,
          crm_active_linkedin_batch_no: payload.batchNo,
          linkedin_batch_index: 0
        });
      }

      try {
        chrome.runtime.sendMessage({
          action: 'START_LINKEDIN_BATCH',
          payload: payload,
          batchNo: payload?.batchNo,
          username: payload?.username,
          password: payload?.password,
          senderName: payload?.senderName,
          batchData: payload?.batchData
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.log('[LinkedIn CRM Bridge] Background notice:', chrome.runtime.lastError.message);
          } else {
            console.log('[LinkedIn CRM Bridge] Background acknowledged START_LINKEDIN_BATCH:', response);
          }
        });
      } catch (err) {
        console.warn('[LinkedIn CRM Bridge] Error dispatching to background:', err.message);
      }
      return;
    }

    // Stop Outreach Batch Pipeline
    if (type === 'CRM_STOP_LINKEDIN_BATCH' || type === 'CRM_STOP_BATCH') {
      console.log('[LinkedIn CRM Bridge] Received STOP command from CRM');
      if (!isExtensionValid()) return;
      try {
        chrome.storage.local.remove(['crm_active_linkedin_batch', 'crm_active_linkedin_batch_no', 'linkedin_batch_index']);
        chrome.runtime.sendMessage({ action: 'STOP_LINKEDIN_BATCH' }, (response) => {
          console.log('[LinkedIn CRM Bridge] Background acknowledged STOP_BATCH:', response);
        });
      } catch (err) {
        console.warn('[LinkedIn CRM Bridge] Stop notice:', err.message);
      }
      return;
    }
  });

  // 2. Listen for runtime messages from background service worker and relay to CRM frontend
  try {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (!message || !message.action) return false;

      if (
        message.action === 'LINKEDIN_BATCH_PROGRESS' ||
        message.action === 'BATCH_PROGRESS' ||
        message.action === 'BATCH_COMPLETE' ||
        message.action === 'BATCH_STOPPED'
      ) {
        window.postMessage({
          type: 'CRM_LINKEDIN_BATCH_PROGRESS',
          payload: message.payload || message
        }, '*');
        sendResponse({ received: true });
        return true;
      }
      return false;
    });
  } catch (e) {}

  // Announce availability immediately on load
  window.postMessage({
    type: 'CRM_LINKEDIN_EXTENSION_READY',
    version: '2.0.0'
  }, '*');
  window.postMessage({
    type: 'CRM_LINKEDIN_EXTENSION_DETECTED',
    version: '2.0.0'
  }, '*');

  // Automatically capture the CRM's current origin to use as the API base URL
  try {
    if (isExtensionValid()) {
      chrome.runtime.sendMessage({
        action: 'SET_API_URL',
        apiUrl: window.location.origin
      });
    }
  } catch (e) {}
})();
