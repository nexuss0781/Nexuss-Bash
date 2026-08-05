'use strict';

const fs = require('fs');
const path = require('path');
const { generatePackageId } = require('../utils/id');
const { log, audit } = require('@nexuss/shared/utils');
const { init, hydrate, flush, isReady, isEnabled, saveRun, saveJob, savePipeline, saveSession, saveEvent, savePackage, removePackage, pruneEvents, upsertUser, getUserByApiKeyHash, getUserByEmail, getUserById } = require('@nexuss/shared/persistence');
const config = require('@nexuss/shared/config');

const MANIFEST_PATH = path.join(__dirname, '..', '..', 'data', 'packages.json');
const CLEANUP_INTERVAL_MS = config.CLEANUP_INTERVAL_MIN * 60 * 1000;
const CLEANUP_TTL_MS = config.CLEANUP_TTL_HOURS * 60 * 60 * 1000;

let manifest = { packages: [] };
let cleanupInterval = null;

// Track async installs
const pendingInstalls = new Map();

function load() {
  try {
    if (fs.existsSync(MANIFEST_PATH)) {
      const data = fs.readFileSync(MANIFEST_PATH, 'utf8');
      manifest = JSON.parse(data);
      if (!manifest.packages) {
        manifest.packages = [];
      }
    }
  } catch {
    manifest = { packages: [] };
  }
  return manifest;
}

function save() {
  fs.mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true });
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
}

function add(name, manager, size_kb = 0) {
  const entry = {
    id: generatePackageId(),
    name,
    manager,
    installed_at: new Date().toISOString(),
    size_kb,
    protected: false,
    last_used: new Date().toISOString(),
  };

  manifest.packages.push(entry);
  save();
  savePackage(entry);
  return entry;
}

function remove(name) {
  const idx = manifest.packages.findIndex((p) => p.name === name);
  if (idx === -1) {
    throw new Error(`Package not found: ${name}`);
  }

  const removed = manifest.packages.splice(idx, 1)[0];
  save();
  removePackage(removed.name);
  return removed;
}

function get(name) {
  return manifest.packages.find((p) => p.name === name) || null;
}

function list() {
  return manifest.packages;
}

function isProtected(name) {
  const pkg = get(name);
  return pkg && pkg.protected;
}

function getInstallStatus(installId) {
  return pendingInstalls.get(installId) || { status: 'not_found' };
}

async function install(name, manager) {
  if (!name || name.length === 0) {
    throw new Error('Package name cannot be empty');
  }

  const supportedManagers = ['apt', 'pip', 'npm', 'composer'];
  if (!supportedManagers.includes(manager)) {
    throw new Error(`Unsupported manager: ${manager}. Supported: ${supportedManagers.join(', ')}`);
  }

  log('info', 'packageManager', `Installing ${name} via ${manager}`);

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
  }

  try {
    execSync(cmd, { encoding: 'utf8', timeout: 300000, stdio: 'pipe' });
  } catch (err) {
    throw new Error(`Package install failed: ${err.stderr || err.message}`);
  }

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

  // Add to manifest
  const entry = add(name, manager, size_kb);

  audit('package_install', name, { manager, size_kb });
  log('info', 'packageManager', `Package installed: ${name} via ${manager}`);

  return {
    id: entry.id,
    name,
    manager,
    installed_at: entry.installed_at,
    size_kb,
  };
}

// Async install - returns immediately with install_id, runs in background
function installAsync(name, manager) {
  const installId = generatePackageId();

  pendingInstalls.set(installId, {
    id: installId,
    name,
    manager,
    status: 'installing',
    created_at: new Date().toISOString(),
    result: null,
    error: null,
  });

  // Run install in background
  (async () => {
    try {
      const result = await install(name, manager);
      pendingInstalls.set(installId, {
        ...pendingInstalls.get(installId),
        status: 'completed',
        result,
        error: null,
      });
    } catch (err) {
      pendingInstalls.set(installId, {
        ...pendingInstalls.get(installId),
        status: 'failed',
        result: null,
        error: err.message,
      });
    }
  })();

  return {
    id: installId,
    name,
    manager,
    status: 'installing',
    created_at: new Date().toISOString(),
  };
}

