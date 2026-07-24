# Nexuss Bash - Gate Test Specification

**Source:** Phase.md + Architecture.md
**Purpose:** QA gate tests that must pass before advancing to next phase
**Rule:** No phase starts until its gate passes

---

## Gate 0: Scaffolding

**Prerequisite:** None
**Unlocks:** Phase 1

### G0.1 - Docker Build

```bash
docker build -t nexuss-bash .
```

| Test ID | Test | Expected | How to Verify |
|---|---|---|---|
| G0.1.1 | Docker build completes without error | Exit code 0 | `docker build` returns success |
| G0.1.2 | Image size under 1.5GB | Size < 1.5GB | `docker images nexuss-bash` |
| G0.1.3 | No warnings about missing files | Zero warnings | Review build output |

### G0.2 - Container Start

```bash
docker run -d -p 3000:3000 --name nexuss-test nexuss-bash
```

| Test ID | Test | Expected | How to Verify |
|---|---|---|---|
| G0.2.1 | Container starts and stays running | Status "running" | `docker ps` shows status up |
| G0.2.2 | Container does not restart loop | Restarts = 0 | `docker inspect` RestartCount = 0 |
| G0.2.3 | Logs show no crash errors | No stack traces | `docker logs nexuss-test` |

### G0.3 - Health Endpoint

| Test ID | Test | Expected | How to Verify |
|---|---|---|---|
| G0.3.1 | GET /health returns 200 | HTTP 200 | `curl -s -o /dev/null -w '%{http_code}' localhost:3000/health` |
| G0.3.2 | Response body is valid JSON | Valid JSON | `curl -s localhost:3000/health \| python3 -m json.tool` |
| G0.3.3 | Response contains "status":"ok" | Status field exists | Parse JSON, check `status === "ok"` |
| G0.3.4 | Response contains uptime_sec field | Uptime is number | Parse JSON, check `typeof uptime_sec === "number"` |

### G0.4 - Filesystem Layout

| Test ID | Test | Expected | How to Verify |
|---|---|---|---|
| G0.4.1 | /workspace/sessions/ exists | Directory exists | `docker exec nexuss-test ls -d /workspace/sessions` |
| G0.4.2 | /workspace/jobs/ exists | Directory exists | `docker exec nexuss-test ls -d /workspace/jobs` |
| G0.4.3 | /workspace/logs/ exists | Directory exists | `docker exec nexuss-test ls -d /workspace/logs` |
| G0.4.4 | /workspace/ owned by runner:runner | uid=1000 gid=1000 | `docker exec nexuss-test stat -c '%U:%G' /workspace` |
| G0.4.5 | /workspace/sessions writable by runner | No permission denied | `docker exec --user runner nexuss-test touch /workspace/sessions/test` |
| G0.4.6 | /workspace/jobs writable by runner | No permission denied | `docker exec --user runner nexuss-test touch /workspace/jobs/test` |
| G0.4.7 | /workspace/logs writable by runner | No permission denied | `docker exec --user runner nexuss-test touch /workspace/logs/test` |

### G0.5 - Runner User

| Test ID | Test | Expected | How to Verify |
|---|---|---|---|
| G0.5.1 | runner user exists | User exists | `docker exec nexuss-test id runner` returns uid=1000 |
| G0.5.2 | runner has bash shell | /bin/bash | `docker exec nexuss-test getent passwd runner` |
| G0.5.3 | runner has home dir | /home/runner exists | `docker exec nexuss-test ls -d /home/runner` |

### G0.6 - Project Structure

| Test ID | Test | Expected | How to Verify |
|---|---|---|---|
| G0.6.1 | server.js exists in /app | File exists | `docker exec nexuss-test ls /app/server.js` |
| G0.6.2 | package.json exists in /app | File exists | `docker exec nexuss-test ls /app/package.json` |
| G0.6.3 | Dockerfile exists in repo root | File exists | `ls Dockerfile` |
| G0.6.4 | .gitignore excludes node_modules | Pattern present | `grep node_modules .gitignore` |
| G0.6.5 | .gitignore excludes workspace/ | Pattern present | `grep workspace .gitignore` |

### Gate 0 Exit Criteria

ALL tests in G0.1 through G0.6 must pass. Zero failures permitted.

---

## Gate 1: Core Utilities

**Prerequisite:** Gate 0 passes
**Unlocks:** Phase 2

### G1.1 - Config Module

```bash
docker exec nexuss-test node -e "const c = require('/app/src/config'); console.log(JSON.stringify(c))"
```

| Test ID | Test | Expected | How to Verify |
|---|---|---|---|
| G1.1.1 | Config loads without error | No throw | Node require succeeds |
| G1.1.2 | Config has API_KEY field | String | Check `typeof config.API_KEY === 'string'` |
| G1.1.3 | Config has PORT with default 3000 | Number | `config.PORT === 3000` (or Render env) |
| G1.1.4 | Config has IDLE_SESSION_TIMEOUT_MIN default 30 | Number | `config.IDLE_SESSION_TIMEOUT_MIN === 30` |
| G1.1.5 | Config has EXEC_TIMEOUT_SEC default 30 | Number | `config.EXEC_TIMEOUT_SEC === 30` |
| G1.1.6 | Config has JOB_TIMEOUT_SEC default 300 | Number | `config.JOB_TIMEOUT_SEC === 300` |
| G1.1.7 | Config has MAX_OUTPUT_BYTES default 1048576 | Number | `config.MAX_OUTPUT_BYTES === 1048576` |
| G1.1.8 | Config has CLEANUP_INTERVAL_MIN default 60 | Number | `config.CLEANUP_INTERVAL_MIN === 60` |
| G1.1.9 | Config has CLEANUP_TTL_HOURS default 6 | Number | `config.CLEANUP_TTL_HOURS === 6` |
| G1.1.10 | Config has SESSION_CREATE_RATE default 10 | Number | `config.SESSION_CREATE_RATE === 10` |
| G1.1.11 | Config has JOB_SUBMIT_RATE default 20 | Number | `config.JOB_SUBMIT_RATE === 20` |
| G1.1.12 | Config has EXEC_RATE default 100 | Number | `config.EXEC_RATE === 100` |
| G1.1.13 | Config has MEMORY_LIMIT_MB default 440 | Number | `config.MEMORY_LIMIT_MB === 440` |
| G1.1.14 | Config has CPU_LIMIT_PCT default 80 | Number | `config.CPU_LIMIT_PCT === 80` |
| G1.1.15 | Config has DISK_LIMIT_MB default 9000 | Number | `config.DISK_LIMIT_MB === 9000` |
| G1.1.16 | Config has ENABLE_BWRAP default false | Boolean | `config.ENABLE_BWRAP === false` |
| G1.1.17 | Config is frozen (cannot add properties) | TypeError on write | `config.NEWProp = 1` throws TypeError |
| G1.1.18 | Config without API_KEY set throws | Error thrown | Unset API_KEY env, require config, expect throw |

