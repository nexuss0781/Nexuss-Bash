'use strict';

const fs = require('fs');
const path = require('path');

const AUDIT_LOG_PATH = path.join(__dirname, '..', '..', 'data', 'audit.log');

let auditStream = null;

function getAuditStream() {
  if (!auditStream) {
    fs.mkdirSync(path.dirname(AUDIT_LOG_PATH), { recursive: true });
    auditStream = fs.createWriteStream(AUDIT_LOG_PATH, { flags: 'a' });
  }
  return auditStream;
}

function log(level, category, message, details) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    category,
    message,
  };
  if (details !== undefined) {
    entry.details = details;
  }
  const line = JSON.stringify(entry);
  process.stdout.write(line + '\n');
  return entry;
}

function audit(action, resourceId, details) {
  const entry = {
    timestamp: new Date().toISOString(),
    action,
    resourceId,
  };
  if (details !== undefined) {
    entry.details = details;
  }
  const line = JSON.stringify(entry);
  const stream = getAuditStream();
  stream.write(line + '\n');
  log('info', 'audit', action, { resourceId, ...(details || {}) });
  return entry;
}

module.exports = { log, audit };
