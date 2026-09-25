import logger from '../logging/logger.js';
import { LinkedInMessageRecord } from './json.js';

export function extractUsername(url: string, name: string): string {
  if (url) {
    try {
      const cleanUrl = url.startsWith('http') ? url : `https://${url}`;
      const parsedUrl = new URL(cleanUrl);
      const pathname = parsedUrl.pathname.replace(/\/$/, '');
      const parts = pathname.split('/').filter(Boolean);
      if (parts.length > 0) {
        const lastPart = parts[parts.length - 1];
        if (lastPart && lastPart !== 'in' && lastPart !== 'company') {
          return lastPart;
        }
      }
    } catch {
      // ignore parsing failure
    }
  }
  if (name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }
  return `user_${Date.now()}`;
}

export function formatMessage(
  rawScript: string,
  companyName: string,
  senderName: string,
  targetType: string
): string {
  let msg = rawScript ? rawScript.trim() : '';

  if (!msg) {
    const nameStr = companyName ? companyName : 'there';
    const typeStr = targetType ? targetType : 'business';
    const senderStr = senderName ? senderName : '';
    msg = `Hi ${nameStr}, I hope you are doing well. I noticed your ${typeStr} on LinkedIn and would love to connect.`;
    if (senderStr) {
      msg += ` Best regards, ${senderStr}`;
    }
  } else {
    msg = msg
      .replace(/\{company_name\}/gi, companyName)
      .replace(/\{name\}/gi, companyName)
      .replace(/\{sender_name\}/gi, senderName)
      .replace(/\{sender\}/gi, senderName)
      .replace(/\{target_type\}/gi, targetType);
  }

  // Trim to 200 characters limit for LinkedIn connection note
  if (msg.length > 200) {
    msg = msg.substring(0, 197) + '...';
  }

  return msg;
}

/**
 * Fetches outreach records from Google Sheet Web App (Scripts/web_app.js).
 */
export async function fetchSheetRecords(
  webAppUrl: string,
  senderName: string,
  targetType: string
): Promise<LinkedInMessageRecord[]> {
  if (!webAppUrl) {
    throw new Error('GOOGLE_SHEET_WEB_APP_LINK is not specified in .env');
  }

  logger.info(`Fetching outreach data from Google Sheet Web App: ${webAppUrl}...`);

  const requestUrl = webAppUrl.includes('?') 
    ? `${webAppUrl}&platform=linkedin` 
    : `${webAppUrl}?platform=linkedin`;

  const response = await fetch(requestUrl, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Google Sheet request failed with HTTP ${response.status}: ${response.statusText}`);
  }

  const json: any = await response.json();

  if (!json || !json.success || !Array.isArray(json.data)) {
    throw new Error(`Invalid response structure from Google Sheet Web App: ${JSON.stringify(json)}`);
  }

  const rawRows: any[] = json.data;
  const records: LinkedInMessageRecord[] = [];

  for (const row of rawRows) {
    const name = row.name ? String(row.name).trim() : '';
    const url = row.linkedinUrl ? String(row.linkedinUrl).trim() : (row.url ? String(row.url).trim() : '');
    const rawScript = row.script ? String(row.script).trim() : '';
    const status = row.statusL ? String(row.statusL).trim() : (row.status ? String(row.status).trim() : '');
    const timestamp = row.timestampL ? String(row.timestampL).trim() : (row.timestamp ? String(row.timestamp).trim() : '');
    const rowIndex = row.rowIndex ? Number(row.rowIndex) : undefined;

    const username = extractUsername(url, name);
    const finalMessage = formatMessage(rawScript, name, senderName, targetType);

    records.push({
      rowIndex,
      name,
      username,
      url,
      message: finalMessage,
      status,
      timestamp,
    });
  }

  logger.success(`Successfully loaded ${records.length} records from Google Sheet.`);
  return records;
}

/**
 * Updates row status and timestamp in Google Sheet (Column U for status-L & Column V for status-L-timestamp).
 */
export async function updateSheetRowStatus(
  webAppUrl: string,
  rowIndex: number,
  status: 'Send' | 'Failed',
  timestamp?: string
): Promise<boolean> {
  if (!webAppUrl) {
    logger.warn('GOOGLE_SHEET_WEB_APP_LINK is not set. Skipping sheet status update.');
    return false;
  }

  const ts = timestamp || new Date().toLocaleString();
  const payload = {
    rowIndex,
    status,
    timestamp: ts,
    platform: 'linkedin',
  };

  try {
    logger.info(`Updating Google Sheet Row ${rowIndex} -> Status: "${status}", Timestamp: "${ts}"...`);
    const response = await fetch(webAppUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();
    logger.success(`Google Sheet Row ${rowIndex} update completed. Response: ${responseText.substring(0, 150)}`);
    return true;
  } catch (error: any) {
    logger.error(`Failed to update Google Sheet Row ${rowIndex}:`, error);
    return false;
  }
}
