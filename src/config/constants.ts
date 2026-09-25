import path from 'path';

export const WORKSPACE_ROOT = process.cwd();

export const DATA_DIR = path.join(WORKSPACE_ROOT, 'data');
export const SESSIONS_DIR = path.join(WORKSPACE_ROOT, 'sessions', 'linkedin');
export const LOGS_DIR = path.join(WORKSPACE_ROOT, 'logs');

export const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');
export const PROCESSED_PROFILES_FILE = path.join(DATA_DIR, 'processed_profiles.json');
export const SEEN_FILE = path.join(DATA_DIR, 'seen.json');
export const LOG_FILE = path.join(LOGS_DIR, 'linkedin.log');
export const SESSION_STATE_FILE = path.join(SESSIONS_DIR, 'state.json');