### G1.2 - Logger Module

```bash
docker exec nexuss-test node -e "const l = require('/app/src/utils/logger'); l.log('info', 'test', 'hello')"
```

| Test ID | Test | Expected | How to Verify |
|---|---|---|---|
| G1.2.1 | Logger loads without error | No throw | Node require succeeds |
| G1.2.2 | log() outputs valid JSON to stdout | JSON line | Capture stdout, parse as JSON |
| G1.2.3 | Log entry has timestamp field | ISO string | Parse JSON, check `typeof timestamp === 'string'` |
| G1.2.4 | Log entry has level field | "info"/"warn"/"error" | Parse JSON, check level value |
| G1.2.5 | Log entry has category field | String | Parse JSON, check category exists |
| G1.2.6 | Log entry has message field | String | Parse JSON, check message exists |
| G1.2.7 | audit() appends to /app/data/audit.log | File grows | Call audit(), check file size increased |
| G1.2.8 | audit entry has timestamp | ISO string | Read audit.log last line, parse JSON |
| G1.2.9 | audit entry has action field | String | Parse audit line, check action exists |
| G1.2.10 | audit entry has resource_id field | String | Parse audit line, check resource_id exists |
| G1.2.11 | Multiple audit calls append (not overwrite) | File has N lines | Call audit() 5 times, count lines = 5 |

### G1.3 - ID Generator

```bash
docker exec nexuss-test node -e "const id = require('/app/src/utils/id'); console.log(id.generateSessionId()); console.log(id.generateJobId())"
```

| Test ID | Test | Expected | How to Verify |
|---|---|---|---|
| G1.3.1 | generateSessionId() returns string | String | `typeof result === 'string'` |
| G1.3.2 | Session ID starts with "sess_" | Prefix | `result.startsWith('sess_')` |
| G1.3.3 | Session ID is 13 chars total | Length 13 | `result.length === 13` (sess_ + 8 hex) |
| G1.3.4 | Session ID hex part is lowercase hex | Regex match | `/^sess_[0-9a-f]{8}$/.test(result)` |
| G1.3.5 | generateJobId() returns string | String | `typeof result === 'string'` |
| G1.3.6 | Job ID starts with "job_" | Prefix | `result.startsWith('job_')` |
| G1.3.7 | Job ID is 12 chars total | Length 12 | `result.length === 12` (job_ + 8 hex) |
| G1.3.8 | Job ID hex part is lowercase hex | Regex match | `/^job_[0-9a-f]{8}$/.test(result)` |
| G1.3.9 | 1000 generated session IDs are unique | Zero duplicates | Generate 1000, put in Set, size = 1000 |
| G1.3.10 | 1000 generated job IDs are unique | Zero duplicates | Generate 1000, put in Set, size = 1000 |

### Gate 1 Exit Criteria

ALL tests in G1.1 through G1.3 must pass. Zero failures permitted.

---

## Gate 2: ProcessLauncher

**Prerequisite:** Gate 1 passes
**Unlocks:** Phase 3 + Phase 4

### G2.1 - Basic Spawn

| Test ID | Test | Expected | How to Verify |
|---|---|---|---|
| G2.1.1 | Spawn "echo hello" returns exit code 0 | exit_code = 0 | Call ProcessLauncher.spawn, check result.exit_code |
| G2.1.2 | Spawn "echo hello" stdout contains "hello" | stdout = "hello\n" | Check result.stdout |
| G2.1.3 | Spawn "echo err >&2" stderr captured | stderr non-empty | Check result.stderr |
| G2.1.4 | Spawn duration_ms is positive number | duration_ms > 0 | Check result.duration_ms |
| G2.1.5 | Spawn returns within 5 seconds | Wall time < 5s | Time the call |

### G2.2 - User Isolation

| Test ID | Test | Expected | How to Verify |
|---|---|---|---|
| G2.2.1 | Spawned process runs as runner (uid 1000) | uid = 1000 | Spawn `id -u`, stdout = "1000" |
| G2.2.2 | Spawned process runs as runner (gid 1000) | gid = 1000 | Spawn `id -g`, stdout = "1000" |
| G2.2.3 | Spawned process is NOT root | uid != 0 | Spawn `whoami`, stdout != "root" |

### G2.3 - Cgroup Isolation

| Test ID | Test | Expected | How to Verify |
|---|---|---|---|
| G2.3.1 | Cgroup directory created at /sys/fs/cgroup/nexuss-{id} | Directory exists | Spawn process, check dir exists during execution |
| G2.3.2 | memory.max is set correctly | Value matches limits.memory_mb * 1024 * 1024 | Read cgroup memory.max during execution |
| G2.3.3 | Cgroup directory removed after process exits | Directory gone | Spawn process, wait for exit, check dir does not exist |
| G2.3.4 | Spawned PID is inside the cgroup | PID in cgroup.procs | Read cgroup.procs during execution |

### G2.4 - Ulimit Fallback

| Test ID | Test | Expected | How to Verify |
|---|---|---|---|
| G2.4.1 | With memory limit, process cannot exceed RLIMIT_AS | Allocation fails or OOM | Spawn process that tries to allocate over limit |
| G2.4.2 | With disk limit, process cannot write over RLIMIT_FSIZE | Write fails | Spawn `dd if=/dev/zero of=/workspace/jobs/test bs=1M count=200` with 100MB limit |

### G2.5 - Timeout

| Test ID | Test | Expected | How to Verify |
|---|---|---|---|
| G2.5.1 | Process killed after timeout expires | Process dead | Spawn `sleep 60` with 2s timeout, check exit after ~2s |
| G2.5.2 | Timeout returns exit_code != 0 | Non-zero exit | Check result.exit_code after timeout kill |
| G2.5.3 | SIGTERM sent first, then SIGKILL after 5s | Graceful then forced | Monitor process signals |
| G2.5.4 | Process killed within 7s of timeout (5s SIGKILL grace) | Dead within 7s | Time from spawn to death |
| G2.5.5 | Timeout does not kill parent Node process | Parent alive | Check Node process PID unchanged |

### G2.6 - Working Directory

