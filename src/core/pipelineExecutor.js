'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { generatePipelineId } = require('../utils/id');
const { log } = require('../utils/logger');
const jobExecutor = require('./jobExecutor');
const config = require('../config');

const pipelines = new Map();

const SUPPORTED_LANGUAGES = ['python3', 'node', 'bash', 'php'];
const UPLOAD_DIR = '/workspace/uploads';

function parseYaml(yamlContent) {
  try {
    return yaml.load(yamlContent);
  } catch (err) {
    throw new Error(`Invalid YAML: ${err.message}`);
  }
}

function validatePipeline(doc) {
  if (!doc || typeof doc !== 'object') {
    throw new Error('Pipeline must be a YAML object');
  }
  if (!doc.name || typeof doc.name !== 'string') {
    throw new Error('Pipeline requires a "name" field (string)');
  }
  if (!Array.isArray(doc.steps) || doc.steps.length === 0) {
    throw new Error('Pipeline requires a non-empty "steps" array');
  }
  if (doc.steps.length > config.MAX_PIPELINE_STEPS) {
    throw new Error(`Pipeline exceeds maximum of ${config.MAX_PIPELINE_STEPS} steps`);
  }

  const stepIds = new Set();
  for (let i = 0; i < doc.steps.length; i++) {
    const step = doc.steps[i];
    if (!step.id || typeof step.id !== 'string') {
      throw new Error(`Step ${i + 1} requires an "id" field (string)`);
    }
    if (stepIds.has(step.id)) {
      throw new Error(`Duplicate step id: "${step.id}"`);
    }
    stepIds.add(step.id);

    if (!step.command && !step.code && !step.file_id) {
      throw new Error(`Step "${step.id}" requires one of: command, code, file_id`);
    }
    if (step.language && !SUPPORTED_LANGUAGES.includes(step.language)) {
      throw new Error(`Step "${step.id}" has unsupported language: "${step.language}". Supported: ${SUPPORTED_LANGUAGES.join(', ')}`);
    }
    if (step.depends_on && Array.isArray(step.depends_on)) {
      for (const dep of step.depends_on) {
        if (!stepIds.has(dep) && !doc.steps.some((s) => s.id === dep)) {
          throw new Error(`Step "${step.id}" depends on non-existent step "${dep}"`);
        }
      }
    }
  }
}

function buildStep(step) {
  return {
    id: step.id,
    language: step.language || 'bash',
    command: step.command || null,
    code: step.code || null,
    file_id: step.file_id || null,
    root: !!step.root,
    timeout: step.timeout || 30,
    continue_on_error: !!step.continue_on_error,
    always_run: !!step.always_run,
    depends_on: step.depends_on || [],
    status: 'pending',
    started_at: null,
    finished_at: null,
    exit_code: null,
    duration_ms: null,
    stdout: '',
    stderr: '',
  };
}

function readUploadedFile(fileId) {
  const metadataPath = path.join(UPLOAD_DIR, 'metadata.json');
  if (!fs.existsSync(metadataPath)) {
    throw new Error(`File not found: ${fileId}`);
  }
  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  const file = metadata.find((f) => f.id === fileId);
  if (!file) {
    throw new Error(`File not found: ${fileId}`);
  }
  if (!fs.existsSync(file.path)) {
    throw new Error(`File not on disk: ${fileId}`);
  }
  return fs.readFileSync(file.path, 'utf8');
}

function waitForJob(jobId) {
  return new Promise((resolve) => {
    const check = () => {
      const job = jobExecutor.get(jobId);
      if (!job) {
        return resolve({ exit_code: 1, stdout: '', stderr: 'Job not found', duration_ms: 0 });
      }
      if (job.status === 'completed' || job.status === 'failed' || job.status === 'timed_out') {
        return resolve({
          exit_code: job.exit_code,
          stdout: job.stdout || '',
          stderr: job.stderr || '',
          duration_ms: job.duration_ms,
          status: job.status,
        });
      }
      setTimeout(check, 200);
    };
    check();
  });
}

async function executeStep(step) {
  step.status = 'running';
  step.started_at = new Date().toISOString();

  let code;
  let language;

  if (step.code) {
    code = step.code;
    language = step.language || 'bash';
  } else if (step.command) {
    code = step.command;
    language = 'bash';
  } else if (step.file_id) {
    code = readUploadedFile(step.file_id);
    language = step.language || 'bash';
  } else {
    step.status = 'failed';
    step.stderr = 'No code, command, or file_id provided';
    step.finished_at = new Date().toISOString();
    step.exit_code = 1;
    return;
  }

  try {
    if (step.root) {
      const start = Date.now();
      try {
        const stdout = execSync(code, {
          encoding: 'utf8',
          timeout: (step.timeout || 30) * 1000,
          stdio: 'pipe',
          env: { ...process.env, FORCE_COLOR: '0' },
        });
        step.stdout = stdout;
        step.stderr = '';
        step.exit_code = 0;
        step.status = 'completed';
      } catch (err) {
        step.exit_code = err.status !== undefined ? err.status : 1;
        step.stdout = err.stdout || '';
        step.stderr = err.stderr || err.message;
        step.status = 'failed';
      }
      step.duration_ms = Date.now() - start;
    } else {
      const jobResult = jobExecutor.submit({
        language,
        code,
        timeout_sec: step.timeout,
      });

      const result = await waitForJob(jobResult.id);
      step.exit_code = result.exit_code;
      step.stdout = result.stdout;
      step.stderr = result.stderr;
      step.duration_ms = result.duration_ms;
      step.status = result.exit_code === 0 ? 'completed' : 'failed';
    }
  } catch (err) {
    step.status = 'failed';
    step.stderr = err.message;
    step.exit_code = 1;
  }

  step.finished_at = new Date().toISOString();
}

