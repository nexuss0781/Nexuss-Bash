'use strict';

const fs = require('fs');
const path = require('path');
const { log } = require('../utils/logger');

const CGROUP_BASE = '/sys/fs/cgroup';

function cgroupPath(id) {
  return path.join(CGROUP_BASE, `nexuss-${id}`);
}

function isCgroupV2Available() {
  try {
    const mountInfo = fs.readFileSync('/proc/self/mountinfo', 'utf8');
    return mountInfo.includes('cgroup2');
  } catch {
    return false;
  }
}

function createCgroup(id, limits) {
  const dir = cgroupPath(id);

  if (!isCgroupV2Available()) {
    log('warn', 'isolation', 'cgroups v2 not available, using ulimit fallback only');
    return false;
  }

  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (err) {
    log('warn', 'isolation', `Failed to create cgroup directory: ${err.message}`);
    return false;
  }

  if (limits && limits.memory_mb) {
    const memoryMax = limits.memory_mb * 1024 * 1024;
    try {
      fs.writeFileSync(path.join(dir, 'memory.max'), String(memoryMax));
    } catch (err) {
      log('warn', 'isolation', `Failed to set memory.max: ${err.message}`);
    }
  }

  if (limits && limits.cpu_pct) {
    const period = 100000;
    const quota = Math.floor((limits.cpu_pct / 100) * period);
    try {
      fs.writeFileSync(path.join(dir, 'cpu.max'), `${quota} ${period}`);
    } catch (err) {
      log('warn', 'isolation', `Failed to set cpu.max: ${err.message}`);
    }
  }

  return true;
}

function assignPidToCgroup(id, pid) {
  const procsPath = path.join(cgroupPath(id), 'cgroup.procs');
  try {
    fs.writeFileSync(procsPath, String(pid));
    return true;
  } catch (err) {
    log('warn', 'isolation', `Failed to assign PID to cgroup: ${err.message}`);
    return false;
  }
}

function destroyCgroup(id) {
  const dir = cgroupPath(id);
  try {
    if (fs.existsSync(dir)) {
      const procsPath = path.join(dir, 'cgroup.procs');
      if (fs.existsSync(procsPath)) {
        const procs = fs.readFileSync(procsPath, 'utf8').trim().split('\n').filter(Boolean);
        for (const pid of procs) {
          try {
            process.kill(Number(pid), 'SIGKILL');
          } catch {
            // Process may already be dead
          }
        }
      }

      const files = fs.readdirSync(dir);
      for (const file of files) {
        try {
          fs.unlinkSync(path.join(dir, file));
        } catch {
          // Some files may be read-only
        }
      }

      fs.rmdirSync(dir);
      log('info', 'isolation', `Cgroup ${id} destroyed`);
    }
  } catch (err) {
    log('warn', 'isolation', `Failed to destroy cgroup: ${err.message}`);
  }
}

function buildUlimitArgs(limits) {
  const args = [];

  if (limits && limits.memory_mb) {
    const memoryKB = limits.memory_mb * 1024;
    args.push('-v', String(memoryKB));
  }

  if (limits && limits.disk_mb) {
    const diskKB = limits.disk_mb * 1024;
    args.push('-f', String(diskKB));
  }

  return args;
}

module.exports = {
  createCgroup,
  assignPidToCgroup,
  destroyCgroup,
  buildUlimitArgs,
  isCgroupV2Available,
  cgroupPath,
};
