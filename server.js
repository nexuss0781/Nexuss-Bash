'use strict';

const express = require('express');
const config = require('./src/config');
const { log, audit } = require('./src/utils/logger');
const authMiddleware = require('./src/middleware/auth');
const rateLimiter = require('./src/middleware/rateLimiter');
const auditLogMiddleware = require('./src/middleware/auditLog');
const { errorHandler, notFoundHandler } = require('./src/middleware/errorHandler');

// Core services
const resourceManager = require('./src/core/resourceManager');
const sessionManager = require('./src/core/sessionManager');
const packageManager = require('./src/core/packageManager');

// Routes
const healthRoutes = require('./src/routes/health');
const sessionRoutes = require('./src/routes/sessions');
const jobRoutes = require('./src/routes/jobs');
const packageRoutes = require('./src/routes/packages');
const resourceRoutes = require('./src/routes/resources');
const fileRoutes = require('./src/routes/files');
const pipelineRoutes = require('./src/routes/pipelines');
const systemRoutes = require('./src/routes/system');

const app = express();
const PORT = config.PORT;

// Body parser
app.use(express.json({ limit: '1mb' }));

// Middleware
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
app.use('/health', healthRoutes);
app.use('/files', fileRoutes);
app.use('/sessions', sessionRoutes);
app.use('/jobs', jobRoutes);
app.use('/packages', packageRoutes);
app.use('/resources', resourceRoutes);
app.use('/pipelines', pipelineRoutes);
app.use('/system', systemRoutes);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Initialize services
function initialize() {
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

  log('info', 'server', 'Initialization complete');
}

// Graceful shutdown
function shutdown(signal) {
  log('info', 'server', `Received ${signal}, shutting down...`);

  // Stop accepting new connections
  server.close(() => {
    log('info', 'server', 'HTTP server closed');

    // Stop services
    resourceManager.stop();
    packageManager.stopCleanupCron();
    sessionManager.stopSweep();

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
initialize();

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
