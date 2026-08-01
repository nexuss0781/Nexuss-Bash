import type {
  ExecResult,
  FileRecord,
  HealthResponse,
  JobDetail,
  JobOptions,
  JobRef,
  KillExecResult,
  KillSessionResult,
  ListResponse,
  NexussBashConfig,
  PackageInstallResult,
  PackageManager,
  PackageRecord,
  PackageRemoveResult,
  Pagination,
  PipelineDetail,
  PipelineRef,
  ResourceResponse,
  RunResult,
  Session,
  SessionCreate,
  SessionLogs,
  SessionStreamEventType,
  SystemResponse,
  FileDeleteResult,
} from './types.js';
import {
  AuthError,
  BadRequestError,
  ConflictError,
  ConnectionError,
  ForbiddenError,
  InternalError,
  NexussBashError,
  NotFoundError,
  PayloadTooLargeError,
  ThrottledError,
  TimeoutError,
} from './errors.js';
import { SessionStream, EventStream } from './stream.js';

type HttpMethod = 'GET' | 'POST' | 'DELETE';

interface RequestOptions {
  body?: unknown;
  query?: object;
  headers?: Record<string, string>;
  /** Client-side abort timeout in ms. Defaults to the client `timeout`. */
  timeout?: number;
  /** External cancellation signal. */
  signal?: AbortSignal;
}

const DEFAULT_BASE_URL = 'https://nexuss-bash.onrender.com';

