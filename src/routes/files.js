'use strict';

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const mime = require('mime-types');
const router = express.Router();
const config = require('../config');
const { generateFileId } = require('../utils/id');
const { log, audit } = require('../utils/logger');

const UPLOAD_DIR = path.join(config.WORKSPACE_BASE, 'uploads');
const METADATA_PATH = path.join(UPLOAD_DIR, 'metadata.json');

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: config.MAX_UPLOAD_MB * 1024 * 1024 },
});

let metadata = [];

function loadMetadata() {
  try {
    if (fs.existsSync(METADATA_PATH)) {
      const raw = fs.readFileSync(METADATA_PATH, 'utf8');
      metadata = JSON.parse(raw);
    } else {
      metadata = [];
    }
  } catch {
    metadata = [];
  }
}

function saveMetadata() {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.writeFileSync(METADATA_PATH, JSON.stringify(metadata, null, 2), 'utf8');
}

function findFile(id) {
  return metadata.find((f) => f.id === id) || null;
}

// Load on startup
loadMetadata();

// POST /files/upload
router.post('/upload', (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          error: {
            code: 'payload_too_large',
            message: `File exceeds ${config.MAX_UPLOAD_MB}MB limit`,
            details: { max_mb: config.MAX_UPLOAD_MB },
          },
        });
      }
      return res.status(400).json({
        error: { code: 'bad_request', message: err.message, details: {} },
      });
    }

    if (err) {
      return res.status(500).json({
        error: { code: 'internal_error', message: err.message, details: {} },
      });
    }

    if (!req.file) {
      return res.status(400).json({
        error: { code: 'bad_request', message: 'No file provided', details: {} },
      });
    }

    try {
      const id = generateFileId();
      const subDir = req.body.path ? path.dirname(req.body.path) : '';
      const targetDir = path.join(UPLOAD_DIR, subDir);
      fs.mkdirSync(targetDir, { recursive: true });

      const targetPath = path.join(targetDir, req.file.originalname);
      fs.writeFileSync(targetPath, req.file.buffer);

      const mimeType = mime.lookup(req.file.originalname) || req.file.mimetype || 'application/octet-stream';

      const record = {
        id,
        name: req.file.originalname,
        original_name: req.file.originalname,
        path: targetPath,
        size_bytes: req.file.size,
        mime_type: mimeType,
        uploaded_at: new Date().toISOString(),
      };

      metadata.push(record);
      saveMetadata();

      audit('file_upload', id, { name: record.name, size_bytes: record.size_bytes });

      res.status(201).json({ data: record });
    } catch (innerErr) {
      log('error', 'files', 'Upload failed', { error: innerErr.message });
      res.status(500).json({
        error: { code: 'internal_error', message: innerErr.message, details: {} },
      });
    }
  });
});

// GET /files - List all uploaded files
router.get('/', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  const offset = parseInt(req.query.offset, 10) || 0;
  const total = metadata.length;
  const data = metadata.slice(offset, offset + limit);
  res.json({ data, total });
});

// GET /files/:id - Get file metadata
router.get('/:id', (req, res) => {
  const file = findFile(req.params.id);
  if (!file) {
    return res.status(404).json({
      error: { code: 'not_found', message: 'File not found', details: {} },
    });
  }
  res.json({ data: file });
});

// GET /files/:id/download - Download file content
router.get('/:id/download', (req, res) => {
  const file = findFile(req.params.id);
  if (!file) {
    return res.status(404).json({
      error: { code: 'not_found', message: 'File not found', details: {} },
    });
  }

  if (!fs.existsSync(file.path)) {
    return res.status(404).json({
      error: { code: 'not_found', message: 'File not found on disk', details: {} },
    });
  }

  const contentType = file.mime_type || 'application/octet-stream';
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${file.original_name}"`);

  const stream = fs.createReadStream(file.path);
  stream.pipe(res);
});

// DELETE /files/:id - Delete file
router.delete('/:id', (req, res) => {
  const idx = metadata.findIndex((f) => f.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({
      error: { code: 'not_found', message: 'File not found', details: {} },
    });
  }

  const file = metadata[idx];

  try {
    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }
  } catch (err) {
    log('error', 'files', 'Failed to delete file from disk', { path: file.path, error: err.message });
  }

  metadata.splice(idx, 1);
  saveMetadata();

  audit('file_delete', file.id, { name: file.name });

  res.json({ data: { id: file.id, name: file.name } });
});

module.exports = router;
