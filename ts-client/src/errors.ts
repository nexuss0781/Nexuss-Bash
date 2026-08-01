export class NexussBashError extends Error {
  readonly code: string;
  readonly status?: number;
  readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    status?: number,
    details?: Record<string, unknown>,
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = 'NexussBashError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class AuthError extends NexussBashError {
  constructor(message = 'Authentication failed. Check your API key.', status = 401) {
    super(message, 'unauthorized', status);
    this.name = 'AuthError';
  }
}

export class ThrottledError extends NexussBashError {
  readonly retryAfterSec: number;

  constructor(retryAfterSec = 60, message = `Rate limited. Retry after ${retryAfterSec}s.`, status = 429) {
    super(message, 'throttled', status);
    this.name = 'ThrottledError';
    this.retryAfterSec = retryAfterSec;
  }
}

export class NotFoundError extends NexussBashError {
  constructor(message = 'Resource not found.') {
    super(message, 'not_found', 404);
    this.name = 'NotFoundError';
  }
}

export class BadRequestError extends NexussBashError {
  constructor(message = 'Bad request') {
    super(message, 'bad_request', 400);
    this.name = 'BadRequestError';
  }
}

export class ConflictError extends NexussBashError {
  constructor(message = 'Resource is in a conflicting state') {
    super(message, 'conflict', 409);
    this.name = 'ConflictError';
  }
}

export class PayloadTooLargeError extends NexussBashError {
  constructor(message = 'File too large') {
    super(message, 'payload_too_large', 413);
    this.name = 'PayloadTooLargeError';
  }
}

export class ForbiddenError extends NexussBashError {
  constructor(message = 'Action not permitted') {
    super(message, 'forbidden', 403);
    this.name = 'ForbiddenError';
  }
}

export class InternalError extends NexussBashError {
  constructor(message = 'Internal server error') {
    super(message, 'internal_error', 500);
    this.name = 'InternalError';
  }
}

export class ConnectionError extends NexussBashError {
  constructor(url: string, options?: { cause?: unknown }) {
    super(`Cannot connect to ${url}. Check your network and API URL.`, 'connection_error', undefined, undefined, options);
    this.name = 'ConnectionError';
  }
}

export class TimeoutError extends NexussBashError {
  constructor(timeoutMs: number, url?: string) {
    super(
      `Request timed out after ${timeoutMs}ms${url ? ` (${url})` : ''}.`,
      'request_timeout',
      undefined,
      undefined
    );
    this.name = 'TimeoutError';
  }
}
