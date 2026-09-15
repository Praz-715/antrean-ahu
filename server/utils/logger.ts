type Level = 'debug' | 'info' | 'warn' | 'error'

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 }
const MIN = LEVELS[(process.env.LOG_LEVEL as Level) || (process.env.NODE_ENV === 'production' ? 'info' : 'debug')]

function write(level: Level, scope: string, message: string, meta?: Record<string, unknown>) {
  if (LEVELS[level] < MIN) return
  const line = {
    t: new Date().toISOString(),
    level,
    scope,
    message,
    ...(meta ?? {}),
  }
  const out = level === 'error' || level === 'warn' ? console.error : console.log
  out(JSON.stringify(line))
}

export function createLogger(scope: string) {
  return {
    debug: (message: string, meta?: Record<string, unknown>) => write('debug', scope, message, meta),
    info: (message: string, meta?: Record<string, unknown>) => write('info', scope, message, meta),
    warn: (message: string, meta?: Record<string, unknown>) => write('warn', scope, message, meta),
    error: (message: string, meta?: Record<string, unknown>) => write('error', scope, message, meta),
  }
}

export const logger = createLogger('app')
