/** Minimal counting semaphore with an optional queue limit. */
export class Semaphore {
  constructor(max, { maxQueue = Infinity } = {}) {
    this.max = max;
    this.maxQueue = maxQueue;
    this.active = 0;
    this.queue = [];
  }

  get pending() {
    return this.queue.length;
  }

  acquire(signal) {
    if (this.active < this.max) {
      this.active += 1;
      return Promise.resolve(this.#releaser());
    }
    if (this.queue.length >= this.maxQueue) {
      const err = new Error('Too many requests are waiting');
      err.code = 'BUSY';
      return Promise.reject(err);
    }
    return new Promise((resolve, reject) => {
      const entry = { resolve, reject };
      this.queue.push(entry);
      signal?.addEventListener(
        'abort',
        () => {
          const i = this.queue.indexOf(entry);
          if (i >= 0) {
            this.queue.splice(i, 1);
            reject(abortError());
          }
        },
        { once: true },
      );
    });
  }

  async run(fn, signal) {
    const release = await this.acquire(signal);
    try {
      return await fn();
    } finally {
      release();
    }
  }

  #releaser() {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = this.queue.shift();
      if (next) next.resolve(this.#releaser());
      else this.active -= 1;
    };
  }
}

/** Map over items with at most `limit` running at once. Results keep input order. */
export async function mapLimit(items, limit, fn, { signal, deadline } = {}) {
  const results = new Array(items.length);
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      if (signal?.aborted) throw abortError();
      if (deadline && Date.now() > deadline) return;
      const i = index++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

export const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(abortError());
      },
      { once: true },
    );
  });

export function abortError() {
  const err = new Error('Search was cancelled');
  err.name = 'AbortError';
  err.code = 'ABORTED';
  return err;
}

export function throwIfAborted(signal) {
  if (signal?.aborted) throw abortError();
}
