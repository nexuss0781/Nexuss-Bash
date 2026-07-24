'use strict';

const crypto = require('crypto');

function generateSessionId() {
  return 'sess_' + crypto.randomBytes(4).toString('hex');
}

function generateJobId() {
  return 'job_' + crypto.randomBytes(4).toString('hex');
}

function generatePackageId() {
  return 'pkg_' + crypto.randomBytes(4).toString('hex');
}

function generateFileId() {
  return 'file_' + crypto.randomBytes(4).toString('hex');
}

function generatePipelineId() {
  return 'pipe_' + crypto.randomBytes(4).toString('hex');
}

module.exports = { generateSessionId, generateJobId, generatePackageId, generateFileId, generatePipelineId };
