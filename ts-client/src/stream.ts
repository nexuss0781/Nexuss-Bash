import type { NexussEvent, SessionStreamEventType, SessionStreamEvents } from './types.js';

type Listener<T> = (payload: T) => void;

export interface EventStreamItem<T = Record<string, unknown>> {
  event: string;
  payload: NexussEvent<T>;
}

/**
 * Minimal EventEmitter over the server's `/events` Server-Sent Events channel.
 * Emits named events (`run_completed`, `job_completed`, ...) with the full
 * `NexussEvent` object, plus `close`/`error`. Also async-iterable:
 * `for await (const ev of stream)`.
 */
export class EventStream {
  private readonly listeners = new Map<string, Set<Listener<unknown>>>();
  private readonly controller: AbortController;
  private ended = false;
  private queue: EventStreamItem[] = [];
  private waiters: Array<(r: IteratorResult<EventStreamItem>) => void> = [];

  constructor(controller: AbortController) {
    this.controller = controller;
  }

  on<T = Record<string, unknown>>(
    event: string,
    listener: (payload: NexussEvent<T>) => void
  ): this {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as Listener<unknown>);
    return this;
  }

  once<T = Record<string, unknown>>(
    event: string,
    listener: (payload: NexussEvent<T>) => void
  ): this {
    const wrapped: Listener<unknown> = (payload) => {
      this.off(event, wrapped as never);
      (listener as Listener<unknown>)(payload);
    };
    return this.on(event, wrapped as never);
  }

  off<T = Record<string, unknown>>(
    event: string,
    listener: (payload: NexussEvent<T>) => void
  ): this {
    const set = this.listeners.get(event);
    if (set) set.delete(listener as Listener<unknown>);
    return this;
  }

  removeAllListeners(): this {
    this.listeners.clear();
    return this;
  }

  /** Terminate the underlying connection. */
  close(): void {
    if (!this.controller.signal.aborted) this.controller.abort();
    this._end();
  }

  _end(): void {
    if (this.ended) return;
    this.ended = true;
    for (const resolve of this.waiters.splice(0)) {
      resolve({ done: true, value: undefined });
    }
  }

  _emit(event: string, payload: unknown): void {
    const set = this.listeners.get(event);
    if (set) {
      for (const listener of Array.from(set)) {
        try {
          listener(payload);
        } catch {
          // Listener errors are intentionally swallowed.
        }
      }
    }
    this.push({ event, payload } as EventStreamItem);
  }

  _error(message: string): void {
    this._emit('error', { message });
  }

  private push(ev: EventStreamItem): void {
    const resolve = this.waiters.shift();
    if (resolve) {
      resolve({ done: false, value: ev });
    } else if (!this.ended) {
      this.queue.push(ev);
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<EventStreamItem> {
    return {
      next: (): Promise<IteratorResult<EventStreamItem>> => {
        const item = this.queue.shift();
        if (item) {
          return Promise.resolve({ done: false, value: item });
        }
        if (this.ended) {
          return Promise.resolve({ done: true, value: undefined });
        }
        return new Promise((resolve) => {
          this.waiters.push(resolve as (r: IteratorResult<EventStreamItem>) => void);
        });
      },
      return: (): Promise<IteratorResult<EventStreamItem>> => {
        this.close();
        return Promise.resolve({ done: true, value: undefined });
      },
    };
  }
}

export interface SessionStreamEvent<T extends SessionStreamEventType = SessionStreamEventType> {
  event: T;
  payload: SessionStreamEvents[T];
}

/**
 * Minimal EventEmitter over a Server-Sent Events connection. Emits named
 * events (`stdout`, `exec_start`, `exec_end`, `close`, `error`) and is also
 * async-iterable for `for await (const ev of stream)` consumption.
 */
export class SessionStream {
  private readonly listeners = new Map<SessionStreamEventType, Set<Listener<unknown>>>();
  private readonly controller: AbortController;
  private ended = false;
  private queue: SessionStreamEvent[] = [];
  private waiters: Array<(r: IteratorResult<SessionStreamEvent>) => void> = [];

  constructor(controller: AbortController) {
    this.controller = controller;
  }

  on<T extends SessionStreamEventType>(
    event: T,
    listener: (payload: SessionStreamEvents[T]) => void
  ): this {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as Listener<unknown>);
    return this;
  }

  once<T extends SessionStreamEventType>(
    event: T,
    listener: (payload: SessionStreamEvents[T]) => void
  ): this {
    const wrapped: Listener<unknown> = (payload) => {
      this.off(event, wrapped as never);
      (listener as Listener<unknown>)(payload);
    };
    return this.on(event, wrapped as never);
  }

  off<T extends SessionStreamEventType>(
    event: T,
    listener: (payload: SessionStreamEvents[T]) => void
  ): this {
    const set = this.listeners.get(event);
    if (set) set.delete(listener as Listener<unknown>);
    return this;
  }

  removeAllListeners(): this {
    this.listeners.clear();
    return this;
  }

  /** Terminate the underlying connection. */
  close(): void {
    if (!this.controller.signal.aborted) this.controller.abort();
    this._end();
  }

  _end(): void {
    if (this.ended) return;
    this.ended = true;
    for (const resolve of this.waiters.splice(0)) {
      resolve({ done: true, value: undefined });
    }
  }

  _emit(event: SessionStreamEventType, payload: unknown): void {
    const set = this.listeners.get(event);
    if (set) {
      for (const listener of Array.from(set)) {
        try {
          listener(payload);
        } catch {
          // Listener errors are intentionally swallowed.
        }
      }
    }
    this.push({ event, payload } as SessionStreamEvent);
  }

  _error(message: string): void {
    this._emit('error', { message });
  }

  private push(ev: SessionStreamEvent): void {
    const resolve = this.waiters.shift();
    if (resolve) {
      resolve({ done: false, value: ev });
    } else if (!this.ended) {
      this.queue.push(ev);
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<SessionStreamEvent> {
    return {
      next: (): Promise<IteratorResult<SessionStreamEvent>> => {
        const item = this.queue.shift();
        if (item) {
          return Promise.resolve({ done: false, value: item });
        }
        if (this.ended) {
          return Promise.resolve({ done: true, value: undefined });
        }
        return new Promise((resolve) => {
          this.waiters.push(resolve as (r: IteratorResult<SessionStreamEvent>) => void);
        });
      },
      return: (): Promise<IteratorResult<SessionStreamEvent>> => {
        this.close();
        return Promise.resolve({ done: true, value: undefined });
      },
    };
  }
}
