import { describe, it, expect, vi } from 'vitest';
import { createLogger } from '../../utils/logger.js';

describe('createLogger', () => {
  function createSink() {
    return {
      log: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };
  }

  it('suppresses debug/info/log when debug key is disabled', () => {
    const sink = createSink();
    const storage = { getItem: () => '0' };
    const logger = createLogger('test', { sink, storage });

    logger.log('a');
    logger.info('b');
    logger.debug('c');
    logger.warn('d');
    logger.error('e');

    expect(sink.log).not.toHaveBeenCalled();
    expect(sink.info).not.toHaveBeenCalled();
    expect(sink.debug).not.toHaveBeenCalled();
    expect(sink.warn).toHaveBeenCalledWith('[test]', 'd');
    expect(sink.error).toHaveBeenCalledWith('[test]', 'e');
  });

  it('emits debug/info/log when debug key is enabled', () => {
    const sink = createSink();
    const storage = { getItem: () => '1' };
    const logger = createLogger('test', { sink, storage });

    logger.log('a');
    logger.info('b');
    logger.debug('c');

    expect(sink.log).toHaveBeenCalledWith('[test]', 'a');
    expect(sink.info).toHaveBeenCalledWith('[test]', 'b');
    expect(sink.debug).toHaveBeenCalledWith('[test]', 'c');
  });
});
