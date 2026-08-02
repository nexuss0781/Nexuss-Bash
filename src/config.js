'use strict';

const required = ['API_KEY'];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

const config = Object.freeze({
  API_KEY: process.env.API_KEY,
  PORT: parseInt(process.env.PORT || '3000', 10),
  WORKSPACE_BASE: process.env.WORKSPACE_BASE || '/workspace',
  IDLE_SESSION_TIMEOUT_MIN: parseInt(process.env.IDLE_SESSION_TIMEOUT_MIN || '30', 10),
  EXEC_TIMEOUT_SEC: parseInt(process.env.EXEC_TIMEOUT_SEC || '30', 10),
  JOB_TIMEOUT_SEC: parseInt(process.env.JOB_TIMEOUT_SEC || '300', 10),
  MAX_OUTPUT_BYTES: parseInt(process.env.MAX_OUTPUT_BYTES || '1048576', 10),
  CLEANUP_INTERVAL_MIN: parseInt(process.env.CLEANUP_INTERVAL_MIN || '60', 10),
  CLEANUP_TTL_HOURS: parseInt(process.env.CLEANUP_TTL_HOURS || '6', 10),
  SESSION_CREATE_RATE: parseInt(process.env.SESSION_CREATE_RATE || '10', 10),
  JOB_SUBMIT_RATE: parseInt(process.env.JOB_SUBMIT_RATE || '20', 10),
  EXEC_RATE: parseInt(process.env.EXEC_RATE || '100', 10),
  MEMORY_LIMIT_MB: parseInt(process.env.MEMORY_LIMIT_MB || '440', 10),
  CPU_LIMIT_PCT: parseInt(process.env.CPU_LIMIT_PCT || '80', 10),
  DISK_LIMIT_MB: parseInt(process.env.DISK_LIMIT_MB || '9000', 10),
  PACKAGE_INSTALL_RATE: parseInt(process.env.PACKAGE_INSTALL_RATE || '5', 10),
  MAX_UPLOAD_MB: parseInt(process.env.MAX_UPLOAD_MB || '10', 10),
  MAX_PIPELINE_STEPS: parseInt(process.env.MAX_PIPELINE_STEPS || '20', 10),
  ENABLE_BWRAP: process.env.ENABLE_BWRAP === 'true',
  CORS_ORIGINS: process.env.CORS_ORIGINS || '*',
  PARADOX_GATEWAY: process.env.PARADOX_GATEWAY || '',
  PARADOX_TOKEN: process.env.PARADOX_TOKEN || '',
  PARADOX_PASSPHRASE: process.env.PARADOX_PASSPHRASE || 'default',
  PARADOX_PROJECT: process.env.PARADOX_PROJECT || 'nexuss',
  PARADOX_DB: process.env.PARADOX_DB || 'nexuss-bash',
  PARADOX_AUTO_SYNC: process.env.PARADOX_AUTO_SYNC !== 'false',
  PARADOX_PULL_ON_STARTUP: process.env.PARADOX_PULL_ON_STARTUP === 'true',
  PARADOX_FLUSH_INTERVAL_SEC: parseInt(process.env.PARADOX_FLUSH_INTERVAL_SEC || '30', 10),
  PARADOX_OUTPUT_CAP_KB: parseInt(process.env.PARADOX_OUTPUT_CAP_KB || '100', 10),
});

module.exports = config;
