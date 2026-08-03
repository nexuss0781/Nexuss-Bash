'use strict';

const express = require('express');
const crypto = require('crypto');
const persistence = require('../persistence');
const { generateApiKey, hashApiKey, hashPassword, verifyPassword } = require('../keys');
const { log } = require('../utils/logger');

const router = express.Router();

function issueKey(user) {
  const api_key = generateApiKey();
  persistence.upsertUser({ ...user, api_key_hash: hashApiKey(api_key) });
  return api_key;
}

function userBody(user, api_key) {
  const body = { user_id: user.id, email: user.email, username: user.username };
  if (api_key) body.api_key = api_key;
  return body;
}

// POST /auth/register — create account, issue pk_ key (shown once)
router.post('/register', (req, res) => {
  const { email, username, password } = req.body || {};
  if (!email || !String(email).includes('@')) {
    return res.status(400).json({
      error: { code: 'bad_request', message: 'A valid email is required', details: { field: 'email' } },
    });
  }
  if (!username || typeof username !== 'string') {
    return res.status(400).json({
      error: { code: 'bad_request', message: 'username is required', details: { field: 'username' } },
    });
  }
  if (!password || String(password).length < 8) {
    return res.status(400).json({
      error: { code: 'bad_request', message: 'Password must be at least 8 characters', details: { field: 'password' } },
    });
  }

  if (!persistence.isReady()) {
    return res.status(503).json({
      error: { code: 'unavailable', message: 'Persistence not initialized, try again shortly', details: {} },
    });
  }

  if (persistence.getUserByEmail(email)) {
    return res.status(409).json({
      error: { code: 'conflict', message: 'Email already registered', details: { field: 'email' } },
    });
  }

  const user = {
    id: crypto.randomUUID(),
    email: String(email).toLowerCase(),
    username,
    password_hash: hashPassword(password),
    created_at: new Date().toISOString(),
  };
  if (!persistence.upsertUser(user)) {
    return res.status(500).json({
      error: { code: 'internal_error', message: 'Failed to create user', details: {} },
    });
  }

  const api_key = issueKey(user);
  log('info', 'auth', `registered user ${user.id} (${user.email})`);
  res.status(201).json({ data: userBody(user, api_key) });
});

// POST /auth/login — verify password, rotate key (old key invalidated)
router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({
      error: { code: 'bad_request', message: 'email and password are required', details: {} },
    });
  }
  const user = persistence.getUserByEmail(email);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({
      error: { code: 'unauthorized', message: 'Invalid email or password', details: {} },
    });
  }

  const api_key = issueKey(user);
  log('info', 'auth', `login user ${user.id} (${user.email}), key rotated`);
  res.json({ data: userBody(user, api_key) });
});

// POST /auth/api-key — mint/rotate current user's key (auth required)
router.post('/api-key', (req, res) => {
  if (!req.user) {
    return res.status(401).json({
      error: { code: 'unauthorized', message: 'API key required', details: {} },
    });
  }
  if (req.user.role === 'admin') {
    return res.status(400).json({
      error: { code: 'bad_request', message: 'The bootstrap admin key cannot mint per-user keys; register a user', details: {} },
    });
  }
  const user = persistence.getUserById(req.user.id);
  if (!user) {
    return res.status(404).json({
      error: { code: 'not_found', message: 'User not found', details: {} },
    });
  }
  const api_key = issueKey(user);
  log('info', 'auth', `rotated key for user ${user.id}`);
  res.json({ data: userBody(user, api_key) });
});

// GET /auth/me — current user (auth required)
router.get('/me', (req, res) => {
  if (!req.user) {
    return res.status(401).json({
      error: { code: 'unauthorized', message: 'API key required', details: {} },
    });
  }
  res.json({ data: { user_id: req.user.id, email: req.user.email, username: req.user.username, role: req.user.role } });
});

module.exports = router;