| Test ID | Test | Expected | How to Verify |
|---|---|---|---|
| G2.6.1 | Spawned process cwd matches requested cwd | Correct cwd | Spawn `pwd` with custom cwd, verify stdout |
| G2.6.2 | Spawned process can read files in its cwd | Read succeeds | Create file in cwd, spawn `cat file`, verify stdout |
| G2.6.3 | Spawned process cannot access /app | Permission denied | Spawn `ls /app/server.js`, expect failure |

### G2.7 - Environment

| Test ID | Test | Expected | How to Verify |
|---|---|---|---|
| G2.7.1 | Custom env vars passed to spawned process | Var visible | Spawn with env {TEST_VAR: "hello"}, spawn `echo $TEST_VAR` |
| G2.7.2 | Default PATH available to spawned process | PATH set | Spawn `echo $PATH`, non-empty |

### Gate 2 Exit Criteria

ALL tests in G2.1 through G2.7 must pass. Zero failures permitted.

---

## Gate 3: Session Manager

**Prerequisite:** Gate 2 passes
**Unlocks:** Phase 7 (with Phase 4, 5, 6)

### G3.1 - Session Creation

| Test ID | Test | Expected | How to Verify |
|---|---|---|---|
| G3.1.1 | create() returns session object | Object with id, status, created_at | Check return shape |
| G3.1.2 | Session ID starts with "sess_" | Prefix match | `/^sess_[0-9a-f]{8}$/.test(id)` |
| G3.1.3 | Session status is "active" after creation | status = "active" | Check status field |
| G3.1.4 | Session has pid field (number > 0) | pid is positive integer | `typeof pid === 'number' && pid > 0` |
| G3.1.5 | Session has cwd field pointing to /workspace/sessions/{id} | Correct path | Check cwd field |
| G3.1.6 | Session created_at is ISO timestamp | Valid ISO | Parse with `new Date(created_at)` |
| G3.1.7 | /workspace/sessions/{id}/ directory exists | Directory exists | `ls -d /workspace/sessions/{id}` |
| G3.1.8 | /workspace/sessions/{id}/ owned by runner | uid=1000 | `stat -c '%U'` on directory |
| G3.1.9 | Session log file created at /workspace/logs/{id}.log | File exists | Check file exists |

### G3.2 - Session List

| Test ID | Test | Expected | How to Verify |
|---|---|---|---|
| G3.2.1 | list() returns array of sessions | Array | `Array.isArray(result)` |
| G3.2.2 | Empty when no sessions | Empty array | `result.length === 0` initially |
| G3.2.3 | Contains created session after create() | Length increases | Create session, list shows it |

### G3.3 - Session Get

| Test ID | Test | Expected | How to Verify |
|---|---|---|---|
| G3.3.1 | get(id) returns session object | Object | Check return is object |
| G3.3.2 | get(nonexistent_id) returns null | Null | Check returns null |
| G3.3.3 | get returns all session fields | Complete object | Check all expected fields present |

### G3.4 - Command Execution

| Test ID | Test | Expected | How to Verify |
|---|---|---|---|
| G3.4.1 | exec(session_id, "echo hi") returns stdout | stdout = "hi\n" | Check stdout field |
| G3.4.2 | exec returns exit_code 0 for success | exit_code = 0 | Check exit_code |
| G3.4.3 | exec returns exit_code non-zero for failure | exit_code != 0 | exec "exit 1", check exit_code |
| G3.4.4 | exec stderr captured | stderr non-empty | exec "echo err >&2", check stderr |
| G3.4.5 | exec updates last_active_at | Timestamp updated | Compare before/after |
| G3.4.6 | exec returns within EXEC_TIMEOUT_SEC | Time < timeout | Time the exec call |
| G3.4.7 | exec with empty command rejected | Error thrown | exec(""), expect error |
| G3.4.8 | exec with command > 64KB rejected | Error thrown | exec("a".repeat(65000)), expect error |
| G3.4.9 | Output truncated at MAX_OUTPUT_BYTES | Output capped | Spawn command producing > 1MB output |
| G3.4.10 | Exec on non-existent session throws | Error/404 | exec on bad ID, expect error |
| G3.4.11 | Exec on killed session throws | Error/409 | Kill session, then exec, expect error |
| G3.4.12 | Multi-line command works | Full output | exec "echo a\necho b", both lines in stdout |

### G3.5 - Log Retrieval

| Test ID | Test | Expected | How to Verify |
|---|---|---|---|
| G3.5.1 | getLogs(id) returns log content | String | Check typeof result === 'string' |
| G3.5.2 | Log contains exec output | Output in log | exec command, then getLogs, check content |
| G3.5.3 | getLogs with tail=N returns last N lines | N lines | exec several commands, tail=2, check line count |
| G3.5.4 | Log file on disk matches getLogs output | Same content | Compare getLogs result with `cat /workspace/logs/{id}.log` |
| G3.5.5 | Log available after session killed | Content persists | Kill session, getLogs still returns content |
| G3.5.6 | getLogs on non-existent session throws | Error/404 | getLogs bad ID, expect error |

### G3.6 - Session Close

| Test ID | Test | Expected | How to Verify |
|---|---|---|---|
| G3.6.1 | close(id) sets status to "killed" | status = "killed" | Check session status after close |
| G3.6.2 | close(id) kills pty process | PID no longer running | `kill -0 pid` fails |
| G3.6.3 | close(id) is idempotent | No error on second call | Close same session twice, no throw |
| G3.6.4 | close(nonexistent_id) throws | Error/404 | Close bad ID, expect error |
| G3.6.5 | Exec on closed session fails | Error/409 | Close, then exec, expect error |

### G3.7 - Idle Expiry

| Test ID | Test | Expected | How to Verify |
|---|---|---|---|
| G3.7.1 | Session active for < timeout not killed | Still active | Create session, wait 1s, check status |
| G3.7.2 | Session idle > IDLE_SESSION_TIMEOUT_MIN killed | status = "killed" | Set timeout to 1min, wait 61s, check killed |
| G3.7.3 | Exec resets idle timer | Session survives | Create session, exec at 50s mark (1min timeout), survives past 60s |
| G3.7.4 | Expired session's process is dead | PID gone | Check `kill -0 pid` fails after expiry |
| G3.7.5 | Expired session logged to audit log | Audit entry exists | Check audit.log for expiry entry |
| G3.7.6 | Sweep runs periodically | Detects expiry | Create session, wait, verify swept within 60s |

### G3.8 - State Machine

| Test ID | Test | Expected | How to Verify |
|---|---|---|---|
| G3.8.1 | New session starts as "creating" briefly | Transition visible | Monitor status during creation (may need instrumentation) |
| G3.8.2 | Session becomes "active" after pty spawn | status = "active" | Check after create returns |
| G3.8.3 | Exec on "active" session succeeds | No error | Exec command |
| G3.8.4 | Delete on "active" session transitions to "killed" | status = "killed" | Close session |
| G3.8.5 | No status transitions from "killed" | Stays "killed" | Close, then any operation, status still "killed" |

