const fs = require('fs');
const path = require('path');

const LOG_DIR = process.env.LOG_DIR || path.join(__dirname, '..', '..', 'logs');
const LOG_FILE = process.env.LOG_FILE || path.join(LOG_DIR, 'streambox.log');
const LOG_MAX_BYTES = Number(process.env.LOG_MAX_BYTES || 10 * 1024 * 1024);
const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const CURRENT_LOG_LEVEL = (process.env.LOG_LEVEL || 'info').toLowerCase();
const CRITICAL_INFO_EVENTS = new Set([
  '[BOOT] process_start',
  '[BOOT]',
  '[DB INIT START]',
  '[STARTUP DIAGNOSTICS]',
  'startup_diagnostics',
  '[DB INIT SUCCESS]',
  '[SERVER START]',
  '[SERVER LISTENING VERIFIED]',
  'server_ready',
  'shutdown_started',
  'shutdown_complete',
  'startup_dir_check_failed',
  'startup_dir_check_rejected',
]);

function isCriticalInfoEvent(event) {
  if (!event) return false;
  const name = String(event).trim();
  if (CRITICAL_INFO_EVENTS.has(name)) return true;
  return name.startsWith('[BOOT') || name.startsWith('[DB ') || name.startsWith('[SERVER ') || name.startsWith('[STARTUP ');
}

function shouldLog(level, event) {
  const current = LOG_LEVELS[CURRENT_LOG_LEVEL] ?? LOG_LEVELS.info;

  if (level === 'error' || level === 'warn') return true;
  if (level === 'debug') return current >= LOG_LEVELS.debug;
  if (level === 'info') {
    if (current >= LOG_LEVELS.debug) return true;
    return isCriticalInfoEvent(event);
  }

  return false;
}

function ensureLogDir() {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  } catch {}
}

function rotateIfNeeded() {
  try {
    const stat = fs.statSync(LOG_FILE);
    if (stat.size < LOG_MAX_BYTES) return;

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.renameSync(LOG_FILE, path.join(LOG_DIR, `streambox-${stamp}.log`));
  } catch {}
}

function appendLine(line) {
  ensureLogDir();
  rotateIfNeeded();
  fs.appendFile(LOG_FILE, line + '\n', () => {});
}

function sanitize(details = {}) {
  const copy = {};
  for (const [key, value] of Object.entries(details)) {
    if (/token|secret|authorization|password/i.test(key)) continue;
    if (typeof value === 'string' && value.length > 500) copy[key] = value.slice(0, 500);
    else copy[key] = value;
  }
  return copy;
}

function renderConsoleValue(value, indent = '  ') {
  if (value === null || value === undefined) return String(value);

  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    return value.map((item) => {
      const rendered = renderConsoleValue(item, `${indent}  `);
      if (rendered.includes('\n')) {
        return `${indent}-\n${rendered.replace(/^/gm, `${indent}  `)}`;
      }
      return `${indent}- ${rendered}`;
    }).join('\n');
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value);
    if (!entries.length) return '{}';

    return entries.map(([key, child]) => {
      const nestedIndent = `${indent}  `;
      const rendered = renderConsoleValue(child, nestedIndent);
      if (rendered.includes('\n')) {
        return `${indent}${key}:\n${rendered}`;
      }
      return `${indent}${key}: ${rendered}`;
    }).join('\n');
  }

  if (typeof value === 'string') return JSON.stringify(value);
  return String(value);
}

function formatConsoleEntry(entry) {
  const level = String(entry.level).toUpperCase().padEnd(5, ' ');
  const event = String(entry.event || 'event');
  const lines = [`[${entry.ts}] ${level} | STREAMBOX | ${event}`];

  for (const [key, value] of Object.entries(entry)) {
    if (['ts', 'level', 'event'].includes(key)) continue;
    const rendered = renderConsoleValue(value, '    ');
    if (Array.isArray(value) || typeof value === 'object' || rendered.includes('\n')) {
      lines.push(`  ${key}:\n${rendered}`);
    } else {
      lines.push(`  ${key}: ${rendered}`);
    }
  }

  return lines.join('\n');
}

function write(level, event, details = {}) {
  if (!shouldLog(level, event)) return;

  const entry = {
    ts: new Date().toISOString(),
    level,
    event,
    ...sanitize(details),
  };

  const line = JSON.stringify(entry);
  appendLine(line);

  const consoleLine = process.env.LOG_PRETTY === 'false' ? line : formatConsoleEntry(entry);
  if (level === 'error') return console.error(consoleLine);
  if (level === 'warn') return console.warn(consoleLine);
  return console.log(consoleLine);
}

module.exports = {
  debug: (event, details) => write('debug', event, details),
  info: (event, details) => write('info', event, details),
  warn: (event, details) => write('warn', event, details),
  error: (event, details) => write('error', event, details),
};
