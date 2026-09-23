/**
 * Storage management using chrome.storage.local.
 * Manages target queues, sent history, and user settings.
 */

const STORAGE_KEYS = {
  QUEUE: 'linkedin_outreach_queue',
  HISTORY: 'linkedin_outreach_history',
  SETTINGS: 'linkedin_outreach_settings',
  RUNNING_STATE: 'linkedin_outreach_running_state',
  ACTIVE_CRM_BATCH: 'linkedin_active_crm_batch'
};

const DEFAULT_SETTINGS = {
  minDelay: 6,
  maxDelay: 12,
  dailyLimit: 30,
  stopOnLimit: true
};

export async function getQueue() {
  const data = await chrome.storage.local.get(STORAGE_KEYS.QUEUE);
  return data[STORAGE_KEYS.QUEUE] || [];
}

export async function setQueue(queue) {
  await chrome.storage.local.set({ [STORAGE_KEYS.QUEUE]: queue });
}

export async function getHistory() {
  const data = await chrome.storage.local.get(STORAGE_KEYS.HISTORY);
  return data[STORAGE_KEYS.HISTORY] || [];
}

export async function recordHistory(item) {
  const history = await getHistory();
  history.push({
    username: item.username,
    url: item.url,
    status: item.status, // 'SUCCESS' | 'SKIPPED' | 'FAILED'
    reason: item.reason || '',
    timestamp: new Date().toISOString()
  });
  await chrome.storage.local.set({ [STORAGE_KEYS.HISTORY]: history });
}

export async function isProfileProcessed(username) {
  if (!username) return false;
  const history = await getHistory();
  const cleanUser = username.trim().toLowerCase();
  return history.some(h => 
    h.username && h.username.trim().toLowerCase() === cleanUser && h.status === 'SUCCESS'
  );
}

export async function getSettings() {
  const data = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  return { ...DEFAULT_SETTINGS, ...(data[STORAGE_KEYS.SETTINGS] || {}) };
}

export async function saveSettings(settings) {
  await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: settings });
}

export async function getRunningState() {
  const data = await chrome.storage.local.get(STORAGE_KEYS.RUNNING_STATE);
  return data[STORAGE_KEYS.RUNNING_STATE] || { isRunning: false, isPaused: false, currentIndex: 0, total: 0 };
}

export async function setRunningState(state) {
  await chrome.storage.local.set({ [STORAGE_KEYS.RUNNING_STATE]: state });
}

export async function clearAllHistory() {
  await chrome.storage.local.set({ [STORAGE_KEYS.HISTORY]: [] });
}

export async function getActiveCRMBatch() {
  const data = await chrome.storage.local.get(STORAGE_KEYS.ACTIVE_CRM_BATCH);
  return data[STORAGE_KEYS.ACTIVE_CRM_BATCH] || null;
}

export async function setActiveCRMBatch(batch) {
  await chrome.storage.local.set({ [STORAGE_KEYS.ACTIVE_CRM_BATCH]: batch });
}
