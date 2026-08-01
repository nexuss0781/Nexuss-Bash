'use strict';

const MAX_REPLAY = 200;

const listeners = new Set();
const replayBuffer = [];
let seq = 0;

/**
 * Emit a lifecycle event for a resource (run / job / pipeline / system).
 * The event is broadcast to all subscribers and retained in a bounded
 * replay buffer so late-joining SSE clients can catch up.
 *
 * @param {string} type      event type, e.g. 'job_completed'
 * @param {string} resource  resource kind, e.g. 'job'
 * @param {string} id        resource id
 * @param {object} [payload] optional event-specific data
 */
function emit(type, resource, id, payload = {}) {
  const event = {
    id: ++seq,
    type,
    resource,
    resource_id: id,
    timestamp: new Date().toISOString(),
    payload,
  };

  replayBuffer.push(event);
  if (replayBuffer.length > MAX_REPLAY) replayBuffer.shift();

  for (const listener of listeners) {
    try {
      listener(event);
    } catch (e) {
      // Subscriber errors must never break the emitter.
    }
  }

  return event;
}

/**
 * Register a subscriber. Returns an unsubscribe function.
 * @param {(event: object) => void} handler
 */
function subscribe(handler) {
  listeners.add(handler);
  return () => listeners.delete(handler);
}

/** Return the most recent events (oldest → newest), optionally after an id. */
function recent(afterId = 0, limit = MAX_REPLAY) {
  const start = afterId > 0 ? replayBuffer.findIndex((e) => e.id > afterId) : 0;
  const slice = start === -1 ? [] : replayBuffer.slice(start);
  return slice.slice(-limit);
}

module.exports = { emit, subscribe, recent };
