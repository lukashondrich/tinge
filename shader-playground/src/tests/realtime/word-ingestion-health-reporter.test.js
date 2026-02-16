import { describe, it, expect, vi } from 'vitest';
import {
  createWordIngestionHealthReporter,
  WORD_INGESTION_ERROR_EVENT,
  WORD_INGESTION_HEALTH_EVENT
} from '../../realtime/wordIngestionHealthReporter.js';

describe('wordIngestionHealthReporter', () => {
  it('logs health snapshots only at configured interval boundaries', () => {
    const info = vi.fn();
    const emitTelemetry = vi.fn();
    const reporter = createWordIngestionHealthReporter({
      logInterval: 3,
      info,
      emitTelemetry
    });

    reporter.recordWordProcessed(() => ({ retries: 0 }));
    reporter.recordWordProcessed(() => ({ retries: 1 }));
    expect(info).not.toHaveBeenCalled();

    reporter.recordWordProcessed(() => ({ retries: 2 }));
    expect(info).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledWith(
      'Word ingestion health snapshot (3 words)',
      { retries: 2 }
    );
    expect(emitTelemetry).toHaveBeenCalledTimes(1);
    expect(emitTelemetry).toHaveBeenCalledWith(WORD_INGESTION_HEALTH_EVENT, {
      processedWords: 3,
      stats: { retries: 2 }
    });
  });

  it('logs processing errors with word and stats context', () => {
    const warn = vi.fn();
    const emitTelemetry = vi.fn();
    const reporter = createWordIngestionHealthReporter({ warn, emitTelemetry });

    reporter.recordProcessingError({
      error: new Error('boom'),
      item: { word: 'hello' },
      getStats: () => ({ circuitOpened: 1, fallbacks: 2 })
    });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('Word ingestion processing error', {
      word: 'hello',
      error: 'boom',
      stats: { circuitOpened: 1, fallbacks: 2 }
    });
    expect(emitTelemetry).toHaveBeenCalledTimes(1);
    expect(emitTelemetry).toHaveBeenCalledWith(WORD_INGESTION_ERROR_EVENT, {
      word: 'hello',
      error: 'boom',
      stats: { circuitOpened: 1, fallbacks: 2 }
    });
  });
});
