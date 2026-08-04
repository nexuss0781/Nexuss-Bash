/** Shared type definitions */

export interface Job {
  id: string;
  language: string;
  code: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'interrupted' | 'cancelled' | 'skipped';
  submitted_at: string;
  finished_at: string | null;
  output_path: string | null;
  stdout: string;
  stderr: string;
  exit_code: number | null;
  timeout_sec: number;
  limits: Record<string, unknown> | null;
}

export interface Run {
  id: string;
  status: 'running' | 'completed' | 'failed' | 'interrupted' | 'cancelled' | 'killed' | 'skipped';
  submitted_at: string;
  finished_at: string | null;
  output_path: string | null;
  steps: Step[];
}

export interface Step {
  id: string;
  command: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  started_at: string | null;
  finished_at: string | null;
  stdout: string;
  stderr: string;
  exit_code: number | null;
}

export interface Pipeline {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  submitted_at: string;
  finished_at: string | null;
  steps: Step[];
  current_step: string | null;
}

export interface Session {
  id: string;
  status: 'active' | 'idle' | 'killed';
  created_at: string;
  last_active_at: string;
  cwd: string;
  logPath: string;
}

export interface Package {
  id: string;
  name: string;
  manager: 'apt' | 'pip' | 'npm' | 'composer';
  installed_at: string;
  size_kb: number;
  protected: boolean;
  last_used: string;
}

export interface Event {
  id: number;
  type: string;
  resource: string;
  resource_id: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

export interface User {
  id: string;
  email: string;
  username: string;
  password_hash: string;
  api_key_hash: string;
  created_at: string;
}

export interface InstallStatus {
  id: string;
  name: string;
  manager: string;
  status: 'installing' | 'completed' | 'failed';
  created_at: string;
  result: Record<string, unknown> | null;
  error: string | null;
}