async function execute(pipelineId) {
  const pipeline = pipelines.get(pipelineId);
  if (!pipeline) return;

  pipeline.status = 'running';
  pipeline.started_at = new Date().toISOString();

  const stepResults = {};
  for (const step of pipeline.steps) {
    stepResults[step.id] = 'pending';
  }

  let failedAny = false;

  try {
    for (const step of pipeline.steps) {
      if (pipeline.status === 'cancelled') {
        stepResults[step.id] = 'skipped';
        step.status = 'skipped';
        continue;
      }

      if (step.always_run) {
        // always_run bypasses both dependency checks and failedAny
      } else if (step.depends_on && step.depends_on.length > 0) {
        const depsMet = step.depends_on.every((depId) => stepResults[depId] === 'completed');
        if (!depsMet) {
          step.status = 'skipped';
          stepResults[step.id] = 'skipped';
          log('info', 'pipelineExecutor', `Step "${step.id}" skipped: dependency not met`);
          continue;
        }
      } else if (failedAny) {
        step.status = 'skipped';
        stepResults[step.id] = 'skipped';
        continue;
      }

      pipeline.current_step = step.id;
      pipeline.progress = `${pipeline.steps.indexOf(step)}/${pipeline.steps.length}`;

      log('info', 'pipelineExecutor', `Pipeline ${pipelineId} running step "${step.id}"`);

      await executeStep(step);
      stepResults[step.id] = step.status;

      if (step.status === 'failed' && !step.continue_on_error) {
        failedAny = true;
        log('info', 'pipelineExecutor', `Pipeline ${pipelineId} failed at step "${step.id}"`);
      }
    }
  } catch (err) {
    log('error', 'pipelineExecutor', `Pipeline ${pipelineId} crashed: ${err.message}`);
    failedAny = true;
  }

  pipeline.current_step = null;
  pipeline.progress = `${pipeline.steps.length}/${pipeline.steps.length}`;
  pipeline.finished_at = new Date().toISOString();
  pipeline.status = failedAny ? 'failed' : 'completed';

  audit('pipeline_complete', pipelineId, { status: pipeline.status });
  log('info', 'pipelineExecutor', `Pipeline ${pipelineId} finished: ${pipeline.status}`);
}

function submit(yamlContent, fileId) {
  let yamlString = yamlContent;

  if (!yamlString && fileId) {
    yamlString = readUploadedFile(fileId);
  }

  if (!yamlString) {
    throw new Error('Either yaml content or file_id is required');
  }

  const doc = parseYaml(yamlString);
  validatePipeline(doc);

  const id = generatePipelineId();
  const now = new Date().toISOString();

  const pipeline = {
    id,
    name: doc.name,
    description: doc.description || null,
    status: 'pending',
    submitted_at: now,
    started_at: null,
    finished_at: null,
    steps: doc.steps.map(buildStep),
    current_step: null,
    progress: `0/${doc.steps.length}`,
  };

  pipelines.set(id, pipeline);

  audit('pipeline_submit', id, { name: pipeline.name, step_count: pipeline.steps.length });
  log('info', 'pipelineExecutor', `Pipeline submitted: ${id}`, { name: pipeline.name });

  // Start execution asynchronously
  execute(id);

  return {
    id: pipeline.id,
    name: pipeline.name,
    description: pipeline.description,
    status: pipeline.status,
    submitted_at: pipeline.submitted_at,
    started_at: pipeline.started_at,
    finished_at: pipeline.finished_at,
    steps: pipeline.steps.map((s) => ({
      id: s.id,
      language: s.language,
      status: s.status,
    })),
    current_step: pipeline.current_step,
    progress: pipeline.progress,
  };
}

function get(pipelineId) {
  const pipeline = pipelines.get(pipelineId);
  if (!pipeline) return null;

  return {
    id: pipeline.id,
    name: pipeline.name,
    description: pipeline.description,
    status: pipeline.status,
    submitted_at: pipeline.submitted_at,
    started_at: pipeline.started_at,
    finished_at: pipeline.finished_at,
    steps: pipeline.steps.map((s) => ({
      id: s.id,
      language: s.language,
      command: s.command,
      code: s.code,
      file_id: s.file_id,
      timeout: s.timeout,
      continue_on_error: s.continue_on_error,
      always_run: s.always_run,
      depends_on: s.depends_on,
      status: s.status,
      started_at: s.started_at,
      finished_at: s.finished_at,
      exit_code: s.exit_code,
      duration_ms: s.duration_ms,
      stdout: s.stdout,
      stderr: s.stderr,
    })),
    current_step: pipeline.current_step,
    progress: pipeline.progress,
  };
}

function list() {
  return Array.from(pipelines.values()).map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    status: p.status,
    submitted_at: p.submitted_at,
    started_at: p.started_at,
    finished_at: p.finished_at,
    current_step: p.current_step,
    progress: p.progress,
    steps: p.steps.map((s) => ({
      id: s.id,
      language: s.language,
      status: s.status,
    })),
  }));
}

function cancel(pipelineId) {
  const pipeline = pipelines.get(pipelineId);
  if (!pipeline) return null;

  if (['completed', 'failed', 'cancelled'].includes(pipeline.status)) {
    return { error: 'already_finished' };
  }

  pipeline.status = 'cancelled';
  pipeline.finished_at = new Date().toISOString();

  // Mark pending steps as skipped
  for (const step of pipeline.steps) {
    if (step.status === 'pending') {
      step.status = 'skipped';
    }
  }

  audit('pipeline_cancel', pipelineId);
  log('info', 'pipelineExecutor', `Pipeline cancelled: ${pipelineId}`);

  return { id: pipeline.id, status: pipeline.status };
}

module.exports = { submit, get, list, cancel };
