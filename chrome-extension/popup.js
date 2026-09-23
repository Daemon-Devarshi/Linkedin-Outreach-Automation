/**
 * Popup Script for LinkedIn Outreach Extension
 * Manages tabs, handles form submissions, communicates with background service worker,
 * updates stats, and connects directly to the CRM Portal.
 */

import { getQueue, setQueue, getHistory, getSettings, saveSettings, clearAllHistory, getRunningState, setActiveCRMBatch } from './modules/storage.js';
import { getCRMSettings, saveCRMSettings, checkCRMHealth, fetchLinkedInBatches, fetchBatchDetails, startSendJob } from './modules/crmClient.js';

// DOM Elements
const tabButtons = document.querySelectorAll('.tab-btn');
const tabPanes = document.querySelectorAll('.tab-pane');
const statusBadge = document.getElementById('status-badge');
const jsonInput = document.getElementById('json-input');
const btnLoadSample = document.getElementById('btn-load-sample');
const btnSaveQueue = document.getElementById('btn-save-queue');
const btnStart = document.getElementById('btn-start');
const btnPause = document.getElementById('btn-pause');
const btnStop = document.getElementById('btn-stop');
const logBox = document.getElementById('log-box');
const queueSummaryFooter = document.getElementById('queue-summary-footer');

// Stats Elements
const statTotal = document.getElementById('stat-total');
const statSent = document.getElementById('stat-sent');
const statSkipped = document.getElementById('stat-skipped');
const statFailed = document.getElementById('stat-failed');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');
const progressCount = document.getElementById('progress-count');

// History & Settings Elements
const historyTableBody = document.getElementById('history-table-body');
const btnExportCsv = document.getElementById('btn-export-csv');
const btnClearHistory = document.getElementById('btn-clear-history');
const settingMinDelay = document.getElementById('setting-min-delay');
const settingMaxDelay = document.getElementById('setting-max-delay');
const settingDailyLimit = document.getElementById('setting-daily-limit');
const btnSaveSettings = document.getElementById('btn-save-settings');

// CRM Elements
const crmStatusBadge = document.getElementById('crm-status-badge');
const crmApiUrl = document.getElementById('crm-api-url');
const crmApiKey = document.getElementById('crm-api-key');
const btnTestCrm = document.getElementById('btn-test-crm');
const btnSaveCrmCfg = document.getElementById('btn-save-crm-cfg');
const btnRefreshCrmBatches = document.getElementById('btn-refresh-crm-batches');
const crmBatchSelect = document.getElementById('crm-batch-select');
const crmBatchSummary = document.getElementById('crm-batch-summary');
const btnLoadCrmBatch = document.getElementById('btn-load-crm-batch');
const btnStartCrmBatch = document.getElementById('btn-start-crm-batch');

let loadedCRMBatches = [];

// Initialize on popup open
document.addEventListener('DOMContentLoaded', async () => {
  setupTabs();
  setupCRMEvents();
  await loadSavedData();
  await refreshState();
  await testCRMConnection();
});

/**
 * Tab navigation switcher
 */
function setupTabs() {
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const targetTab = document.getElementById(btn.dataset.tab);
      if (targetTab) targetTab.classList.add('active');

      if (btn.dataset.tab === 'tab-history') {
        renderHistory();
      } else if (btn.dataset.tab === 'tab-crm') {
        loadCRMBatchesList();
      }
    });
  });
}

/**
 * Loads saved queue, settings, and stats from storage
 */
async function loadSavedData() {
  // Load Queue
  const queue = await getQueue();
  if (queue && queue.length > 0) {
    jsonInput.value = JSON.stringify(queue, null, 2);
    queueSummaryFooter.textContent = `Queue: ${queue.length} profiles`;
  }

  // Load Settings
  const settings = await getSettings();
  settingMinDelay.value = settings.minDelay || 6;
  settingMaxDelay.value = settings.maxDelay || 12;
  settingDailyLimit.value = settings.dailyLimit || 30;

  // Load CRM Settings
  const crmCfg = await getCRMSettings();
  if (crmApiUrl) crmApiUrl.value = crmCfg.apiUrl || 'https://crm.colabpetals.com';
  if (crmApiKey) crmApiKey.value = crmCfg.apiKey || '';

  // Load History Summary Stats
  await updateStatsFromHistory();
}

/**
 * Setup CRM integration events
 */