async function uninstall(name, manager) {
  const pkg = get(name);
  if (!pkg) {
    throw new Error(`Package not found: ${name}`);
  }

  if (pkg.protected) {
    throw new Error(`Cannot remove protected package: ${name}`);
  }

  log('info', 'packageManager', `Uninstalling ${name} via ${manager || pkg.manager}`);

  const useManager = manager || pkg.manager;
  const { execSync } = require('child_process');
  let cmd;

  switch (useManager) {
    case 'apt':
      cmd = `apt-get remove -y ${name}`;
      break;
    case 'pip':
      cmd = `pip3 uninstall -y ${name}`;
      break;
    case 'npm':
      cmd = `npm uninstall -g ${name}`;
      break;
    case 'composer':
      cmd = `composer global remove ${name}`;
      break;
    default:
      throw new Error(`Unsupported manager: ${useManager}`);
  }

  try {
    execSync(cmd, { encoding: 'utf8', timeout: 60000, stdio: 'pipe' });
  } catch (err) {
    throw new Error(`Package uninstall failed: ${err.stderr || err.message}`);
  }

  remove(name);

  audit('package_uninstall', name, { manager: useManager });
  log('info', 'packageManager', `Package uninstalled: ${name}`);

  return { name, manager: useManager };
}

function updateLastUsed(name) {
  const pkg = get(name);
  if (pkg) {
    pkg.last_used = new Date().toISOString();
    save();
    savePackage(pkg);
  }
}

function restore(packageRecords) {
  if (manifest.packages.length > 0) return;
  manifest.packages = packageRecords.filter((p) => p && p.name);
  save();
}

function cleanup() {
  const now = Date.now();
  const toRemove = [];

  for (const pkg of manifest.packages) {
    if (pkg.protected) continue;

    const lastUsed = new Date(pkg.last_used || pkg.installed_at).getTime();
    if (now - lastUsed > CLEANUP_TTL_MS) {
      toRemove.push(pkg);
    }
  }

  if (toRemove.length === 0) {
    return 0;
  }

  log('info', 'packageManager', `Cleaning up ${toRemove.length} stale packages`);

  let removed = 0;
  for (const pkg of toRemove) {
    try {
      // Run uninstall synchronously
      const { execSync } = require('child_process');
      let command;
      let args;

      switch (pkg.manager) {
        case 'apt':
          command = 'sudo';
          args = ['apt-get', 'remove', '-y', pkg.name];
          break;
        case 'pip':
          command = 'pip3';
          args = ['uninstall', '-y', pkg.name];
          break;
        case 'npm':
          command = 'npm';
          args = ['uninstall', '-g', pkg.name];
          break;
        case 'composer':
          command = 'composer';
          args = ['global', 'remove', pkg.name];
          break;
        default:
          continue;
      }

      execSync(`${command} ${args.join(' ')}`, {
        encoding: 'utf8',
        timeout: 60000,
        stdio: 'pipe',
      });

      remove(pkg.name);
      removed++;
      log('info', 'packageManager', `Cleaned up package: ${pkg.name}`);
    } catch (err) {
      log('warn', 'packageManager', `Failed to clean up ${pkg.name}: ${err.message}`);
    }
  }

  audit('package_cleanup', 'system', { removed });
  return removed;
}

function startCleanupCron() {
  if (cleanupInterval) return;

  cleanupInterval = setInterval(() => {
    const removed = cleanup();
    if (removed > 0) {
      log('info', 'packageManager', `Cleanup cron removed ${removed} packages`);
    }
  }, CLEANUP_INTERVAL_MS);
}

function stopCleanupCron() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

module.exports = {
  load,
  save,
  add,
  remove,
  get,
  list,
  isProtected,
  install,
  installAsync,
  uninstall,
  updateLastUsed,
  cleanup,
  startCleanupCron,
  stopCleanupCron,
  restore,
  getManifest: () => manifest,
  getInstallStatus,
};
