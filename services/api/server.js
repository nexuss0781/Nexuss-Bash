'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const { config } = require('@nexuss/shared/config');
const { log, audit } = require('@nexuss/shared/utils');
const authMiddleware = require('./src/middleware/auth');
const corsMiddleware = require('./src/middleware/cors');
const rateLimiter = require('./src/middleware/rateLimiter');
const auditLogMiddleware = require('./src/middleware/auditLog');
const { errorHandler, notFoundHandler } = require('./src/middleware/errorHandler');

// Core services
const resourceManager = require('./src/core/resourceManager');
const sessionManager = require('./src/core/sessionManager');
const packageManager = require('./src/core/packageManager');
const jobExecutor = require('./src/core/jobExecutor');
const pipelineExecutor = require('./src/core/pipelineExecutor');
const sequentialExecutor = require('./src/core/sequentialExecutor');
const eventBus = require('./src/core/eventBus');
const { init, hydrate, flush, isReady, cleanup } = require('@nexuss/shared/persistence');

// Routes
const healthRoutes = require('./src/routes/health');
const sessionRoutes = require('./src/routes/sessions');
const jobRoutes = require('./src/routes/jobs');
const packageRoutes = require('./src/routes/packages');
const resourceRoutes = require('./src/routes/resources');
const fileRoutes = require('./src/routes/files');
const pipelineRoutes = require('./src/routes/pipelines');
const runRoutes = require('./src/routes/run');
const systemRoutes = require('./src/routes/system');
const eventRoutes = require('./src/routes/events');
const authRoutes = require('./src/routes/auth');

const app = express();
const PORT = config.PORT;

const FRONTEND_DIR = path.join(__dirname, 'frontend', 'out');
const frontendExists = fs.existsSync(FRONTEND_DIR);

// Redirect root to /app
if (frontendExists) {
  app.get('/', (req, res) => {
    res.redirect(302, '/app/');
  });

  app.use('/app', express.static(FRONTEND_DIR, { index: 'index.html' }));

  app.get('/app/*', (req, res) => {
    const reqPath = req.params[0];

    if (reqPath.endsWith('.txt')) {
      return res.status(200).setHeader('Content-Type', 'text/plain').send('');
    }

    const filePath = path.join(FRONTEND_DIR, reqPath);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return res.sendFile(filePath);
    }

    const withSlash = filePath.endsWith('/') ? filePath : filePath + '/';
    const indexPath = path.join(withSlash, 'index.html');
    if (fs.existsSync(indexPath)) {
      return res.sendFile(indexPath);
    }

    const htmlFile = filePath + '.html';
    if (fs.existsSync(htmlFile)) {
      return res.sendFile(htmlFile);
    }

    res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
  });
}

// Body parser
app.use(express.json({ limit: '1mb' }));

// Middleware
app.use(corsMiddleware);
app.use(authMiddleware);
app.use(rateLimiter);
app.use(auditLogMiddleware);

// Resource status headers
app.use((req, res, next) => {
  const snapshot = resourceManager.getSnapshot();
  res.setHeader('X-Resource-Mem', snapshot.mem_pct);
  res.setHeader('X-Resource-Disk', snapshot.disk_pct);
  res.setHeader('X-Resource-Status', resourceManager.getThresholdStatus());
  next();
});

// Routes
app.use('/auth', authRoutes);
app.use('/health', healthRoutes);
app.use('/files', fileRoutes);
app.use('/sessions', sessionRoutes);
app.use('/jobs', jobRoutes);
app.use('/packages', packageRoutes);
app.use('/resources', resourceRoutes);
app.use('/pipelines', pipelineRoutes);
app.use('/run', runRoutes);
app.use('/system', systemRoutes);
app.use('/events', eventRoutes);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Initialize services
async function initialize() {
  log('info', 'server', 'Initializing Nexuss Bash...');

  // Start resource manager
  resourceManager.start();

  // Load package manifest
  packageManager.load();

  // Start package cleanup cron
  packageManager.startCleanupCron();

  // Start session idle sweep
  sessionManager.startSweep();

  // Set hard threshold callback
  resourceManager.setHardThresholdCallback(() => {
    packageManager.cleanup();
    // TODO: Kill oldest idle sessions
  });

  // Persistence: connect (local or synced), hydrate in-memory maps, and mark
  // in-flight records as interrupted (live pty/child processes died with us).
  await init();
  if (!isReady()) {
    log('error', 'server', 'Persistence failed to initialize; exiting');
    process.exit(1);
  }
  const restored = hydrate();
  if (restored.runs) sequentialExecutor.restore(restored.runs);
  if (restored.jobs) jobExecutor.restore(restored.jobs);
  if (restored.pipelines) pipelineExecutor.restore(restored.pipelines);
  if (restored.sessions) sessionManager.restore(restored.sessions);
  if (restored.events) eventBus.restore(restored.events);
  if (restored.packages) packageManager.restore(restored.packages);

  log('info', 'server', 'Initialization complete');

  // In-process cleanup scheduler (replaces separate cron service)
  const CLEANUP_INTERVAL_MS = config.CLEANUP_INTERVAL_MIN * 60 * 1000;
  setInterval(() => {
    try {
      const removed = cleanup();
      if (removed > 0) {
        log('info', 'scheduler', `Cleanup removed ${removed} packages`);
      }
    } catch (err) {
      log('error', 'scheduler', `Cleanup failed: ${err.message}`);
    }
  }, CLEANUP_INTERVAL_MS);
  log('info', 'scheduler', `In-process cleanup cron started (every ${config.CLEANUP_INTERVAL_MIN} min)`);
}

// Graceful shutdown
function shutdown(signal) {
  log('info', 'server', `Received ${signal}, shutting down...`);

  // Stop accepting new connections
  server.close(() => {
    log('info', 'server', 'HTTP server closed');

    // Stop services
    resourceManager.stop();
    sessionManager.stopSweep();

    // Persist the in-memory DB to disk + stop the sync daemon
    await flush();

    // Kill all active sessions
    const sessions = sessionManager.getAllSessions();
    for (const [id, session] of sessions) {
      if (session.status === 'active') {
        sessionManager.close(id);
      }
    }

    // Audit final entry
    audit('server_shutdown', 'system', { signal });

    log('info', 'server', 'Shutdown complete');
    process.exit(0);
  });

  // Force exit after 15 seconds
  setTimeout(() => {
    log('error', 'server', 'Forced shutdown after timeout');
    process.exit(1);
  }, 15000);
}

// Start server
initialize().catch((err) => {
  log('error', 'server', 'Initialization failed', { message: err.message, stack: err.stack });
  process.exit(1);
});

const server = app.listen(PORT, '0.0.0.0', () => {
  log('info', 'server', `Nexuss Bash server listening on port ${PORT}`);
});

// Signal handlers
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Unhandled errors
process.on('unhandledRejection', (reason) => {
  log('error', 'server', 'Unhandled promise rejection', { reason: String(reason) });
});

process.on('uncaughtException', (err) => {
  log('error', 'server', 'Uncaught exception', { message: err.message, stack: err.stack });
});