function setupCRMEvents() {
  if (btnTestCrm) {
    btnTestCrm.addEventListener('click', async () => {
      await testCRMConnection(true);
    });
  }

  if (btnSaveCrmCfg) {
    btnSaveCrmCfg.addEventListener('click', async () => {
      const cfg = {
        apiUrl: crmApiUrl.value.trim(),
        apiKey: crmApiKey.value.trim()
      };
      await saveCRMSettings(cfg);
      alert('CRM Configuration saved!');
      await testCRMConnection(true);
    });
  }

  if (btnRefreshCrmBatches) {
    btnRefreshCrmBatches.addEventListener('click', async () => {
      await loadCRMBatchesList();
    });
  }

  if (crmBatchSelect) {
    crmBatchSelect.addEventListener('change', () => {
      const selectedNo = crmBatchSelect.value;
      const found = loadedCRMBatches.find(b => b.batch_no === selectedNo);
      if (found && crmBatchSummary) {
        crmBatchSummary.style.display = 'block';
        crmBatchSummary.innerHTML = `
          <strong>Batch #${escapeHtml(found.batch_no)}</strong> (${escapeHtml(found.entity_type)})<br>
          Status: <span class="tag ${found.status === 'COMPLETED' || found.status === 'SENT' ? 'tag-success' : 'tag-skipped'}">${escapeHtml(found.status)}</span> · 
          Sent: <strong>${found.sent_count || 0}</strong> · Pending: <strong>${found.pending_count || 0}</strong> · Total: <strong>${found.total_count || 0}</strong>
        `;
      } else if (crmBatchSummary) {
        crmBatchSummary.style.display = 'none';
      }
    });
  }

  if (btnLoadCrmBatch) {
    btnLoadCrmBatch.addEventListener('click', async () => {
      await handleLoadBatchToQueue(false);
    });
  }

  if (btnStartCrmBatch) {
    btnStartCrmBatch.addEventListener('click', async () => {
      await handleLoadBatchToQueue(true);
    });
  }
}

async function testCRMConnection(showAlert = false) {
  if (!crmStatusBadge) return;
  crmStatusBadge.textContent = 'Checking...';
  crmStatusBadge.className = 'tag tag-skipped';

  const health = await checkCRMHealth();
  if (health.connected) {
    crmStatusBadge.textContent = health.authenticated ? 'Connected' : 'Reachable (Auth Req)';
    crmStatusBadge.className = 'tag tag-success';
    if (showAlert) alert(health.message);
  } else {
    crmStatusBadge.textContent = 'Disconnected';
    crmStatusBadge.className = 'tag tag-failed';
    if (showAlert) alert(health.message);
  }
}

async function loadCRMBatchesList() {
  if (!crmBatchSelect) return;
  crmBatchSelect.innerHTML = '<option value="">Loading batches from CRM...</option>';

  try {
    const data = await fetchLinkedInBatches({ limit: 50 });
    loadedCRMBatches = data.batches || [];

    if (loadedCRMBatches.length === 0) {
      crmBatchSelect.innerHTML = '<option value="">No LinkedIn batches found in CRM</option>';
      return;
    }

    crmBatchSelect.innerHTML = '<option value="">-- Select a LinkedIn Batch --</option>' +
      loadedCRMBatches.map(b => `
        <option value="${escapeHtml(b.batch_no)}">
          ${escapeHtml(b.batch_no)} (${b.entity_type}) - ${b.status} (${b.sent_count || 0}/${b.total_count || 0} Sent)
        </option>
      `).join('');

  } catch (err) {
    console.error('Error loading CRM batches:', err);
    crmBatchSelect.innerHTML = `<option value="">Error: ${escapeHtml(err.message)}</option>`;
  }
}

