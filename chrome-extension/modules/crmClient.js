/**
 * CRM Client Module for LinkedIn Outreach Extension
 * Communicates with CRM Portal API endpoints to fetch batches, start jobs, and report execution status.
 */

const STORAGE_KEYS = {
  CRM_SETTINGS: 'linkedin_crm_settings',
  ACTIVE_CRM_BATCH: 'linkedin_active_crm_batch'
};

const DEFAULT_CRM_SETTINGS = {
  apiUrl: 'https://crm.colabpetals.com',
  apiKey: ''
};

/**
 * Retrieve saved CRM connection settings from storage
 */
export async function getCRMSettings() {
  try {
    const data = await chrome.storage.local.get(STORAGE_KEYS.CRM_SETTINGS);
    return { ...DEFAULT_CRM_SETTINGS, ...(data[STORAGE_KEYS.CRM_SETTINGS] || {}) };
  } catch {
    return DEFAULT_CRM_SETTINGS;
  }
}

/**
 * Save CRM connection settings to storage
 */
export async function saveCRMSettings(settings) {
  const clean = {
    apiUrl: (settings.apiUrl || 'https://crm.colabpetals.com').replace(/\/$/, ''),
    apiKey: (settings.apiKey || '').trim()
  };
  await chrome.storage.local.set({ [STORAGE_KEYS.CRM_SETTINGS]: clean });
  return clean;
}

/**
 * Helper to build auth and content headers
 */
async function buildHeaders() {
  const settings = await getCRMSettings();
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };
  if (settings.apiKey) {
    headers['x-api-key'] = settings.apiKey;
  }
  return { headers, baseUrl: settings.apiUrl };
}

/**
 * Test connectivity with CRM Portal
 */
export async function checkCRMHealth() {
  const { headers, baseUrl } = await buildHeaders();
  try {
    const res = await fetch(`${baseUrl}/api/linkedin/batches?limit=1`, {
      method: 'GET',
      headers,
      credentials: 'include'
    });
    if (res.status === 401 || res.status === 403) {
      return { connected: true, authenticated: false, message: 'CRM reachable but requires login / valid API key' };
    }
    if (res.ok) {
      return { connected: true, authenticated: true, message: 'Connected to CRM Portal' };
    }
    return { connected: false, authenticated: false, message: `CRM responded with status ${res.status}` };
  } catch (err) {
    return { connected: false, authenticated: false, message: `Cannot connect to CRM at ${baseUrl}: ${err.message}` };
  }
}

/**
 * Fetch list of LinkedIn batches from CRM
 */
export async function fetchLinkedInBatches(filters = {}) {
  const { headers, baseUrl } = await buildHeaders();
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.entity_type) params.set('entity_type', filters.entity_type);
  if (filters.search) params.set('search', filters.search);
  params.set('limit', filters.limit || '20');

  const res = await fetch(`${baseUrl}/api/linkedin/batches?${params.toString()}`, {
    method: 'GET',
    headers,
    credentials: 'include'
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Failed to fetch LinkedIn batches (HTTP ${res.status})`);
  }

  return res.json();
}

/**
 * Fetch complete details and execution payload for a specific LinkedIn batch
 */
export async function fetchBatchDetails(batchNo) {
  const { headers, baseUrl } = await buildHeaders();
  const res = await fetch(`${baseUrl}/api/linkedin/batches/${encodeURIComponent(batchNo)}`, {
    method: 'GET',
    headers,
    credentials: 'include'
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Failed to fetch batch ${batchNo} (HTTP ${res.status})`);
  }

  return res.json();
}

/**
 * Dispatch start send job to CRM for a LinkedIn batch
 */
export async function startSendJob(batchNo, senderName = 'Tanveer') {
  const { headers, baseUrl } = await buildHeaders();
  const res = await fetch(`${baseUrl}/api/linkedin/send`, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify({ batchNo, senderName })
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Failed to start send job (HTTP ${res.status})`);
  }

  return res.json();
}

/**
 * Report single execution result (SENT or FAILED) back to CRM Portal
 */
export async function reportStatus(payload) {
  const { headers, baseUrl } = await buildHeaders();
  const endpoint = `${baseUrl}/api/linkedin/status`;

  const body = {
    jobId: payload.jobId,
    batchId: payload.batchId || payload.batch_no,
    leadId: payload.leadId || payload.record_id,
    username: payload.username,
    status: payload.status, // 'SENT' | 'FAILED'
    status_timestamp: payload.status_timestamp || new Date().toISOString(),
    error: payload.error || payload.error_message || null
  };

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      console.warn(`[CRM Client] Status update notice (HTTP ${res.status}):`, errData.error || res.statusText);
      return { success: false, error: errData.error || `HTTP ${res.status}` };
    }

    const data = await res.json();
    return { success: true, data };
  } catch (err) {
    console.error('[CRM Client] Network error reporting status:', err);
    return { success: false, error: err.message };
  }
}
