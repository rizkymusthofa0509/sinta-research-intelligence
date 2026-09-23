const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;

function write(level, scope, message, extra) {
  if (LEVELS[level] < threshold) return;
  const time = new Date().toISOString().slice(11, 23);
  const line = `${time} ${level.toUpperCase().padEnd(5)} [${scope}] ${message}`;
  const out = level === 'error' || level === 'warn' ? console.error : console.log;
  if (extra !== undefined) out(line, extra);
  else out(line);
}

export function createLogger(scope) {
  return {
    debug: (msg, extra) => write('debug', scope, msg, extra),
    info: (msg, extra) => write('info', scope, msg, extra),
    warn: (msg, extra) => write('warn', scope, msg, extra),
    error: (msg, extra) => write('error', scope, msg, extra),
  };
}