async function handleLoadBatchToQueue(startImmediately = false) {
  const selectedBatchNo = crmBatchSelect ? crmBatchSelect.value : '';
  if (!selectedBatchNo) {
    alert('Please select a LinkedIn batch first.');
    return;
  }

  try {
    const batchDetails = await fetchBatchDetails(selectedBatchNo);
    const executionPayload = batchDetails.executionPayload;

    if (!executionPayload || !Array.isArray(executionPayload.records) || executionPayload.records.length === 0) {
      alert(`Batch ${selectedBatchNo} has no target records.`);
      return;
    }

    // Convert records to extension queue format
    const queueRecords = executionPayload.records.map(r => {
      const rawUrl = r.linkedinProfile || r.url || r.linkedin_url || r.profileUrl || r.profile_url || r.target_url || '';
      const isCompany = r.targetType === 'company' || r.actionType === 'COMPANY_MESSAGE' || (rawUrl && rawUrl.includes('/company/'));
      const actionType = r.actionType || (isCompany ? 'COMPANY_MESSAGE' : 'PERSONAL_CONNECT');
      const targetType = r.targetType || (isCompany ? 'company' : 'personal');
      const defaultUrl = r.username ? (isCompany ? `https://www.linkedin.com/company/${r.username}/` : `https://www.linkedin.com/in/${r.username}/`) : '';

      return {
        jobId: r.jobId || r.job_id,
        batchId: r.batchId || r.batch_id || selectedBatchNo,
        leadId: r.leadId || r.lead_id || r.record_id || r.id,
        itemId: r.itemId || r.item_id,
        actionType: actionType,
        targetType: targetType,
        username: r.username || '',
        displayName: r.displayName || r.name || r.username || '',
        url: rawUrl || defaultUrl,
        linkedinProfile: rawUrl || defaultUrl,
        message: r.message || r.custom_message || r.note || '',
        senderAccountId: r.senderAccountId,
        senderName: r.senderName || 'Tanweer'
      };
    });

    await setActiveCRMBatch({
      batchId: selectedBatchNo,
      senderName: executionPayload.senderName || 'Tanweer'
    });
    await setQueue(queueRecords);

    jsonInput.value = JSON.stringify(queueRecords, null, 2);
    queueSummaryFooter.textContent = `Queue: ${queueRecords.length} profiles`;

    if (startImmediately) {
      // Mark as started in CRM
      try {
        await startSendJob(selectedBatchNo, 'Tanveer');
      } catch (e) {
        console.warn('Notice sending start job to CRM:', e.message);
      }

      // Switch to Monitor Tab & trigger campaign
      document.querySelector('[data-tab="tab-monitor"]').click();
      chrome.runtime.sendMessage({ action: 'START_CAMPAIGN' }, () => {
        appendLog(`🚀 Started outreach for CRM Batch #${selectedBatchNo}`, 'info');
        refreshState();
      });
    } else {
      alert(`Successfully loaded ${queueRecords.length} profiles from Batch #${selectedBatchNo} into Queue!`);
      document.querySelector('[data-tab="tab-campaign"]').click();
    }

  } catch (err) {
    alert(`Failed to load batch: ${err.message}`);
  }
}

/**
 * Refreshes UI running status badge & progress
 */
async function refreshState() {
  const state = await getRunningState();
  if (state.isRunning) {
    if (state.isPaused) {
      statusBadge.textContent = 'PAUSED';
      statusBadge.className = 'status-badge paused';
      btnPause.textContent = '▶️ Resume';
    } else {
      statusBadge.textContent = 'RUNNING';
      statusBadge.className = 'status-badge active';
      btnPause.textContent = '⏸️ Pause';
    }
  } else {
    statusBadge.textContent = 'IDLE';
    statusBadge.className = 'status-badge';
    btnPause.textContent = '⏸️ Pause';
  }

  if (state.total > 0) {
    const percent = Math.round((state.currentIndex / state.total) * 100);
    progressBar.style.width = `${percent}%`;
    progressText.textContent = `Progress: ${percent}%`;
    progressCount.textContent = `${state.currentIndex} / ${state.total}`;
  }
}

/**
 * Load Sample Target Profiles
 */
btnLoadSample.addEventListener('click', () => {
  const sample = [
    {
      username: "satyanadella",
      url: "https://www.linkedin.com/in/satyanadella/",
      message: "Hi Satya, excited to connect with you!"
    },
    {
      username: "example-recruiter",
      url: "https://www.linkedin.com/in/example-recruiter/",
      message: "Hello! I saw your recent updates and wanted to expand my network with fellow industry leaders."
    }
  ];
  jsonInput.value = JSON.stringify(sample, null, 2);
});

/**
 * Save Queue
 */
btnSaveQueue.addEventListener('click', async () => {
  try {
    const raw = jsonInput.value.trim();
    if (!raw) {
      alert('Please paste or write a valid JSON array.');
      return;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      alert('Data must be a JSON array of profile objects.');
      return;
    }
    await setQueue(parsed);
    queueSummaryFooter.textContent = `Queue: ${parsed.length} profiles`;
    appendLog(`Saved ${parsed.length} profiles to queue.`, 'info');
    alert(`Successfully saved ${parsed.length} profiles!`);
  } catch (err) {
    alert(`Invalid JSON format: ${err.message}`);
  }
});

/**
 * Start Campaign
 */
