import { describe, it, expect } from 'vitest';
import { AsyncWordQueue } from '../../realtime/asyncWordQueue.js';

function waitFor(condition, { timeoutMs = 400, intervalMs = 5 } = {}) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (condition()) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error('waitFor timeout'));
      setTimeout(tick, intervalMs);
    };
    tick();
  });
}

describe('AsyncWordQueue', () => {
  it('processes queued items in FIFO order', async () => {
    const processed = [];
    const queue = new AsyncWordQueue({
      processor: async (item) => {
        processed.push(item);
      }
    });

    queue.enqueue('a');
    queue.enqueue('b');
    queue.enqueue('c');

    await waitFor(() => processed.length === 3);
    expect(processed).toEqual(['a', 'b', 'c']);
  });

  it('continues processing when one item throws', async () => {
    const processed = [];
    const errors = [];
    const queue = new AsyncWordQueue({
      processor: async (item) => {
        if (item === 'bad') throw new Error('boom');
        processed.push(item);
      },
      onError: (error, item) => {
        errors.push({ message: error.message, item });
      }
    });

    queue.enqueue('ok-1');
    queue.enqueue('bad');
    queue.enqueue('ok-2');

    await waitFor(() => processed.length === 2 && errors.length === 1);
    expect(processed).toEqual(['ok-1', 'ok-2']);
    expect(errors[0]).toEqual({ message: 'boom', item: 'bad' });
  });

  it('processes items enqueued while currently draining', async () => {
    const processed = [];
    const queue = new AsyncWordQueue({
      processor: async (item) => {
        processed.push(item);
        if (item === 'first') {
          queue.enqueue('second');
        }
      }
    });

    queue.enqueue('first');

    await waitFor(() => processed.length === 2);
    expect(processed).toEqual(['first', 'second']);
  });
});