### Gate 3 Exit Criteria

ALL tests in G3.1 through G3.8 must pass. Zero failures permitted.

---

## Gate 4: Job Executor

**Prerequisite:** Gate 2 passes
**Unlocks:** Phase 7 (with Phase 3, 5, 6)

### G4.1 - Job Submission

| Test ID | Test | Expected | How to Verify |
|---|---|---|---|
| G4.1.1 | submit() returns job object | Object with id, status | Check return shape |
| G4.1.2 | Job ID starts with "job_" | Prefix match | `/^job_[0-9a-f]{8}$/.test(id)` |
| G4.1.3 | Job status is "queued" initially | status = "queued" | Check status field |
| G4.1.4 | submitted_at is ISO timestamp | Valid ISO | Parse with Date constructor |

### G4.2 - Job Execution

| Test ID | Test | Expected | How to Verify |
|---|---|---|---|
| G4.2.1 | Python job "print('hello')" stdout = "hello\n" | Correct output | Submit python3 job, poll until complete, check stdout |
| G4.2.2 | Node job "console.log('hi')" stdout = "hi\n" | Correct output | Submit node job, check stdout |
| G4.2.3 | Bash job "echo test" stdout = "test\n" | Correct output | Submit bash job, check stdout |
| G4.2.4 | PHP job "echo 'php';" stdout = "php" | Correct output | Submit php job, check stdout |
| G4.2.5 | Successful job exit_code = 0 | exit_code = 0 | Check completed job |
| G4.2.6 | Failed job exit_code != 0 | Non-zero | Submit invalid code, check exit_code |
| G4.2.7 | Failed job stderr contains error message | stderr non-empty | Submit bad python, check stderr |
| G4.2.8 | duration_ms is positive | > 0 | Check completed job |
| G4.2.9 | started_at is set when running | ISO timestamp | Check during/after execution |
| G4.2.10 | finished_at is set when completed | ISO timestamp | Check completed job |

### G4.3 - Job Polling

| Test ID | Test | Expected | How to Verify |
|---|---|---|---|
| G4.3.1 | get(id) returns job object | Object | Check return |
| G4.3.2 | get(nonexistent_id) returns null | Null | Check returns null |
| G4.3.3 | Queued job has no stdout/stderr in response | Fields absent or empty | Check queued job response |
| G4.3.4 | Running job has no stdout/stderr in response | Fields absent or empty | Check running job |
| G4.3.5 | Completed job has stdout in response | String present | Check completed job |
| G4.3.6 | Failed job has stderr in response | String present | Check failed job |
| G4.3.7 | Timed_out job has status "timed_out" | status = "timed_out" | Submit long job with short timeout |

### G4.4 - Job Timeout

| Test ID | Test | Expected | How to Verify |
|---|---|---|---|
| G4.4.1 | Job exceeding timeout_sec gets timed_out | status = "timed_out" | Submit sleep(60) with 2s timeout |
| G4.4.2 | Timed_out job has no stdout | stdout empty | Check timed_out job |
| G4.4.3 | Job process killed on timeout | PID dead | Check process does not exist |

### G4.5 - Job Cleanup

| Test ID | Test | Expected | How to Verify |
|---|---|---|---|
| G4.5.1 | /workspace/jobs/{id}/ exists during execution | Directory exists | Check while job running |
| G4.5.2 | /workspace/jobs/{id}/ deleted after completion | Directory gone | Check after completed job |
| G4.5.3 | /workspace/jobs/{id}/ deleted after failure | Directory gone | Check after failed job |
| G4.5.4 | /workspace/jobs/{id}/ deleted after timeout | Directory gone | Check after timed_out job |

### G4.6 - Job Limits

| Test ID | Test | Expected | How to Verify |
|---|---|---|---|
| G4.6.1 | Memory limit enforced | OOM or error | Submit job with 32MB limit doing large allocation |
| G4.6.2 | Disk limit enforced | Write fails | Submit job writing > limit |
| G4.6.3 | Invalid language rejected | Error | Submit with language "ruby" (unsupported) |
| G4.6.4 | Empty code rejected | Error | Submit with code "" |
| G4.6.5 | timeout_sec = 0 or negative rejected | Error | Submit with timeout_sec: -1 |

### Gate 4 Exit Criteria

ALL tests in G4.1 through G4.6 must pass. Zero failures permitted.

---

## Gate 5: Resource Manager

**Prerequisite:** Gate 1 passes
**Unlocks:** Phase 7 (with Phase 3, 4, 6)

### G5.1 - Polling

| Test ID | Test | Expected | How to Verify |
|---|---|---|---|
| G5.1.1 | start() begins polling loop | No error | Call start(), no exception |
| G5.1.2 | Snapshot updates every ~5s | Timestamps ~5s apart | Read snapshot at t=0 and t=6, check timestamp diff |
| G5.1.3 | getSnapshot() returns cached data | Object | Check return type |
| G5.1.4 | Snapshot has mem_pct field | Number 0-100 | `typeof mem_pct === 'number'` |
| G5.1.5 | Snapshot has disk_pct field | Number 0-100 | Check range |
| G5.1.6 | Snapshot has load_avg field | Array of 3 numbers | `Array.isArray(load_avg) && load_avg.length === 3` |
| G5.1.7 | Snapshot has timestamp field | ISO string | Parse as Date |

### G5.2 - Threshold Detection

| Test ID | Test | Expected | How to Verify |
|---|---|---|---|
| G5.2.1 | Below 70% = "ok" status | status = "ok" | Mock low usage, check getThresholdStatus() |
| G5.2.2 | 70-85% = "soft" status | status = "soft" | Mock medium usage |
| G5.2.3 | 85-95% = "throttle" status | status = "throttle" | Mock high usage |
| G5.2.4 | Above 95% = "hard" status | status = "hard" | Mock critical usage |
| G5.2.5 | Threshold triggers at exact boundary | Correct at 70.0, 85.0, 95.0 | Test exact values |

### G5.3 - Hard Threshold Action

| Test ID | Test | Expected | How to Verify |
|---|---|---|---|
| G5.3.1 | Hard threshold triggers cleanup callback | Callback called | Register mock callback, trigger hard, verify called |
| G5.3.2 | Hard threshold kills idle sessions oldest-first | Oldest killed first | Create 3 sessions, trigger hard, oldest gone |
| G5.3.3 | Active sessions not killed first | Active preserved | Create active + idle, trigger hard, active survives |
| G5.3.4 | Stops killing when below throttle threshold | Stops at 85% | Create many sessions, verify stops |

