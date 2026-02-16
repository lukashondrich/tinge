import {
  WORD_INGESTION_ERROR_EVENT,
  WORD_INGESTION_HEALTH_EVENT
} from './wordIngestionHealthReporter.js';

const DEFAULT_ALLOWED_EVENTS = new Set([
  WORD_INGESTION_HEALTH_EVENT,
  WORD_INGESTION_ERROR_EVENT
]);

export function createWordIngestionTelemetrySink({
  windowRef = typeof window !== 'undefined' ? window : null,
  customEventCtor = globalThis.CustomEvent,
  eventCtor = globalThis.Event,
  allowedEvents = DEFAULT_ALLOWED_EVENTS
} = {}) {
  function isAllowedEvent(eventName) {
    if (!(allowedEvents instanceof Set)) {
      return true;
    }
    return allowedEvents.has(eventName);
  }

  function emit(eventName, payload) {
    if (
      !windowRef
      || typeof windowRef.dispatchEvent !== 'function'
      || !isAllowedEvent(eventName)
    ) {
      return;
    }

    if (typeof customEventCtor === 'function') {
      windowRef.dispatchEvent(new customEventCtor(eventName, { detail: payload }));
      return;
    }

    if (typeof eventCtor === 'function') {
      windowRef.dispatchEvent(new eventCtor(eventName));
    }
  }

  return {
    emit
  };
}
