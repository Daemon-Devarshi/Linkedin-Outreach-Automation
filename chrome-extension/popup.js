/**
 * Popup Script for LinkedIn Outreach Extension
 * Manages tabs, handles form submissions, communicates with background service worker, and updates stats.
 */

import { getQueue, setQueue, getHistory, getSettings, saveSettings, clearAllHistory, getRunningState } from './modules/storage.js';

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

// Initialize on popup open
document.addEventListener('DOMContentLoaded', async () => {
  setupTabs();
  await loadSavedData();
  await refreshState();
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

  // Load History Summary Stats
  await updateStatsFromHistory();
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
      username: "example-tech-founder",
      url: "https://www.linkedin.com/in/example-tech-founder/",
      message: "Hi there! Came across your profile and would love to connect and follow your journey in tech."
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
    chrome.runtime.sendMessage({ action: 'START_CAMPAIGN' }, (response) => {
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