### G5.4 - Throttle Response

| Test ID | Test | Expected | How to Verify |
|---|---|---|---|
| G5.4.1 | isThrottled() returns true at 85%+ | Boolean | Mock usage, check flag |
| G5.4.2 | isThrottled() returns false below 85% | Boolean | Mock low usage |

### Gate 5 Exit Criteria

ALL tests in G5.1 through G5.4 must pass. Zero failures permitted.

---

## Gate 6: Package Manager

**Prerequisite:** Gate 1 passes (Gate 2 for install execution)
**Unlocks:** Phase 7 (with Phase 3, 4, 5)

### G6.1 - Manifest CRUD

| Test ID | Test | Expected | How to Verify |
|---|---|---|---|
| G6.1.1 | load() reads /app/data/packages.json | Object with packages array | Check return shape |
| G6.1.2 | load() returns empty array on fresh manifest | packages = [] | Empty file -> empty array |
| G6.1.3 | add() appends entry to manifest | Array length +1 | Add entry, reload, check length |
| G6.1.4 | add() entry has name, manager, installed_at, size_kb, protected | All fields | Check entry shape |
| G6.1.5 | remove() removes entry by name | Array length -1 | Remove entry, reload, check length |
| G6.1.6 | remove() nonexistent name throws | Error | Remove "fakepkg", expect error |
| G6.1.7 | get() returns entry by name | Entry object | Add entry, get by name |
| G6.1.8 | list() returns all entries | Array | Check all entries returned |
| G6.1.9 | save() persists to disk | File updated | Add entry, save, reload from disk |
| G6.1.10 | Manifest file is valid JSON after save | Parseable | `python3 -m json.tool` on file |

### G6.2 - Package Install

| Test ID | Test | Expected | How to Verify |
|---|---|---|---|
| G6.2.1 | install("curl", "apt") succeeds | No error | Install existing package |
| G6.2.2 | install("requests", "pip") succeeds | No error | pip install requests |
| G6.2.3 | install("lodash", "npm") succeeds | No error | npm install -g lodash |
| G6.2.4 | install() adds manifest entry | Entry present | Install, check manifest |
| G6.2.5 | install() records size_kb > 0 | Positive number | Check installed_at, size_kb |
| G6.2.6 | install() records installed_at timestamp | ISO string | Check timestamp |
| G6.2.7 | install() sets protected = false | false | Check entry |
| G6.2.8 | Package available to runner after install | Works | Install pip package, runner can import it |
| G6.2.9 | install() with unsupported manager throws | Error | install("x", "cargo"), expect error |
| G6.2.10 | install() with empty name throws | Error | install("", "pip"), expect error |

### G6.3 - Package Remove

| Test ID | Test | Expected | How to Verify |
|---|---|---|---|
| G6.3.1 | remove("requests", "pip") succeeds | No error | Remove installed package |
| G6.3.2 | remove() deletes manifest entry | Entry gone | Remove, check manifest |
| G6.3.3 | Package unavailable after remove | Import fails | Remove pip package, import throws |
| G6.3.4 | remove() on nonexistent package throws | Error | Remove "fakepkg", expect error |

### G6.4 - Protected Packages

| Test ID | Test | Expected | How to Verify |
|---|---|---|---|
| G6.4.1 | Protected packages have protected=true | true | Check built-in package entries |
| G6.4.2 | remove() on protected package throws | Error | Try remove "build-essential" |
| G6.4.3 | Cleanup never removes protected packages | Still present | Run cleanup, protected still in manifest |

### G6.5 - Cleanup Cron

| Test ID | Test | Expected | How to Verify |
|---|---|---|---|
| G6.5.1 | Package unused < TTL not removed | Still present | Install, don't use, run cleanup immediately |
| G6.5.2 | Package unused > TTL removed | Gone | Install, mock last_used to 7h ago, run cleanup |
| G6.5.3 | Recently used package not removed | Present | Install, exec command using it, run cleanup |
| G6.5.4 | Cleanup logs action to audit | Audit entry | Run cleanup, check audit.log |
| G6.5.5 | Cleanup removes manifest entry | Entry gone | Check manifest after cleanup |

### G6.6 - Sudoers

| Test ID | Test | Expected | How to Verify |
|---|---|---|---|
| G6.6.1 | runner can sudo apt-get install -y | Success | `sudo apt-get install -y curl` as runner |
| G6.6.2 | runner can sudo apt-get remove -y | Success | `sudo apt-get remove -y curl` as runner |
| G6.6.3 | runner can sudo apt-get update | Success | `sudo apt-get update` as runner |
| G6.6.4 | runner CANNOT sudo arbitrary command | Deny | `sudo ls /root` as runner, expect deny |

### Gate 6 Exit Criteria

ALL tests in G6.1 through G6.6 must pass. Zero failures permitted.

---

## Gate 7: API Routes

**Prerequisite:** Gates 3, 4, 5, 6 all pass
**Unlocks:** Phase 8

### G7.1 - Auth Middleware

| Test ID | Test | Expected | How to Verify |
|---|---|---|---|
| G7.1.1 | GET /health works without auth | 200 | `curl localhost:3000/health` |
| G7.1.2 | POST /sessions without auth returns 401 | 401 | `curl -X POST localhost:3000/sessions` |
| G7.1.3 | POST /sessions with wrong key returns 401 | 401 | `curl -H "Authorization: Bearer wrong" -X POST` |
| G7.1.4 | POST /sessions with correct key works | 201 | `curl -H "Authorization: Bearer $API_KEY" -X POST` |
| G7.1.5 | GET /sessions requires auth | 401 without key | Check |
| G7.1.6 | GET /sessions with auth works | 200 | Check |

### G7.2 - Rate Limiting

| Test ID | Test | Expected | How to Verify |
|---|---|---|---|
| G7.2.1 | Under rate limit: request succeeds | 200/201 | Send 9 POST /sessions within 1min |
| G7.2.2 | At rate limit: request rejected with 429 | 429 | Send 11th POST /sessions within 1min |
| G7.2.3 | Rate limit response has retry_after_sec | Number | Check 429 body |
| G7.2.4 | Rate limit resets after window | 200 again | Wait 61s, send request |
| G7.2.5 | Different endpoints have separate limits | Independent | Exhaust session limit, job limit still works |

### G7.3 - Session Routes

