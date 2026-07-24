'use strict';

const fs = require('fs');
const path = require('path');
const { spawnProcess } = require('../sandbox/processLauncher');
const { generateJobId, generatePackageId } = require('../utils/id');
const { log, audit } = require('../utils/logger');
const config = require('../config');

const MANIFEST_PATH = path.join(__dirname, '..', '..', 'data', 'packages.json');
const CLEANUP_INTERVAL_MS = config.CLEANUP_INTERVAL_MIN * 60 * 1000;
const CLEANUP_TTL_MS = config.CLEANUP_TTL_HOURS * 60 * 60 * 1000;

let manifest = { packages: [] };
let cleanupInterval = null;

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
  return entry;
}

function remove(name) {
  const idx = manifest.packages.findIndex((p) => p.name === name);
  if (idx === -1) {
    throw new Error(`Package not found: ${name}`);
  }

  const removed = manifest.packages.splice(idx, 1)[0];
  save();
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

async function install(name, manager) {
  if (!name || name.length === 0) {
    throw new Error('Package name cannot be empty');
  }

  const supportedManagers = ['apt', 'pip', 'npm', 'composer'];
  if (!supportedManagers.includes(manager)) {
    throw new Error(`Unsupported manager: ${manager}. Supported: ${supportedManagers.join(', ')}`);
  }

  log('info', 'packageManager', `Installing ${name} via ${manager}`);

  let command;
  let args;

  switch (manager) {
    case 'apt':
      command = 'sudo';
      args = ['apt-get', 'install', '-y', name];
      break;
    case 'pip':
      command = 'pip3';
      args = ['install', name];
      break;
    case 'npm':
      command = 'npm';
      args = ['install', '-g', name];
      break;
    case 'composer':
      command = 'composer';
      args = ['global', 'require', name];
      break;
  }

  const id = generateJobId();
  const result = await spawnProcess({
    id: `pkg-${id}`,
    command,
    args,
    cwd: '/tmp',
    timeout_ms: 300000, // 5 minutes for package install
  });

  if (result.exit_code !== 0) {
    throw new Error(`Package install failed: ${result.stderr}`);
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
  let command;
  let args;

  switch (useManager) {
    case 'apt':
      command = 'sudo';
      args = ['apt-get', 'remove', '-y', name];
      break;
    case 'pip':
      command = 'pip3';
      args = ['uninstall', '-y', name];
      break;
    case 'npm':
      command = 'npm';
      args = ['uninstall', '-g', name];
      break;
    case 'composer':
      command = 'composer';
      args = ['global', 'remove', name];
      break;
    default:
      throw new Error(`Unsupported manager: ${useManager}`);
  }

  const id = generateJobId();
  await spawnProcess({
    id: `pkg-rm-${id}`,
    command,
    args,
    cwd: '/tmp',
    timeout_ms: 60000,
  });

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
  }
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
  uninstall,
  updateLastUsed,
  cleanup,
  startCleanupCron,
  stopCleanupCron,
  getManifest: () => manifest,
};
