/**
 * Frontend logger that sends structured logs to the browser console
 * with timestamp, level, and context for debugging.
 * 
 * In production, can be extended to send logs to a remote endpoint.
 */

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

const STYLES: Record<LogLevel, string> = {
  DEBUG: 'color: #6b7280; font-weight: bold;',
  INFO: 'color: #3b82f6; font-weight: bold;',
  WARN: 'color: #f59e0b; font-weight: bold;',
  ERROR: 'color: #ef4444; font-weight: bold;',
};

function formatMessage(level: LogLevel, module: string, message: string, data?: unknown): string {
  const ts = new Date().toISOString();
  const prefix = `%c[${ts}] [${level}] [${module}]`;
  if (data !== undefined) {
    return `${prefix} ${message}`;
  }
  return `${prefix} ${message}`;
}

function log(level: LogLevel, module: string, message: string, data?: unknown): void {
  if (typeof window === 'undefined') return; // SSR safety

  const formatted = formatMessage(level, module, message, data);
  const style = STYLES[level];

  switch (level) {
    case 'DEBUG':
      if (data !== undefined) {
        console.debug(formatted, style, data);
      } else {
        console.debug(formatted, style);
      }
      break;
    case 'INFO':
      if (data !== undefined) {
        console.info(formatted, style, data);
      } else {
        console.info(formatted, style);
      }
      break;
    case 'WARN':
      if (data !== undefined) {
        console.warn(formatted, style, data);
      } else {
        console.warn(formatted, style);
      }
      break;
    case 'ERROR':
      if (data !== undefined) {
        console.error(formatted, style, data);
      } else {
        console.error(formatted, style);
      }
      break;
  }
}

export const createLogger = (module: string) => ({
  debug: (message: string, data?: unknown) => log('DEBUG', module, message, data),
  info: (message: string, data?: unknown) => log('INFO', module, message, data),
  warn: (message: string, data?: unknown) => log('WARN', module, message, data),
  error: (message: string, data?: unknown) => log('ERROR', module, message, data),
});