| Test ID | Test | Expected | How to Verify |
|---|---|---|---|
| G7.3.1 | POST /sessions returns 201 | 201 | `curl -X POST` with auth |
| G7.3.2 | POST /sessions response has session_id | String | Parse JSON, check field |
| G7.3.3 | POST /sessions response has status "active" | "active" | Check |
| G7.3.4 | GET /sessions returns 200 + array | 200, array | Check |
| G7.3.5 | GET /sessions/:id returns 200 + object | 200, object | Check |
| G7.3.6 | GET /sessions/:id nonexistent returns 404 | 404 | Check |
| G7.3.7 | POST /sessions/:id/exec with valid command returns 200 | 200 | exec "echo hi" |
| G7.3.8 | POST /sessions/:id/exec response has stdout, stderr, exit_code | All fields | Check |
| G7.3.9 | POST /sessions/:id/exec without auth returns 401 | 401 | Check |
| G7.3.10 | POST /sessions/:id/exec with empty body returns 400 | 400 | Check |
| G7.3.11 | POST /sessions/:id/exec with nonexistent session returns 404 | 404 | Check |
| G7.3.12 | GET /sessions/:id/logs returns 200 + log string | 200, string | Check |
| G7.3.13 | GET /sessions/:id/logs?tail=10 returns limited lines | Last 10 lines | Check |
| G7.3.14 | DELETE /sessions/:id returns 200 | 200 | Delete session |
| G7.3.15 | DELETE /sessions/:id nonexistent returns 404 | 404 | Check |
| G7.3.16 | DELETE /sessions/:id sets status to killed | killed | Check GET after delete |
| G7.3.17 | POST /exec on killed session returns 409 | 409 | Delete then exec |

### G7.4 - Job Routes

| Test ID | Test | Expected | How to Verify |
|---|---|---|---|
| G7.4.1 | POST /jobs returns 202 | 202 | Submit job with auth |
| G7.4.2 | POST /jobs response has job_id | String | Check |
| G7.4.3 | POST /jobs response has status "queued" | "queued" | Check |
| G7.4.4 | GET /jobs/:id returns 200 | 200 | Poll job |
| G7.4.5 | GET /jobs/:id queued shows no stdout | Empty/null | Check |
| G7.4.6 | GET /jobs/:id completed shows stdout | String | Wait for completion, check |
| G7.4.7 | GET /jobs/:id nonexistent returns 404 | 404 | Check |
| G7.4.8 | POST /jobs without auth returns 401 | 401 | Check |
| G7.4.9 | POST /jobs with invalid language returns 400 | 400 | Check |
| G7.4.10 | POST /jobs with empty code returns 400 | 400 | Check |

### G7.5 - Package Routes

| Test ID | Test | Expected | How to Verify |
|---|---|---|---|
| G7.5.1 | POST /packages/install returns 200 | 200 | Install package |
| G7.5.2 | POST /packages/install response has name, manager | Fields present | Check |
| G7.5.3 | GET /packages returns 200 + array | 200, array | Check |
| G7.5.4 | GET /packages includes newly installed | Entry present | Install then list |
| G7.5.5 | DELETE /packages/:name returns 200 | 200 | Remove package |
| G7.5.6 | DELETE /packages/:name removes from list | Gone | Delete then list |
| G7.5.7 | POST /packages/install without auth returns 401 | 401 | Check |
| G7.5.8 | POST /packages/install with invalid manager returns 400 | 400 | Check |

### G7.6 - Resource Routes

| Test ID | Test | Expected | How to Verify |
|---|---|---|---|
| G7.6.1 | GET /resources returns 200 | 200 | Check |
| G7.6.2 | Response has memory.total_mb, memory.used_mb, memory.pct | Fields | Check |
| G7.6.3 | Response has disk.total_mb, disk.used_mb, disk.pct | Fields | Check |
| G7.6.4 | Response has load_avg (array of 3) | Array | Check |
| G7.6.5 | Response has status field | "ok"/"soft"/"throttle" | Check |
| G7.6.6 | Response has sessions_active count | Number | Check |
| G7.6.7 | Response has jobs_running count | Number | Check |
| G7.6.8 | Requires auth | 401 | Check without key |

### G7.7 - Response Headers

| Test ID | Test | Expected | How to Verify |
|---|---|---|---|
| G7.7.1 | X-Resource-Mem header present | Number | Check response headers |
| G7.7.2 | X-Resource-Disk header present | Number | Check |
| G7.7.3 | X-Resource-Status header present | ok/soft/throttle | Check |

### G7.8 - Error Responses

| Test ID | Test | Expected | How to Verify |
|---|---|---|---|
| G7.8.1 | 401 response has { error, message } | JSON | Check body |
| G7.8.2 | 404 response has { error, message } | JSON | Check body |
| G7.8.3 | 400 response has { error, message } | JSON | Check body |
| G7.8.4 | 409 response has { error, message } | JSON | Check body |
| G7.8.5 | 429 response has { error, message, retry_after_sec } | JSON | Check body |
| G7.8.6 | 503 response has { error, message } | JSON | Check body |
| G7.8.7 | Error responses never contain stack traces | No stack | Check all error bodies |
| G7.8.8 | Error responses Content-Type is application/json | Header | Check headers |

### G7.9 - Audit Logging

| Test ID | Test | Expected | How to Verify |
|---|---|---|---|
| G7.9.1 | POST /sessions logged to audit.log | Entry exists | Check audit file |
| G7.9.2 | POST /exec logged with command | Entry has command | Check audit file |
| G7.9.3 | DELETE /sessions logged | Entry exists | Check |
| G7.9.4 | POST /jobs logged | Entry exists | Check |
| G7.9.5 | POST /packages/install logged | Entry exists | Check |
| G7.9.6 | Audit entries have timestamp | ISO string | Parse entry |
| G7.9.7 | Audit entries have action field | String | Check |
| G7.9.8 | Audit entries have resource_id | String | Check |

### G7.10 - Body Size Limits

| Test ID | Test | Expected | How to Verify |
|---|---|---|---|
| G7.10.1 | Request with 1MB body accepted | 200/201/202 | Send large valid body |
| G7.10.2 | Request with >1MB body rejected | 413 | Send 2MB body |

### Gate 7 Exit Criteria

ALL tests in G7.1 through G7.10 must pass. Zero failures permitted.

---

## Gate 8: Error Handling + Graceful Shutdown

**Prerequisite:** Gate 7 passes
**Unlocks:** Phase 9

### G8.1 - Global Error Handler

