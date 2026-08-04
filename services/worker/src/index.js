'use strict';

const { Queue, Worker } = require('bullmq');
const { config } = require('@nexuss/shared/config');
const { log } = require('@nexuss/shared/utils');
const { generatePackageId } = require('@nexuss/shared/utils');
const { install, getInstallStatus } = require('@nexuss/shared/persistence');

// Redis connection
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const queueName = 'package-installs';

const installQueue = new Queue(queueName, {
  connection: { url: redisUrl },
});

async function installPackage(job) {
  const { name, manager, installId } = job.data;
  log('info', 'worker', `Starting install ${installId}: ${name} via ${manager}`);

  try {
    const { execSync } = require('child_process');
    let cmd;

    switch (manager) {
      case 'apt':
        cmd = `apt-get update -qq && apt-get install -y ${name}`;
        break;
      case 'pip':
        cmd = `pip3 install --break-system-packages ${name}`;
        break;
      case 'npm':
        cmd = `npm install -g ${name}`;
        break;
      case 'composer':
        cmd = `composer global require ${name}`;
        break;
      default:
        throw new Error(`Unsupported manager: ${manager}`);
    }

    execSync(cmd, { encoding: 'utf8', timeout: 300000, stdio: 'pipe' });

    // Calculate installed size
    let size_kb = 0;
    try {
      const { execSync } = require('child_process');
      const output = execSync(`dpkg -L ${name} 2>/dev/null | xargs du -sk 2>/dev/null | tail -1 | awk '{print $1}'`, {
        encoding: 'utf8',
        timeout: 10000,
      });
      size_kb = parseInt(output.trim(), 10) || 0;
    } catch {
      // Size calculation failed, use 0
    }

    // Update status in DB
    const entry = {
      id: generatePackageId(),
      name,
      manager,
      installed_at: new Date().toISOString(),
      size_kb,
      protected: false,
      last_used: new Date().toISOString(),
    };

    // We'd call a shared function to update the DB
    // For now, log success
    log('info', 'worker', `Package installed: ${name} via ${manager}`);
    return { success: true, entry };

  } catch (err) {
    log('error', 'worker', `Package install failed: ${err.message}`);
    throw err;
  }
}

const worker = new Worker(queueName, async (job) => {
  return installPackage(job);
}, {
  connection: { url: redisUrl },
  concurrency: 1,
});

worker.on('completed', (job) => {
  log('info', 'worker', `Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  log('error', 'worker', `Job ${job.id} failed: ${err.message}`);
});

log('info', 'worker', 'Package install worker started');

// Graceful shutdown
process.on('SIGTERM', async () => {
  log('info', 'worker', 'Shutting down...');
  await worker.close();
  await installQueue.close();
  process.exit(0);
});