function qs(params?: object): string {
  if (!params) return '';
  const entries = Object.entries(params).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return '';
  return '?' + entries
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface ErrorBody {
  error?: { code?: string; message?: string; details?: Record<string, unknown> };
  message?: string;
}

export class NexussBash {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly timeout: number;
  readonly maxRetries: number;

  constructor({ apiKey, baseUrl, timeout, maxRetries }: NexussBashConfig) {
    if (!apiKey) {
      throw new Error('NexussBash: `apiKey` is required');
    }
    this.apiKey = apiKey;
    this.baseUrl = (baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.timeout = timeout ?? 60_000;
    this.maxRetries = maxRetries ?? 2;
  }

  private _authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.apiKey}` };
  }

  private _combineSignals(
    signal?: AbortSignal
  ): { controller: AbortController; cleanup: () => void } {
    const controller = new AbortController();
    let onAbort: (() => void) | null = null;
    if (signal) {
      if (signal.aborted) {
        controller.abort();
      } else {
        onAbort = () => controller.abort();
        signal.addEventListener('abort', onAbort, { once: true });
      }
    }
    return {
      controller,
      cleanup: () => {
        if (onAbort) signal?.removeEventListener('abort', onAbort);
      },
    };
  }

  private async _fetch(
    url: string,
    method: HttpMethod,
    body: unknown,
    opts: RequestOptions
  ): Promise<Response> {
    const { controller, cleanup } = this._combineSignals(opts.signal);
    const timer = setTimeout(() => controller.abort(), opts.timeout ?? this.timeout);
    try {
      return await fetch(url, {
        method,
        headers: {
          ...this._authHeaders(),
          ...opts.headers,
          ...(body != null && !(body instanceof FormData)
            ? { 'Content-Type': 'application/json' }
            : {}),
        },
        body:
          body == null
            ? undefined
            : body instanceof FormData
              ? body
              : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      if (opts.signal?.aborted) throw err;
      if (controller.signal.aborted) {
        throw new TimeoutError(opts.timeout ?? this.timeout, url);
      }
      throw new ConnectionError(url, { cause: err });
    } finally {
      clearTimeout(timer);
      cleanup();
    }
  }

  private async _readErrorBody(res: Response): Promise<ErrorBody> {
    try {
      const json = (await res.json()) as ErrorBody;
      return json;
    } catch {
      return { error: { message: res.statusText } };
    }
  }

  private _mapError(status: number, errBody: ErrorBody, url: string): NexussBashError {
    const message = errBody?.error?.message ?? errBody?.message;
    const details = errBody?.error?.details;
    const retryAfter = Number(details?.retry_after_sec) || 60;

    switch (status) {
      case 400:
        return new BadRequestError(message);
      case 401:
        return new AuthError(message);
      case 403:
        return new ForbiddenError(message);
      case 404:
        return new NotFoundError(message);
      case 409:
        return new ConflictError(message);
      case 413:
        return new PayloadTooLargeError(message);
      case 429:
        return new ThrottledError(retryAfter, message);
      case 500:
        return new InternalError(message);
      case 503:
        return new ThrottledError(retryAfter, message, 503);
      default:
        return new ConnectionError(url);
    }
  }

  private async _request<T>(method: HttpMethod, path: string, opts: RequestOptions = {}): Promise<T> {
    const url = this.baseUrl + path + qs(opts.query);

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const res = await this._fetch(url, method, opts.body, opts);

      if (res.ok || res.status === 204) {
        if (res.status === 204) return undefined as T;
        return (await res.json()) as T;
      }

      const errBody = await this._readErrorBody(res);
      const mapped = this._mapError(res.status, errBody, url);

      if ((res.status === 429 || res.status === 503) && attempt < this.maxRetries) {
        const retryAfter = mapped instanceof ThrottledError ? mapped.retryAfterSec : 1;
        await sleep(Math.max(1, retryAfter) * 1000);
        continue;
      }
      throw mapped;
    }

    throw new ConnectionError(url);
  }

  private static data<T>(body: unknown): T {
    const record = body as { data?: T } | null;
    return record && record.data !== undefined ? record.data : (body as T);
  }

  private static list<T>(body: unknown): ListResponse<T> {
    const record = body as { data?: T[]; total?: number } | null;
    if (record && Array.isArray(record.data)) {
      return { data: record.data, total: record.total ?? record.data.length };
    }
    if (Array.isArray(body)) {
      return { data: body as T[], total: body.length };
    }
    return { data: [], total: 0 };
  }

  private _get<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    return this._request<T>('GET', path, opts);
  }

  private _post<T>(path: string, body?: unknown, opts: RequestOptions = {}): Promise<T> {
    return this._request<T>('POST', path, { ...opts, body });
  }

  private _delete<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    return this._request<T>('DELETE', path, opts);
  }

  // ── Health & System ──────────────────────────────────────────

  health(): Promise<HealthResponse> {
    return this._get<unknown>('/health').then((body) =>
      NexussBash.data<HealthResponse>(body)
    );
  }

  system(): Promise<SystemResponse> {
    return this._get<unknown>('/system').then((body) =>
      NexussBash.data<SystemResponse>(body)
    );
  }

  resources(): Promise<ResourceResponse> {
    return this._get<unknown>('/resources').then((body) =>
      NexussBash.data<ResourceResponse>(body)
    );
  }

  // ── Command Runner ───────────────────────────────────────────

  run(
    commands: string[],
    options?: { timeout?: number; signal?: AbortSignal }
  ): Promise<RunResult> {
    const serverTimeout = options?.timeout ?? 600_000;
    const requestTimeout = Math.max(this.timeout, serverTimeout + 30_000);
    return this._post<{ data?: RunResult }>('/run', { commands, timeout: serverTimeout }, {
      timeout: requestTimeout,
      signal: options?.signal,
    }).then((body) => NexussBash.data<RunResult>(body));
  }

  runYaml(
    yaml: string,
    options?: { timeout?: number; signal?: AbortSignal }
  ): Promise<RunResult> {
    const serverTimeout = options?.timeout ?? 600_000;
    const requestTimeout = Math.max(this.timeout, serverTimeout + 30_000);
    return this._post<{ data?: RunResult }>('/run', { yaml, timeout: serverTimeout }, {
      timeout: requestTimeout,
      signal: options?.signal,
    }).then((body) => NexussBash.data<RunResult>(body));
  }

  listRuns(options?: Pagination): Promise<ListResponse<RunResult>> {
    return this._get<unknown>('/run', { query: options }).then((body) =>
      NexussBash.list<RunResult>(body)
    );
  }

  getRun(id: string): Promise<RunResult> {
    return this._get<unknown>(`/run/${encodeURIComponent(id)}`).then((body) =>
      NexussBash.data<RunResult>(body)
    );
  }

  // ── Sessions ─────────────────────────────────────────────────

  createSession(): Promise<SessionCreate> {
    return this._post<{ data?: SessionCreate }>('/sessions').then((body) =>
      NexussBash.data<SessionCreate>(body)
    );
  }

  listSessions(options?: Pagination): Promise<ListResponse<Session>> {
    return this._get<unknown>('/sessions', { query: options }).then((body) =>
      NexussBash.list<Session>(body)
    );
  }

  getSession(id: string): Promise<Session> {
    return this._get<unknown>(`/sessions/${encodeURIComponent(id)}`).then((body) =>
      NexussBash.data<Session>(body)
    );
  }

  getSessionLogs(
    id: string,
    options?: { tail?: number; since?: number }
  ): Promise<SessionLogs> {
    return this._get<unknown>(`/sessions/${encodeURIComponent(id)}/logs`, {
      query: options,
    }).then((body) => NexussBash.data<SessionLogs>(body));
  }

  execInSession(
    id: string,
    command: string,
    options?: { timeout?: number; signal?: AbortSignal }
  ): Promise<ExecResult> {
    return this._post<{ data?: ExecResult }>(
      `/sessions/${encodeURIComponent(id)}/exec`,
      { command },
      { timeout: options?.timeout, signal: options?.signal }
    ).then((body) => NexussBash.data<ExecResult>(body));
  }

  killSessionExec(id: string): Promise<KillExecResult> {
    return this._post<{ data?: KillExecResult }>(
      `/sessions/${encodeURIComponent(id)}/kill`
    ).then((body) => NexussBash.data<KillExecResult>(body));
  }

  killSession(id: string): Promise<KillSessionResult> {
    return this._delete<{ data?: KillSessionResult }>(
      `/sessions/${encodeURIComponent(id)}`
    ).then((body) => NexussBash.data<KillSessionResult>(body));
  }

  /**
   * Open a live Server-Sent Events stream for a session. Emits `stdout`
   * chunks, `exec_start`/`exec_end` markers, and `close`/`error`. Also
   * async-iterable: `for await (const ev of stream) { ... }`.
   */
  streamSession(
    id: string,
    options?: { timeout?: number; signal?: AbortSignal }
  ): SessionStream {
    const url = `${this.baseUrl}/sessions/${encodeURIComponent(id)}/stream`;
    const controller = new AbortController();
    const stream = new SessionStream(controller);

    const timer = setTimeout(() => controller.abort(), options?.timeout ?? this.timeout);
    const onSignal = () => controller.abort();
    if (options?.signal) {
      if (options.signal.aborted) controller.abort();
      else options.signal.addEventListener('abort', onSignal, { once: true });
    }

    void (async () => {
      try {
        const res = await fetch(url, {
          headers: this._authHeaders(),
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (!res.ok || !res.body) {
          const errBody = await this._readErrorBody(res);
          const mapped = this._mapError(res.status, errBody, url);
          controller.abort();
          stream._error(mapped.message);
          stream._end();
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        let closedByServer = false;

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });

          let sep = buf.indexOf('\n\n');
          while (sep !== -1) {
            const block = buf.slice(0, sep);
            buf = buf.slice(sep + 2);
            if (parseSSEBlock(block, stream) === 'close') {
              closedByServer = true;
              break;
            }
            sep = buf.indexOf('\n\n');
          }
          if (closedByServer) break;
        }

        if (buf.trim()) parseSSEBlock(buf, stream);
        stream._end();
      } catch (err) {
        if (controller.signal.aborted || options?.signal?.aborted) {
          stream._end();
          return;
        }
        stream._error(err instanceof Error ? err.message : String(err));
        stream._end();
      } finally {
        clearTimeout(timer);
        options?.signal?.removeEventListener('abort', onSignal);
      }
    })();

    return stream;
  }

  /**
   * Open the server-wide `/events` SSE channel. Emits lifecycle events for
   * runs, jobs, and pipelines (`run_completed`, `job_completed`,
   * `pipeline_completed`, ...), each carrying the full `NexussEvent` object.
   * Pass `lastEventId` to resume from a previous event sequence number.
   * Also async-iterable: `for await (const ev of stream) { ... }`.
   */
  events(options?: { lastEventId?: number; timeout?: number; signal?: AbortSignal }): EventStream {
    const url = `${this.baseUrl}/events`;
    const controller = new AbortController();
    const stream = new EventStream(controller);

    const timer = setTimeout(() => controller.abort(), options?.timeout ?? this.timeout);
    const onSignal = () => controller.abort();
    if (options?.signal) {
      if (options.signal.aborted) controller.abort();
      else options.signal.addEventListener('abort', onSignal, { once: true });
    }

    void (async () => {
      try {
        const headers: Record<string, string> = this._authHeaders();
        if (options?.lastEventId != null) headers['Last-Event-ID'] = String(options.lastEventId);
        const res = await fetch(url, { headers, signal: controller.signal });
        clearTimeout(timer);

        if (!res.ok || !res.body) {
          const errBody = await this._readErrorBody(res);
          const mapped = this._mapError(res.status, errBody, url);
          controller.abort();
          stream._error(mapped.message);
          stream._end();
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        let closedByServer = false;

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });

          let sep = buf.indexOf('\n\n');
          while (sep !== -1) {
            const block = buf.slice(0, sep);
            buf = buf.slice(sep + 2);
            if (parseEventBlock(block, stream) === 'close') {
              closedByServer = true;
              break;
            }
            sep = buf.indexOf('\n\n');
          }
          if (closedByServer) break;
        }

        if (buf.trim()) parseEventBlock(buf, stream);
        stream._end();
      } catch (err) {
        if (controller.signal.aborted || options?.signal?.aborted) {
          stream._end();
          return;
        }
        stream._error(err instanceof Error ? err.message : String(err));
        stream._end();
      } finally {
        clearTimeout(timer);
        options?.signal?.removeEventListener('abort', onSignal);
      }
    })();

    return stream;
  }

  // ── Jobs ─────────────────────────────────────────────────────

  submitJob(options: JobOptions): Promise<JobRef> {
    return this._post<{ data?: JobRef }>('/jobs', options).then((body) =>
      NexussBash.data<JobRef>(body)
    );
  }

  listJobs(options?: Pagination & { status?: string }): Promise<ListResponse<JobRef>> {
    return this._get<unknown>('/jobs', { query: options }).then((body) =>
      NexussBash.list<JobRef>(body)
    );
  }

  getJob(id: string): Promise<JobDetail> {
    return this._get<unknown>(`/jobs/${encodeURIComponent(id)}`).then((body) =>
      NexussBash.data<JobDetail>(body)
    );
  }

  // ── Files ────────────────────────────────────────────────────

  uploadFile(file: Blob | Uint8Array | ArrayBuffer, name: string, path?: string): Promise<FileRecord> {
    const form = new FormData();

    let blob: Blob;
    if (typeof Blob !== 'undefined' && file instanceof Blob) {
      blob = file;
    } else {
      const bytes = file instanceof Uint8Array ? file : new Uint8Array(file as ArrayBuffer);
      blob = new Blob([new Uint8Array(bytes.buffer as ArrayBuffer, bytes.byteOffset, bytes.byteLength) as BlobPart]);
    }

    form.append('file', blob, name);
    if (path) form.append('path', path);

    return this._post<{ data?: FileRecord }>('/files/upload', form, {
      timeout: Math.max(this.timeout, 120_000),
    }).then((body) => NexussBash.data<FileRecord>(body));
  }

  listFiles(options?: Pagination): Promise<ListResponse<FileRecord>> {
    return this._get<unknown>('/files', { query: options }).then((body) =>
      NexussBash.list<FileRecord>(body)
    );
  }

  getFile(id: string): Promise<FileRecord> {
    return this._get<unknown>(`/files/${encodeURIComponent(id)}`).then((body) =>
      NexussBash.data<FileRecord>(body)
    );
  }

  /** Download a file. Call `await res.arrayBuffer()` or `await res.text()` on the result. */
  downloadFile(id: string, options: { timeout?: number; signal?: AbortSignal } = {}): Promise<Response> {
    const url = `${this.baseUrl}/files/${encodeURIComponent(id)}/download`;
    return this._fetch(url, 'GET', undefined, options).then(async (res) => {
      if (!res.ok) {
        const errBody = await this._readErrorBody(res);
        throw this._mapError(res.status, errBody, url);
      }
      return res;
    });
  }

  deleteFile(id: string): Promise<FileDeleteResult> {
    return this._delete<{ data?: FileDeleteResult }>(
      `/files/${encodeURIComponent(id)}`
    ).then((body) => NexussBash.data<FileDeleteResult>(body));
  }

  // ── Pipelines ────────────────────────────────────────────────

  runPipeline(
    yaml: string,
    options?: { timeout?: number; signal?: AbortSignal }
  ): Promise<PipelineDetail> {
    const serverTimeout = options?.timeout ?? 120_000;
    const requestTimeout = Math.max(this.timeout, serverTimeout + 30_000);
    return this._post<{ data?: PipelineDetail }>(
      '/pipelines/run',
      { yaml, timeout: serverTimeout },
      { timeout: requestTimeout, signal: options?.signal }
    ).then((body) => NexussBash.data<PipelineDetail>(body));
  }

  submitPipeline(yaml: string): Promise<PipelineRef> {
    return this._post<{ data?: PipelineRef }>('/pipelines', { yaml }).then((body) =>
      NexussBash.data<PipelineRef>(body)
    );
  }

  listPipelines(options?: Pagination & { status?: string }): Promise<ListResponse<PipelineRef>> {
    return this._get<unknown>('/pipelines', { query: options }).then((body) =>
      NexussBash.list<PipelineRef>(body)
    );
  }

  getPipeline(id: string): Promise<PipelineDetail> {
    return this._get<unknown>(`/pipelines/${encodeURIComponent(id)}`).then((body) =>
      NexussBash.data<PipelineDetail>(body)
    );
  }

  cancelPipeline(id: string): Promise<{ id: string; status: string }> {
    return this._delete<{ data?: { id: string; status: string } }>(
      `/pipelines/${encodeURIComponent(id)}`
    ).then((body) => NexussBash.data<{ id: string; status: string }>(body));
  }

  // ── Packages ─────────────────────────────────────────────────

  installPackage(name: string, manager: PackageManager): Promise<PackageInstallResult> {
    return this._post<{ data?: PackageInstallResult }>('/packages/install', {
      name,
      manager,
    }).then((body) => NexussBash.data<PackageInstallResult>(body));
  }

  listPackages(options?: Pagination): Promise<ListResponse<PackageRecord>> {
    return this._get<unknown>('/packages', { query: options }).then((body) =>
      NexussBash.list<PackageRecord>(body)
    );
  }

  removePackage(name: string): Promise<PackageRemoveResult> {
    return this._delete<{ data?: PackageRemoveResult }>(
      `/packages/${encodeURIComponent(name)}`
    ).then((body) => NexussBash.data<PackageRemoveResult>(body));
  }
}

function parseSSEBlock(
  block: string,
  stream: SessionStream
): SessionStreamEventType | null {
  let eventName = 'message';
  const dataLines: string[] = [];

  for (const line of block.split('\n')) {
    if (line.startsWith(':')) continue;
    if (line.startsWith('event:')) {
      eventName = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).replace(/^ /, ''));
    }
  }

  if (dataLines.length === 0) return null;

  const raw = dataLines.join('\n');
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    payload = raw;
  }

  if (eventName === 'message') return null;

  stream._emit(eventName as SessionStreamEventType, payload);
  return eventName as SessionStreamEventType;
}

function parseEventBlock(block: string, stream: EventStream): string | null {
  let eventName = 'message';
  const dataLines: string[] = [];

  for (const line of block.split('\n')) {
    if (line.startsWith(':')) continue;
    if (line.startsWith('event:')) {
      eventName = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).replace(/^ /, ''));
    }
  }

  if (dataLines.length === 0) return null;

  const raw = dataLines.join('\n');
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    payload = raw;
  }

  if (eventName === 'message') return null;

  stream._emit(eventName, payload);
  return eventName;
}