| Test ID | Test | Expected | How to Verify |
|---|---|---|---|
| G8.1.1 | Unhandled route returns 404 JSON | 404, JSON | `curl localhost:3000/nonexistent` |
| G8.1.2 | Malformed JSON body returns 400 | 400 | Send invalid JSON |
| G8.1.3 | Server error returns 500 JSON | 500, JSON | Trigger internal error |
| G8.1.4 | 500 response has error="internal_error" | Field matches | Check body |
| G8.1.5 | 500 response does not leak stack trace | No trace | Check body |
| G8.1.6 | 500 is logged to console with stack trace | Log present | Check container logs |

### G8.2 - Graceful Shutdown

| Test ID | Test | Expected | How to Verify |
|---|---|---|---|
| G8.2.1 | SIGTERM triggers graceful shutdown | Handler runs | `docker stop` container |
| G8.2.2 | Active sessions killed on SIGTERM | PTY processes dead | Start session, docker stop, check |
| G8.2.3 | Running jobs killed on SIGTERM | Job processes dead | Start job, docker stop, check |
| G8.2.4 | Audit log flushed before exit | Final entries present | Check audit.log after stop |
| G8.2.5 | Container exits with code 0 | ExitCode = 0 | `docker inspect` after stop |
| G8.2.6 | Shutdown completes within 15s | Time < 15s | Time `docker stop` |
| G8.2.7 | In-flight HTTP requests completed before shutdown | Responses sent | Send request during shutdown |

### G8.3 - Signal Handlers

| Test ID | Test | Expected | How to Verify |
|---|---|---|---|
| G8.3.1 | SIGINT triggers same cleanup as SIGTERM | Cleanup runs | Send SIGINT |
| G8.3.2 | SIGUSR1 does not crash server | Still running | Send SIGUSR1, check /health |

### G8.4 - Unhandled Rejections

| Test ID | Test | Expected | How to Verify |
|---|---|---|---|
| G8.4.1 | Unhandled promise rejection logged | Error in logs | Trigger unhandled rejection |
| G8.4.2 | Server stays running after unhandled rejection | Still alive | Check /health after |
| G8.4.3 | Uncaught exception logged | Error in logs | Trigger uncaught exception |
| G8.4.4 | Server stays running after uncaught exception (if recoverable) | Still alive | Check /health |

### Gate 8 Exit Criteria

ALL tests in G8.1 through G8.4 must pass. Zero failures permitted.

---

## Gate 9: Security Hardening

**Prerequisite:** Gate 7 passes
**Unlocks:** Phase 10

### G9.1 - Filesystem Permissions

| Test ID | Test | Expected | How to Verify |
|---|---|---|---|
| G9.1.1 | /app owned by root:root | root:root | `stat -c '%U:%G' /app` |
| G9.1.2 | /app not writable by runner | Permission denied | `docker exec --user runner touch /app/test` fails |
| G9.1.3 | /app/data/packages.json readable by runner | Read succeeds | `docker exec --user runner cat /app/data/packages.json` |
| G9.1.4 | /app/data/packages.json NOT writable by runner | Write denied | `docker exec --user runner touch /app/data/packages.json` fails |
| G9.1.5 | /workspace owned by runner:runner | runner:runner | Check ownership |
| G9.1.6 | /workspace writable by runner | Write succeeds | `docker exec --user runner touch /workspace/test` |
| G9.1.7 | /workspace/sessions writable by runner | Write succeeds | Check |
| G9.1.8 | /workspace/jobs writable by runner | Write succeeds | Check |
| G9.1.9 | /workspace/logs writable by runner | Write succeeds | Check |

### G9.2 - Sudoers Lockdown

| Test ID | Test | Expected | How to Verify |
|---|---|---|---|
| G9.2.1 | runner can sudo apt-get install -y * | Success | Test |
| G9.2.2 | runner can sudo apt-get remove -y * | Success | Test |
| G9.2.3 | runner can sudo apt-get update | Success | Test |
| G9.2.4 | runner CANNOT sudo ls | Denied | `sudo ls` as runner |
| G9.2.5 | runner CANNOT sudo bash | Denied | `sudo bash` as runner |
| G9.2.6 | runner CANNOT sudo rm -rf / | Denied | `sudo rm -rf /` as runner |
| G9.2.7 | runner CANNOT sudo systemctl | Denied | `sudo systemctl status` as runner |
| G9.2.8 | /etc/sudoers.d/nexuss-runner has mode 0440 | Permissions | `stat -c '%a' /etc/sudoers.d/nexuss-runner` |

### G9.3 - Body Size Limits

| Test ID | Test | Expected | How to Verify |
|---|---|---|---|
| G9.3.1 | POST /sessions with 1MB JSON body accepted | 201 | Send large valid body |
| G9.3.2 | POST /sessions with 2MB JSON body rejected | 413 | Send oversized body |
| G9.3.3 | POST /jobs with 1MB JSON body accepted | 202 | Send large valid body |
| G9.3.4 | POST /jobs with 2MB JSON body rejected | 413 | Send oversized body |

### G9.4 - Command Size Limits

| Test ID | Test | Expected | How to Verify |
|---|---|---|---|
| G9.4.1 | Exec command < 64KB accepted | 200 | Send 60KB command |
| G9.4.2 | Exec command > 64KB rejected | 400 | Send 70KB command |
| G9.4.3 | Exec command of exactly 64KB boundary | 200 or 400 | Test exact boundary |

### G9.5 - Process Isolation

| Test ID | Test | Expected | How to Verify |
|---|---|---|---|
| G9.5.1 | Session process cannot see /app contents | ls fails or empty | Spawn `ls /app` in session |
| G9.5.2 | Session A cannot read Session B files | Permission denied | Create files in A, try to read from B |
| G9.5.3 | Job cannot read session directories | Permission denied | Create session, try to read from job |
| G9.5.4 | All processes run as uid 1000 | uid=1000 | Check `id -u` in spawned processes |

### G9.6 - Network Isolation (if ENABLE_BWRAP=true)

| Test ID | Test | Expected | How to Verify |
|---|---|---|---|
| G9.6.1 | With bwrap enabled, outbound HTTP blocked | Connection fails | Spawn `curl http://example.com` |
| G9.6.2 | With bwrap disabled, outbound HTTP works | Connection succeeds | Spawn `curl http://example.com` |
| G9.6.3 | Localhost still reachable (if needed) | Works | Spawn `curl localhost:3000` |

### G9.7 - Input Validation

| Test ID | Test | Expected | How to Verify |
|---|---|---|---|
| G9.7.1 | POST /sessions with non-JSON body rejected | 400 | Send plain text |
| G9.7.2 | POST /jobs with missing language field | 400 | Send { code: "print(1)" } |
| G9.7.3 | POST /jobs with missing code field | 400 | Send { language: "python3" } |
| G9.7.4 | POST /jobs with unknown language | 400 | Send { language: "rust" } |
| G9.7.5 | POST /jobs with negative timeout_sec | 400 | Send timeout_sec: -5 |
| G9.7.6 | POST /packages/install with missing name | 400 | Send { manager: "pip" } |
| G9.7.7 | POST /packages/install with invalid manager | 400 | Send { name: "x", manager: "cargo" } |

