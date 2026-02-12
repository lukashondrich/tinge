const DEBUG_LOG_KEY = 'tinge-debug-logs';

function isDebugLoggingEnabled(storage = window.localStorage) {
  try {
    return storage.getItem(DEBUG_LOG_KEY) === '1';
  } catch {
    return false;
  }
}

export function createLogger(namespace, options = {}) {
  const defaultStorage = typeof window !== 'undefined' ? window.localStorage : null;
  const {
    storage = defaultStorage,
    sink = console // eslint-disable-line no-console
  } = options;

  const prefix = namespace ? `[${namespace}]` : '';
  const format = (args) => (prefix ? [prefix, ...args] : args);
  const shouldLogDebug = () => isDebugLoggingEnabled(storage);

  return {
    log: (...args) => {
      if (shouldLogDebug()) {
        sink.log(...format(args));
      }
    },
    info: (...args) => {
      if (shouldLogDebug()) {
        sink.info(...format(args));
      }
    },
    debug: (...args) => {
      if (shouldLogDebug()) {
        sink.debug(...format(args));
      }
    },
    warn: (...args) => {
      sink.warn(...format(args));
    },
    error: (...args) => {
      sink.error(...format(args));
    }
  };
}
