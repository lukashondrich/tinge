const ENABLED_VALUES = new Set(['1', 'true', 'yes', 'on']);

function isDebugEnabled(env = process.env) {
  const value = String(env.TINGE_BACKEND_DEBUG_LOGS || '').trim().toLowerCase();
  return ENABLED_VALUES.has(value);
}

export function createLogger(namespace = 'backend', options = {}) {
  const { env = process.env, sink = console } = options;
  const debugEnabled = isDebugEnabled(env);
  const prefix = `[${namespace}]`;

  function emit(method, args) {
    const fn = typeof sink[method] === 'function' ? sink[method] : sink.log;
    fn(prefix, ...args);
  }

  return {
    log: (...args) => {
      if (debugEnabled) emit('log', args);
    },
    info: (...args) => {
      if (debugEnabled) emit('info', args);
    },
    debug: (...args) => {
      if (debugEnabled) emit('debug', args);
    },
    warn: (...args) => emit('warn', args),
    error: (...args) => emit('error', args)
  };
}
