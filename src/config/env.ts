import dotenv from 'dotenv';
import logger from '../logging/logger.js';

dotenv.config();

export interface EnvConfig {
  linkedinUsername: string;
  linkedinPassword: string;
  googleSheetWebAppLink: string;
  senderName: string;
  targetType: string;
  headless: boolean;
}

let cachedConfig: EnvConfig | null = null;

/**
 * Loads configuration from environment variables (.env).
 * Throws an explicit error if required configuration variables are missing.
 */
export async function getEnvConfig(): Promise<EnvConfig> {
  if (cachedConfig) {
    return cachedConfig;
  }

  const username = (process.env.LINKEDIN_USERNAME || process.env.LINKEDIN_USER || '').trim();
  const password = (process.env.LINKEDIN_PASSWORD || process.env.LINKEDIN_PASS || '').trim();
  const googleSheetWebAppLink = (process.env.GOOGLE_SHEET_WEB_APP_LINK || process.env.GOOGLE_SHEET_WEB_APP_URL || '').trim();
  const senderName = (process.env.SENDER_NAME || '').trim();
  const targetType = (process.env.TARGET_TYPE || '').trim();
  const headless = process.env.HEADLESS === 'true';

  const missing: string[] = [];
  if (!username) missing.push('LINKEDIN_USERNAME');
  if (!password) missing.push('LINKEDIN_PASSWORD');
  if (!googleSheetWebAppLink) missing.push('GOOGLE_SHEET_WEB_APP_LINK');

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s) in .env: ${missing.join(', ')}. ` +
      `Please fill in these values in your .env file.`
    );
  }

  cachedConfig = {
    linkedinUsername: username,
    linkedinPassword: password,
    googleSheetWebAppLink,
    senderName,
    targetType,
    headless,
  };

  return cachedConfig;
}
