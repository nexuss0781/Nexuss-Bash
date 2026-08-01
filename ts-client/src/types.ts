export interface NexussBashConfig {
  apiKey: string;
  baseUrl?: string;
  /** Default per-request timeout in milliseconds. Defaults to 60000. */
  timeout?: number;
  /** Max retries on 429/503 rate-limit responses. Defaults to 2. */
  maxRetries?: number;
}

export interface Pagination {
  limit?: number;
  offset?: number;
}

export interface HealthResponse {
  status: string;
  version: string;
  uptime_sec: number;
  checks: Record<string, string>;
  sessions_active: number;
  sessions_total_created: number;
  jobs_running: number;
  jobs_total_completed: number;
  packages_installed: number;
  pipelines_total: number;
  mem_pct: number;
  disk_pct: number;
}

export interface ResourceResponse {
  memory: {
    total_mb: number;
    used_mb: number;
    pct: number;
  };
  disk: {
    total_mb: number;
    used_mb: number;
    pct: number;
  };
  load_avg: number[];
  status: string;
  sessions_active: number;
  jobs_running: number;
}

export interface SystemResponse {
  status: string;
  version: string;
  uptime_sec: number;
  resources: ResourceResponse;
  sessions: {
    active: number;
    total_created: number;
  };
  jobs: {
    running: number;
    completed: number;
    failed: number;
  };
  pipelines: {
    running: number;
    total: number;
  };
  packages: {
    installed: number;
    disk_used_mb: number;
  };
  files: {
    count: number;
    total_size_mb: number;
  };
}

export interface CommandEntry {
  name?: string;
  command: string;
  timeout?: number;
  stop_on_fail?: boolean;
}

export interface StepResult {
  id: number;
  name: string;
  command: string;
  status: 'completed' | 'failed' | 'skipped';
  exit_code: number | null;
  duration_ms: number;
  stdout: string;
  stderr: string;
  timed_out: boolean;
}

export interface RunResult {
  id: string;
  status: 'completed' | 'failed';
  submitted_at: string;
  started_at: string;
  finished_at: string;
  total_duration_ms: number;
  progress: string;
  results: StepResult[];
}

export interface RunListItem {
  id: string;
  status: string;
  submitted_at: string;
  finished_at: string;
  total_duration_ms: number;
  progress: string;
  current_step: string | null;
  result_count: number;
}

/** Envelope returned by all list endpoints. */
export interface ListResponse<T> {
  data: T[];
  total: number;
}

export type SessionStatus = 'active' | 'killed';

export interface Session {
  id: string;
  status: SessionStatus;
  created_at: string;
  last_active_at: string;
  cwd: string;
  pid: number;
}

/** Payload returned when creating a session. */
export interface SessionCreate {
  id: string;
  status: string;
  created_at: string;
}

export interface SessionLogs {
  log: string;
  /** Byte offset cursor; pass as `since` to resume from this point. */
  offset: number;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  exit_code: number;
  /** True when the server aborted the command at its exec timeout. */
  timed_out: boolean;
  /** True when the command was interrupted via `killSessionExec` or the session was closed. */
  killed: boolean;
  /** True when stdout exceeded the server output cap and was truncated. */
  truncated: boolean;
  duration_ms: number;
}

export interface KillExecResult {
  status: 'killed';
}

export interface KillSessionResult {
  status: 'killed';
}

export interface FileDeleteResult {
  id: string;
  name: string;
}

export type JobLanguage = 'python3' | 'node' | 'bash' | 'php';

export interface JobLimits {
  memory_mb?: number;
  cpu_pct?: number;
  disk_mb?: number;
}

export interface JobOptions {
  language: JobLanguage;
  code: string;
  timeout_sec?: number;
  limits?: JobLimits;
}

export interface JobRef {
  id: string;
  status: string;
  submitted_at: string;
}

export interface JobDetail extends JobRef {
  language: string;
  started_at: string | null;
  finished_at: string | null;
  exit_code: number | null;
  duration_ms: number | null;
  stdout?: string;
  stderr?: string;
}

export interface FileRecord {
  id: string;
  name: string;
  original_name: string;
  path: string;
  size_bytes: number;
  mime_type: string;
  uploaded_at: string;
}

export interface PipelineRef {
  id: string;
  name: string;
  description: string | null;
  status: string;
  submitted_at: string;
  started_at: string | null;
  finished_at: string | null;
  current_step: string | null;
  progress: string;
  steps: {
    id: string;
    language: string;
    status: string;
  }[];
}

export interface PipelineStep {
  id: string;
  language: string;
  command: string | null;
  code: string | null;
  file_id: string | null;
  timeout: number;
  continue_on_error: boolean;
  always_run: boolean;
  depends_on: string[];
  status: string;
  started_at: string | null;
  finished_at: string | null;
  exit_code: number | null;
  duration_ms: number | null;
  stdout: string;
  stderr: string;
}

export interface PipelineDetail extends PipelineRef {
  steps: PipelineStep[];
}

export type PackageManager = 'apt' | 'pip' | 'npm' | 'composer';

export interface PackageRecord {
  id: string;
  name: string;
  manager: string;
  installed_at: string;
  size_kb: number;
  protected: boolean;
  last_used: string;
}

/** Payload returned when installing a package. */
export interface PackageInstallResult {
  id: string;
  name: string;
  manager: string;
  installed_at: string;
  size_kb: number;
}

export interface PackageRemoveResult {
  name: string;
  manager: string;
}

export interface ApiResponse<T> {
  data: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

/** Events emitted by `SessionStream`. */
export interface SessionStreamEvents {
  session: Session;
  /** Raw PTY chunk (merged stdout/stderr transcript). */
  stdout: string;
  exec_start: { command: string };
  exec_end: {
    command: string;
    exit_code: number;
    timed_out: boolean;
    killed: boolean;
    duration_ms: number;
  };
  close: { status: string };
  error: { message: string };
}

export type SessionStreamEventType = keyof SessionStreamEvents;

export type EventResource = 'run' | 'job' | 'pipeline' | 'session' | 'system' | string;

export type EventType =
  | 'run_started'
  | 'run_step'
  | 'run_completed'
  | 'job_submitted'
  | 'job_running'
  | 'job_completed'
  | 'job_failed'
  | 'pipeline_submitted'
  | 'pipeline_started'
  | 'pipeline_step'
  | 'pipeline_completed'
  | 'pipeline_cancelled'
  | string;

export interface RunStepEvent {
  step: number;
  name: string;
  status: string;
  exit_code: number | null;
  progress: string;
}

export interface RunCompletedEvent {
  status: string;
  total_duration_ms: number;
  steps: number;
  failed_steps: number;
  progress: string;
}

export interface JobCompletedEvent {
  status: string;
  exit_code: number | null;
  duration_ms: number;
}

export interface PipelineCompletedEvent {
  status: string;
  failed_steps: number;
  skipped_steps: number;
}

/** An event emitted by the server's `/events` SSE channel. */
export interface NexussEvent<
  T = Record<string, unknown> | RunStepEvent | RunCompletedEvent | JobCompletedEvent | PipelineCompletedEvent
> {
  /** Monotonic event sequence number (used for `Last-Event-ID` resume). */
  id: number;
  type: EventType;
  resource: EventResource;
  resource_id: string;
  timestamp: string;
  payload: T;
}
