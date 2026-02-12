export class AsyncWordQueue {
  constructor({ processor, onError = null } = {}) {
    if (typeof processor !== 'function') {
      throw new Error('AsyncWordQueue requires a processor function');
    }
    this.processor = processor;
    this.onError = onError;
    this.queue = [];
    this.processing = false;
  }

  enqueue(item) {
    this.queue.push(item);
    this._drain();
  }

  size() {
    return this.queue.length;
  }

  isProcessing() {
    return this.processing;
  }

  async _drain() {
    if (this.processing) return;
    this.processing = true;

    try {
      while (this.queue.length > 0) {
        const item = this.queue.shift();
        try {
          await this.processor(item);
        } catch (error) {
          if (typeof this.onError === 'function') {
            this.onError(error, item);
          }
        }
      }
    } finally {
      this.processing = false;
      if (this.queue.length > 0) {
        this._drain();
      }
    }
  }
}
