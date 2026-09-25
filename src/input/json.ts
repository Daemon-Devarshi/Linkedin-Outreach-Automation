import fs from 'fs';
import { MESSAGES_FILE, DATA_DIR } from '../config/constants.js';
import logger from '../logging/logger.js';

export interface LinkedInMessageRecord {
  rowIndex?: number;
  name?: string;
  username: string;
  url: string;
  message: string;
  status?: string;
  timestamp?: string;
}

/**
 * Validates a single JSON record.
 */
function isValidRecord(record: any): record is LinkedInMessageRecord {
  if (!record || typeof record !== 'object') {
    return false;
  }
  return (
    typeof record.username === 'string' && record.username.trim().length > 0 &&
    typeof record.url === 'string' && record.url.trim().length > 0 &&
    typeof record.message === 'string'
  );
}

/**
 * Reads data/messages.json, validates it, and returns typed message records.
 */
export function loadMessageRecords(): LinkedInMessageRecord[] {
  // Ensure the data directory exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // If the file does not exist, create an empty example file
  if (!fs.existsSync(MESSAGES_FILE)) {
    const defaultData = [
      {
        username: "username1",
        url: "https://www.linkedin.com/in/username1/",
        message: "Hi, I'd love to connect with you."
      }
    ];
    fs.writeFileSync(MESSAGES_FILE, JSON.stringify(defaultData, null, 2), 'utf8');
    logger.warn(`Created template data file because it was missing: ${MESSAGES_FILE}`);
  }

  logger.info(`Loading data from ${MESSAGES_FILE}...`);

  let fileContent: string;
  try {
    fileContent = fs.readFileSync(MESSAGES_FILE, 'utf8');
  } catch (error) {
    throw new Error(`Failed to read messages file at ${MESSAGES_FILE}: ${(error as Error).message}`);
  }

  if (!fileContent.trim()) {
    logger.warn(`Messages file is empty.`);
    return [];
  }

  let parsed: any;
  try {
    parsed = JSON.parse(fileContent);
  } catch (error) {
    throw new Error(`Malformed JSON in messages file: ${(error as Error).message}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`Invalid JSON format: Root of ${MESSAGES_FILE} must be an array.`);
  }

  const validRecords: LinkedInMessageRecord[] = [];
  let skippedCount = 0;

  for (let i = 0; i < parsed.length; i++) {
    const record = parsed[i];
    if (isValidRecord(record)) {
      validRecords.push({
        username: record.username.trim(),
        url: record.url.trim(),
        message: record.message
      });
    } else {
      logger.warn(`Skipped malformed record at index ${i}: ${JSON.stringify(record)}`);
      skippedCount++;
    }
  }

  if (skippedCount > 0) {
    logger.warn(`Skipped ${skippedCount} invalid records during loading.`);
  }

  return validRecords;
}
