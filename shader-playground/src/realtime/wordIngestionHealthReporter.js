export const WORD_INGESTION_HEALTH_EVENT = 'tinge:word-ingestion-health';
export const WORD_INGESTION_ERROR_EVENT = 'tinge:word-ingestion-error';

export function createWordIngestionHealthReporter({
  logInterval = 50,
  info = () => {},
  warn = () => {},
  emitTelemetry = () => {}
} = {}) {
  const interval = Math.max(1, Number(logInterval) || 1);
  let processedWords = 0;

  function recordWordProcessed(getStats = null) {
    processedWords += 1;

    if (processedWords % interval !== 0) {
      return;
    }

    const stats = typeof getStats === 'function' ? getStats() : null;
    emitTelemetry(WORD_INGESTION_HEALTH_EVENT, {
      processedWords,
      stats
    });
    info(`Word ingestion health snapshot (${processedWords} words)`, stats);
  }

  function recordProcessingError({ error, item, getStats = null } = {}) {
    const stats = typeof getStats === 'function' ? getStats() : null;
    const payload = {
      word: item?.word || null,
      error: error?.message || String(error || 'unknown_error'),
      stats
    };
    emitTelemetry(WORD_INGESTION_ERROR_EVENT, payload);
    warn('Word ingestion processing error', payload);
  }

  return {
    recordWordProcessed,
    recordProcessingError
  };
}
