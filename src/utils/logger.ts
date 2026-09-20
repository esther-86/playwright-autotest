import fs from 'fs';
import path from 'path';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

const LOGS_DIR = path.resolve(process.cwd(), 'logs');

// Ensure logs directory exists
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

/**
 * Redacts sensitive credentials, tokens, and PII
 */
function redact(input: string): string {
  return input
    // Redact Emails
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[REDACTED_EMAIL]')
    // Redact API Keys, Passwords, Tokens
    .replace(/(api[_-]?key|password|token|secret|bearer)\s*[:=]\s*["']?([^"'\s&]+)["']?/gi, '$1=[REDACTED]')
    // Redact 16-digit credit cards
    .replace(/\b(?:\d{4}[- ]?){3}\d{4}\b/g, '[REDACTED_CARD]');
}

/**
 * Gets today's log file path: logs/YYYY-MM-DD.log
 */
function getDailyLogPath(): string {
  const today = new Date().toISOString().split('T')[0]; // "2026-09-20"
  return path.join(LOGS_DIR, `${today}.log`);
}

/**
 * Write structured log entry to console and daily file
 */
export function log(level: LogLevel, component: string, message: string, meta?: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  const sanitizedMsg = redact(message);
  const sanitizedMeta = meta ? redact(JSON.stringify(meta)) : '';

  const entry = `[${timestamp}] [${level.padEnd(5)}] [${component}] ${sanitizedMsg} ${sanitizedMeta}`.trim();

  // 1. Write to daily rotating file
  fs.appendFileSync(getDailyLogPath(), entry + '\n', 'utf8');

  // 2. Output to console with color/icons
  if (level === 'ERROR') {
    console.error(entry);
  } else if (level === 'WARN') {
    console.warn(entry);
  } else {
    console.log(entry);
  }
}

export const logger = {
  info: (component: string, msg: string, meta?: Record<string, unknown>) => log('INFO', component, msg, meta),
  warn: (component: string, msg: string, meta?: Record<string, unknown>) => log('WARN', component, msg, meta),
  error: (component: string, msg: string, meta?: Record<string, unknown>) => log('ERROR', component, msg, meta),
  debug: (component: string, msg: string, meta?: Record<string, unknown>) => log('DEBUG', component, msg, meta),
};