### G9.8 - Timing Attack Resistance

| Test ID | Test | Expected | How to Verify |
|---|---|---|---|
| G9.8.1 | Auth uses constant-time comparison | crypto.timingSafeEqual | Code review: verify usage |
| G9.8.2 | Auth timing does not vary with key position | Consistent timing | Send requests with wrong key at different positions, measure |

### Gate 9 Exit Criteria

ALL tests in G9.1 through G9.8 must pass. Zero failures permitted.

---

## Gate 10: Deployment

**Prerequisite:** Gates 8 and 9 pass
**Unlocks:** Production

### G10.1 - Render Configuration

| Test ID | Test | Expected | How to Verify |
|---|---|---|---|
| G10.1.1 | render.yaml exists in repo root | File exists | `ls render.yaml` |
| G10.1.2 | render.yaml has type: web | Correct | Parse YAML |
| G10.1.3 | render.yaml has env: docker | Correct | Parse YAML |
| G10.1.4 | render.yaml has healthCheckPath: /health | Correct | Parse YAML |
| G10.1.5 | render.yaml has healthCheckPolicy: soft | Correct | Parse YAML |
| G10.1.6 | API_KEY env var marked sync: false | Not synced | Parse YAML |

### G10.2 - Keepalive Workflow

| Test ID | Test | Expected | How to Verify |
|---|---|---|---|
| G10.2.1 | .github/workflows/keepalive.yml exists | File exists | Check file |
| G10.2.2 | Cron schedule is "*/14 * * * *" | Every 14 min | Parse YAML |
| G10.2.3 | Workflow pings /health endpoint | curl command | Parse YAML steps |
| G10.2.4 | Workflow uses correct Render URL | URL present | Check URL in workflow |

### G10.3 - Live Health Check

| Test ID | Test | Expected | How to Verify |
|---|---|---|---|
| G10.3.1 | GET https://nexuss-bash.onrender.com/health returns 200 | 200 | curl from outside |
| G10.3.2 | Response JSON valid | Parseable | curl + json.tool |
| G10.3.3 | Response contains uptime_sec | Number | Parse |
| G10.3.4 | Response mem_pct < 100 | Valid | Parse |

### G10.4 - End-to-End Session Flow

| Test ID | Test | Expected | How to Verify |
|---|---|---|---|
| G10.4.1 | POST /sessions on Render | 201, session_id | curl with auth |
| G10.4.2 | POST /sessions/:id/exec "echo e2e" | 200, stdout="e2e\n" | curl |
| G10.4.3 | GET /sessions/:id/logs | 200, contains "e2e" | curl |
| G10.4.4 | DELETE /sessions/:id | 200 | curl |
| G10.4.5 | GET /sessions/:id shows killed | status=killed | curl |

### G10.5 - End-to-End Job Flow

| Test ID | Test | Expected | How to Verify |
|---|---|---|---|
| G10.5.1 | POST /jobs on Render | 202, job_id | curl |
| G10.5.2 | GET /jobs/:id polling until completed | status=completed | Poll with curl |
| G10.5.3 | Completed job has stdout | "hello" | curl |
| G10.5.4 | Job scratch dir cleaned up | Gone | Check workspace |

### G10.6 - End-to-End Package Flow

| Test ID | Test | Expected | How to Verify |
|---|---|---|---|
| G10.6.1 | POST /packages/install { name: "jq", manager: "apt" } | 200 | curl |
| G10.6.2 | GET /packages shows jq | Entry present | curl |
| G10.6.3 | POST /sessions/:id/exec "jq --version" | 200, stdout has version | curl |
| G10.6.4 | DELETE /packages/jq | 200 | curl |

### G10.7 - Keepalive Verification

| Test ID | Test | Expected | How to Verify |
|---|---|---|---|
| G10.7.1 | GitHub Actions workflow runs | Status "completed" | Check Actions tab |
| G10.7.2 | Workflow run succeeds (exit 0) | Success | Check Actions tab |
| G10.7.3 | Service stays alive for 30+ minutes without manual requests | Not spun down | Wait 30min, check /health |

### G10.8 - Deployment Robustness

| Test ID | Test | Expected | How to Verify |
|---|---|---|---|
| G10.8.1 | Container restarts cleanly (docker restart) | Health returns 200 | docker restart, curl health |
| G10.8.2 | After restart, no orphaned processes | Clean | `docker exec ps aux` |
| G10.8.3 | After restart, old sessions gone (expected) | Empty list | GET /sessions |
| G10.8.4 | Memory usage stable over 1 hour | No growth > 10% | Monitor /resources |

### Gate 10 Exit Criteria

ALL tests in G10.1 through G10.8 must pass. Zero failures permitted.

---

## Summary: Gate Pass/Fail Criteria

| Gate | Phase | Total Tests | Required Pass | Max Failures |
|---|---|---|---|---|
| G0 | Scaffolding | 23 | 23 | 0 |
| G1 | Core Utilities | 37 | 37 | 0 |
| G2 | ProcessLauncher | 20 | 20 | 0 |
| G3 | Session Manager | 39 | 39 | 0 |
| G4 | Job Executor | 23 | 23 | 0 |
| G5 | Resource Manager | 14 | 14 | 0 |
| G6 | Package Manager | 28 | 28 | 0 |
| G7 | API Routes | 53 | 53 | 0 |
| G8 | Error + Shutdown | 13 | 13 | 0 |
| G9 | Security | 28 | 28 | 0 |
| G10 | Deployment | 22 | 22 | 0 |
| **Total** | | **300** | **300** | **0** |

**Rule:** A phase is not started until its gate passes with 100% pass rate. No exceptions.

---

## Test Execution Order

```
Gate 0 (23 tests)
    |
    v
Gate 1 (37 tests)
    |
    v
Gate 2 (20 tests)
    |
    +--------------------+--------------------+
    |                                         |
    v                                         v
Gate 3 (39 tests)                    Gate 4 (23 tests)
    |                                         |
    +--------------------+--------------------+
    |
    v
Gate 5 (14 tests)  +  Gate 6 (28 tests)  [parallel]
    |
    v
Gate 7 (53 tests)
    |
    v
Gate 8 (13 tests)  +  Gate 9 (28 tests)  [parallel]
    |
    v
Gate 10 (22 tests)
    |
    v
PRODUCTION READY
```
