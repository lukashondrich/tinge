// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { createWordIngestionTelemetrySink } from '../../realtime/wordIngestionTelemetrySink.js';
import {
  WORD_INGESTION_ERROR_EVENT,
  WORD_INGESTION_HEALTH_EVENT
} from '../../realtime/wordIngestionHealthReporter.js';

describe('wordIngestionTelemetrySink', () => {
  it('dispatches allowed telemetry events with CustomEvent detail payload', () => {
    const dispatchEvent = vi.fn();
    const events = [];
    const customEventCtor = vi.fn((type, init = {}) => {
      const event = { type, detail: init.detail };
      events.push(event);
      return event;
    });
    const sink = createWordIngestionTelemetrySink({
      windowRef: { dispatchEvent },
      customEventCtor
    });

    sink.emit(WORD_INGESTION_HEALTH_EVENT, { processedWords: 50 });

    expect(customEventCtor).toHaveBeenCalledWith(
      WORD_INGESTION_HEALTH_EVENT,
      { detail: { processedWords: 50 } }
    );
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent).toHaveBeenCalledWith(events[0]);
  });

  it('ignores unknown telemetry events', () => {
    const dispatchEvent = vi.fn();
    const customEventCtor = vi.fn();
    const sink = createWordIngestionTelemetrySink({
      windowRef: { dispatchEvent },
      customEventCtor
    });

    sink.emit('tinge:unknown-event', { ok: false });

    expect(customEventCtor).not.toHaveBeenCalled();
    expect(dispatchEvent).not.toHaveBeenCalled();
  });

  it('falls back to Event when CustomEvent is unavailable', () => {
    const dispatchEvent = vi.fn();
    const eventCtor = vi.fn((type) => ({ type }));
    const sink = createWordIngestionTelemetrySink({
      windowRef: { dispatchEvent },
      customEventCtor: null,
      eventCtor
    });

    sink.emit(WORD_INGESTION_ERROR_EVENT, { error: 'boom' });

    expect(eventCtor).toHaveBeenCalledWith(WORD_INGESTION_ERROR_EVENT);
    expect(dispatchEvent).toHaveBeenCalledWith({ type: WORD_INGESTION_ERROR_EVENT });
  });

  it('no-ops when dispatch target is unavailable', () => {
    const sink = createWordIngestionTelemetrySink({
      windowRef: null,
      customEventCtor: vi.fn(),
      eventCtor: vi.fn()
    });

    expect(() => sink.emit(WORD_INGESTION_HEALTH_EVENT, { processedWords: 1 })).not.toThrow();
  });
});
