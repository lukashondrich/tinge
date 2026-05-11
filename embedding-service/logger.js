const ENABLED_VALUES = new Set(['1', 'true', 'yes', 'on']);

function isDebugEnabled(env = process.env) {
  const value = String(env.TINGE_EMBEDDING_DEBUG_LOGS || '').trim().toLowerCase();
  return ENABLED_VALUES.has(value);
}

function createLogger(namespace = 'embedding-service', options = {}) {
  const env = options.env || process.env;
  const sink = options.sink || console;
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

module.exports = {
  createLogger
};