btnStart.addEventListener('click', async () => {
  try {
    const raw = jsonInput.value.trim();
    if (!raw) {
      alert('Please add profiles to queue first.');
      return;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      alert('Queue is empty or invalid.');
      return;
    }
    await setQueue(parsed);

    // Switch to Monitor Tab
    document.querySelector('[data-tab="tab-monitor"]').click();

    // Trigger background start
    chrome.runtime.sendMessage({ action: 'START_CAMPAIGN' }, () => {
      appendLog('Campaign dispatched to background worker.', 'info');
      refreshState();
    });
  } catch (err) {
    alert(`Error starting campaign: ${err.message}`);
  }
});

/**
 * Pause / Resume
 */
btnPause.addEventListener('click', async () => {
  const state = await getRunningState();
  if (state.isPaused) {
    chrome.runtime.sendMessage({ action: 'RESUME_CAMPAIGN' }, () => {
      refreshState();
    });
  } else {
    chrome.runtime.sendMessage({ action: 'PAUSE_CAMPAIGN' }, () => {
      refreshState();
    });
  }
});

/**
 * Stop Campaign
 */
btnStop.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'STOP_CAMPAIGN' }, () => {
    appendLog('Stop signal sent to background.', 'warn');
    refreshState();
  });
});

/**
 * Append log entry to UI console
 */
function appendLog(text, level = 'info', timestamp = new Date().toLocaleTimeString()) {
  const entry = document.createElement('div');
  entry.className = `log-entry ${level}`;
  entry.innerHTML = `<span class="time">${timestamp}</span> ${escapeHtml(text)}`;
  logBox.appendChild(entry);
  logBox.scrollTop = logBox.scrollHeight;
}

function escapeHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Listen for live background log broadcasts
 */
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'NEW_LOG') {
    appendLog(msg.text, msg.level, msg.timestamp);
    updateStatsFromHistory();
    refreshState();
  }
});

/**
 * Update stats cards
 */
async function updateStatsFromHistory() {
  const queue = await getQueue();
  const history = await getHistory();

  statTotal.textContent = queue.length || 0;
  
  const sent = history.filter(h => h.status === 'SUCCESS').length;
  const skipped = history.filter(h => h.status === 'SKIPPED').length;
  const failed = history.filter(h => h.status === 'FAILED').length;

  statSent.textContent = sent;
  statSkipped.textContent = skipped;
  statFailed.textContent = failed;
}

/**
 * Render history table
 */
async function renderHistory() {
  const history = await getHistory();
  if (!history || history.length === 0) {
    historyTableBody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: #64748b; padding: 16px;">No history recorded yet.</td></tr>`;
    return;
  }

  historyTableBody.innerHTML = history.slice().reverse().map(item => {
    const tagClass = item.status === 'SUCCESS' ? 'tag-success' : item.status === 'SKIPPED' ? 'tag-skipped' : 'tag-failed';
    const timeStr = item.timestamp ? new Date(item.timestamp).toLocaleTimeString() : '--:--';
    return `
      <tr>
        <td title="${escapeHtml(item.url || '')}"><strong>${escapeHtml(item.username || item.url || 'Unknown')}</strong></td>
        <td><span class="tag ${tagClass}">${item.status}</span></td>
        <td style="color: #64748b;">${timeStr}</td>
      </tr>
    `;
  }).join('');
}

/**
 * Clear History
 */
btnClearHistory.addEventListener('click', async () => {
  if (confirm('Are you sure you want to clear all history?')) {
    await clearAllHistory();
    await renderHistory();
    await updateStatsFromHistory();
    appendLog('Outreach history cleared.', 'warn');
  }
});

/**
 * Export CSV
 */
btnExportCsv.addEventListener('click', async () => {
  const history = await getHistory();
  if (!history || history.length === 0) {
    alert('No history to export.');
    return;
  }

  let csvContent = "data:text/csv;charset=utf-8,Username,ProfileURL,Status,Reason,Timestamp\n";
  history.forEach(row => {
    csvContent += `"${row.username || ''}","${row.url || ''}","${row.status}","${(row.reason || '').replace(/"/g, '""')}","${row.timestamp || ''}"\n`;
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `linkedin_outreach_history_${new Date().toISOString().slice(0,10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
});

/**
 * Save Settings
 */
btnSaveSettings.addEventListener('click', async () => {
  const settings = {
    minDelay: parseInt(settingMinDelay.value, 10) || 6,
    maxDelay: parseInt(settingMaxDelay.value, 10) || 12,
    dailyLimit: parseInt(settingDailyLimit.value, 10) || 30
  };

  await saveSettings(settings);
  alert('Settings saved successfully!');
});
