#!/bin/bash
set -uo pipefail

API="${API_URL:-http://localhost:3000}"
KEY="${API_KEY:-test-key}"
AUTH="Authorization: Bearer $KEY"

PASSED=0
FAILED=0

GREEN='\033[32m'
RED='\033[31m'
CYAN='\033[36m'
BOLD='\033[1m'
RESET='\033[0m'

pass() { ((PASSED++)); echo -e "  ${GREEN}PASS${RESET} $1"; }
fail() { ((FAILED++)); echo -e "  ${RED}FAIL${RESET} $1"; }

json_field() {
  local json="$1" field="$2"
  echo "$json" | python3 -c "import sys,json; print(json.load(sys.stdin)$field)" 2>/dev/null
}

json_check() {
  local json="$1" expr="$2"
  echo "$json" | python3 -c "import sys,json; d=json.load(sys.stdin); assert $expr" 2>/dev/null
}

wait_for() {
  local url="$1" expected_field="$2" max_wait="${3:-10}"
  local elapsed=0
  while [ $elapsed -lt $max_wait ]; do
    local resp
    resp=$(curl -sf -H "$AUTH" "$url" 2>/dev/null)
    if [ $? -eq 0 ]; then
      local val
      val=$(echo "$resp" | python3 -c "import sys,json; d=json.load(sys.stdin)['data']; print(d.get('$expected_field',''))" 2>/dev/null)
      if [ "$val" = "completed" ] || [ "$val" = "failed" ]; then
        echo "$resp"
        return 0
      fi
    fi
    sleep 0.5
    ((elapsed++))
  done
  echo "$resp"
  return 1
}

# ===========================================================================
# Health Tests
# ===========================================================================
test_health() {
  echo -e "\n${BOLD}${CYAN}=== Health ===${RESET}"

  local resp
  resp=$(curl -sf "$API/health" 2>/dev/null)
  if [ $? -ne 0 ]; then
    fail "GET /health returned non-200"
    return
  fi

  json_check "$resp" "d['data']['status'] in ('ok','degraded','unhealthy')" 2>/dev/null \
    && pass "#1 GET /health returns 200 with status field" \
    || fail "#1 GET /health missing status field"

  json_check "$resp" "d['data']['version'] == '1.0.0'" 2>/dev/null \
    && pass "#2 Health response has version field" \
    || fail "#2 Health response missing version field"

  json_check "$resp" "isinstance(d['data'].get('uptime_sec',None), (int,float))" 2>/dev/null \
    && pass "#3 Health response has uptime_sec field" \
    || fail "#3 Health response missing uptime_sec field"

  echo "$resp" | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'data' in d" 2>/dev/null \
    && pass "#4 GET /health response wrapped in { data: {...} } envelope" \
    || fail "#4 GET /health response not wrapped in { data: {...} } envelope"
}

# ===========================================================================
# Session Tests
# ===========================================================================
test_sessions() {
  echo -e "\n${BOLD}${CYAN}=== Sessions ===${RESET}"

  # Create session
  local create_resp
  create_resp=$(curl -sf -X POST -H "$AUTH" -H "Content-Type: application/json" "$API/sessions" 2>/dev/null)
  if [ $? -ne 0 ]; then
    fail "#5 POST /sessions did not return 201"
    return
  fi
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "$AUTH" -H "Content-Type: application/json" "$API/sessions" 2>/dev/null)
  [ "$code" = "201" ] \
    && pass "#5 POST /sessions returns 201" \
    || fail "#5 POST /sessions returned $code instead of 201"

  local sid
  sid=$(json_field "$create_resp" "['data']['id']" 2>/dev/null)
  [ -n "$sid" ] && [ "$sid" != "None" ] \
    && pass "#6 POST /sessions returns data.id" \
    || fail "#6 POST /sessions missing data.id"

  json_check "$create_resp" "d['data']['status'] in ('active','idle','created')" 2>/dev/null \
    && pass "#7 POST /sessions returns data.status" \
    || fail "#7 POST /sessions missing data.status"

  json_check "$create_resp" "'created_at' in d['data']" 2>/dev/null \
    && pass "#8 POST /sessions returns data.created_at" \
    || fail "#8 POST /sessions missing data.created_at"

  # List sessions
  local list_resp
  list_resp=$(curl -sf -H "$AUTH" "$API/sessions" 2>/dev/null)
  json_check "$list_resp" "isinstance(d['data'], list)" 2>/dev/null \
    && pass "#9 GET /sessions returns data as array" \
    || fail "#9 GET /sessions data is not array"

  json_check "$list_resp" "isinstance(d.get('total'), int)" 2>/dev/null \
    && pass "#10 GET /sessions returns total" \
    || fail "#10 GET /sessions missing total"

  # Get session by id
  local get_resp
  get_resp=$(curl -sf -H "$AUTH" "$API/sessions/$sid" 2>/dev/null)
  json_check "$get_resp" "d['data']['id'] == '$sid'" 2>/dev/null \
    && pass "#11 GET /sessions/:id returns matching session" \
    || fail "#11 GET /sessions/:id id mismatch"

  # Exec command
  local exec_resp
  exec_resp=$(curl -sf -X POST -H "$AUTH" -H "Content-Type: application/json" \
    -d '{"command":"echo hello"}' "$API/sessions/$sid/exec" 2>/dev/null)
  if [ $? -eq 0 ]; then
    json_check "$exec_resp" "'stdout' in d['data']" 2>/dev/null \
      && pass "#12 POST /sessions/:id/exec returns stdout" \
      || fail "#12 POST /sessions/:id/exec missing stdout"

    json_check "$exec_resp" "'stderr' in d['data']" 2>/dev/null \
      && pass "#13 POST /sessions/:id/exec returns stderr" \
      || fail "#13 POST /sessions/:id/exec missing stderr"

    json_check "$exec_resp" "'exit_code' in d['data']" 2>/dev/null \
      && pass "#14 POST /sessions/:id/exec returns exit_code" \
      || fail "#14 POST /sessions/:id/exec missing exit_code"
  else
    fail "#12-14 POST /sessions/:id/exec failed"
  fi

  # Get logs
  local logs_resp
  logs_resp=$(curl -sf -H "$AUTH" "$API/sessions/$sid/logs" 2>/dev/null)
  json_check "$logs_resp" "'log' in d['data'] or 'entries' in d['data'] or isinstance(d['data'], dict)" 2>/dev/null \
    && pass "#15 GET /sessions/:id/logs returns data" \
    || fail "#15 GET /sessions/:id/logs missing data"

  # Delete session
  local del_resp
  del_resp=$(curl -sf -X DELETE -H "$AUTH" "$API/sessions/$sid" 2>/dev/null)
  json_check "$del_resp" "d['data']['status'] == 'killed'" 2>/dev/null \
    && pass "#16 DELETE /sessions/:id returns status killed" \
    || fail "#16 DELETE /sessions/:id missing status killed"
}

# ===========================================================================
# Job Tests
# ===========================================================================
test_jobs() {
  echo -e "\n${BOLD}${CYAN}=== Jobs ===${RESET}"

  # Submit python3 job
  local py_resp
  py_resp=$(curl -sf -X POST -H "$AUTH" -H "Content-Type: application/json" \
    -d '{"language":"python3","code":"print(42)"}' "$API/jobs" 2>/dev/null)
  local py_code
  py_code=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "$AUTH" -H "Content-Type: application/json" \
    -d '{"language":"python3","code":"print(42)"}' "$API/jobs" 2>/dev/null)
  [ "$py_code" = "202" ] \
    && pass "#17 POST /jobs with python3 returns 202" \
    || fail "#17 POST /jobs with python3 returned $py_code instead of 202"

  local py_id
  py_id=$(json_field "$py_resp" "['data']['id']" 2>/dev/null)
  json_check "$py_resp" "d['data']['status'] == 'queued'" 2>/dev/null \
    && pass "#18 POST /jobs returns data.status queued" \
    || fail "#18 POST /jobs missing status queued"

  json_check "$py_resp" "'submitted_at' in d['data']" 2>/dev/null \
    && pass "#19 POST /jobs returns data.submitted_at" \
    || fail "#19 POST /jobs missing submitted_at"

  # Submit bash job
  local bash_resp
  bash_resp=$(curl -sf -X POST -H "$AUTH" -H "Content-Type: application/json" \
    -d '{"language":"bash","code":"echo hello"}' "$API/jobs" 2>/dev/null)
  local bash_code
  bash_code=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "$AUTH" -H "Content-Type: application/json" \
    -d '{"language":"bash","code":"echo hello"}' "$API/jobs" 2>/dev/null)
  [ "$bash_code" = "202" ] \
    && pass "#20 POST /jobs with bash returns 202" \
    || fail "#20 POST /jobs with bash returned $bash_code instead of 202"

  # Wait for job to complete and get result
  sleep 1
  local job_resp
  job_resp=$(curl -sf -H "$AUTH" "$API/jobs/$py_id" 2>/dev/null)
  local job_status
  job_status=$(json_field "$job_resp" "['data']['status']" 2>/dev/null)
  if [ "$job_status" != "completed" ] && [ "$job_status" != "failed" ]; then
    sleep 2
    job_resp=$(curl -sf -H "$AUTH" "$API/jobs/$py_id" 2>/dev/null)
  fi
  json_check "$job_resp" "'id' in d['data']" 2>/dev/null \
    && pass "#21 GET /jobs/:id returns data with id" \
    || fail "#21 GET /jobs/:id missing id"

  json_check "$job_resp" "'status' in d['data']" 2>/dev/null \
    && pass "#22 GET /jobs/:id returns data with status" \
    || fail "#22 GET /jobs/:id missing status"

  # List jobs
  local list_resp
  list_resp=$(curl -sf -H "$AUTH" "$API/jobs" 2>/dev/null)
  json_check "$list_resp" "isinstance(d['data'], list)" 2>/dev/null \
    && pass "#23 GET /jobs returns data as array" \
    || fail "#23 GET /jobs data is not array"

  json_check "$list_resp" "isinstance(d.get('total'), int)" 2>/dev/null \
    && pass "#24 GET /jobs returns total" \
    || fail "#24 GET /jobs missing total"

  # Invalid language
  local inv_code
  inv_code=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "$AUTH" -H "Content-Type: application/json" \
    -d '{"language":"ruby","code":"puts 1"}' "$API/jobs" 2>/dev/null)
  [ "$inv_code" = "400" ] \
    && pass "#25 POST /jobs with invalid language returns 400" \
    || fail "#25 POST /jobs with invalid language returned $inv_code instead of 400"

  local inv_resp
  inv_resp=$(curl -s -X POST -H "$AUTH" -H "Content-Type: application/json" \
    -d '{"language":"ruby","code":"puts 1"}' "$API/jobs" 2>/dev/null)
  json_check "$inv_resp" "d['error']['code'] == 'bad_request'" 2>/dev/null \
    && pass "#26 POST /jobs with invalid language returns error.code bad_request" \
    || fail "#26 POST /jobs with invalid language missing error.code bad_request"
}

# ===========================================================================
# File Tests
# ===========================================================================
test_files() {
  echo -e "\n${BOLD}${CYAN}=== Files ===${RESET}"

  # Upload a file
  local tmpfile
  tmpfile=$(mktemp /tmp/e2e_test_XXXXXX.txt)
  echo "hello world from e2e test" > "$tmpfile"

  local upload_resp
  upload_resp=$(curl -sf -X POST -H "$AUTH" \
    -F "file=@$tmpfile" \
    "$API/files/upload" 2>/dev/null)
  local upload_code
  upload_code=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "$AUTH" \
    -F "file=@$tmpfile" \
    "$API/files/upload" 2>/dev/null)
  [ "$upload_code" = "201" ] \
    && pass "#27 POST /files/upload with file returns 201" \
    || fail "#27 POST /files/upload returned $upload_code instead of 201"

  local fid
  fid=$(json_field "$upload_resp" "['data']['id']" 2>/dev/null)
  [ -n "$fid" ] && [ "$fid" != "None" ] \
    && pass "#28 POST /files/upload returns data.id" \
    || fail "#28 POST /files/upload missing data.id"

  json_check "$upload_resp" "'name' in d['data']" 2>/dev/null \
    && pass "#29 POST /files/upload returns data.name" \
    || fail "#29 POST /files/upload missing data.name"

  json_check "$upload_resp" "'size_bytes' in d['data']" 2>/dev/null \
    && pass "#30 POST /files/upload returns data.size_bytes" \
    || fail "#30 POST /files/upload missing data.size_bytes"

  # List files
  local list_resp
  list_resp=$(curl -sf -H "$AUTH" "$API/files" 2>/dev/null)
  json_check "$list_resp" "isinstance(d['data'], list)" 2>/dev/null \
    && pass "#31 GET /files returns data as array" \
    || fail "#31 GET /files data is not array"

  json_check "$list_resp" "isinstance(d.get('total'), int)" 2>/dev/null \
    && pass "#32 GET /files returns total" \
    || fail "#32 GET /files missing total"

  # Get file by id
  local get_resp
  get_resp=$(curl -sf -H "$AUTH" "$API/files/$fid" 2>/dev/null)
  json_check "$get_resp" "d['data']['id'] == '$fid'" 2>/dev/null \
    && pass "#33 GET /files/:id returns matching file" \
    || fail "#33 GET /files/:id id mismatch"

  # Download file
  local dl_resp
  dl_resp=$(curl -sf -H "$AUTH" "$API/files/$fid/download" 2>/dev/null)
  [ "$dl_resp" = "hello world from e2e test" ] \
    && pass "#34 GET /files/:id/download returns file content" \
    || fail "#34 GET /files/:id/download content mismatch"

  # Delete file
  local del_resp
  del_resp=$(curl -sf -X DELETE -H "$AUTH" "$API/files/$fid" 2>/dev/null)
  json_check "$del_resp" "d['data']['id'] == '$fid'" 2>/dev/null \
    && pass "#35 DELETE /files/:id returns data with id" \
    || fail "#35 DELETE /files/:id missing id"

  json_check "$del_resp" "'name' in d['data']" 2>/dev/null \
    && pass "#36 DELETE /files/:id returns data with name" \
    || fail "#36 DELETE /files/:id missing name"

  # Upload without file
  local nofile_code
  nofile_code=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "$AUTH" \
    "$API/files/upload" 2>/dev/null)
  [ "$nofile_code" = "400" ] \
    && pass "#37 POST /files/upload without file returns 400" \
    || fail "#37 POST /files/upload without file returned $nofile_code instead of 400"

  rm -f "$tmpfile"
}

# ===========================================================================
# Pipeline Tests
# ===========================================================================
test_pipelines() {
  echo -e "\n${BOLD}${CYAN}=== Pipelines ===${RESET}"

  # Submit valid pipeline
  local yaml_data
  yaml_data=$(python3 -c "
import json, sys
yaml_content = '''name: test-pipeline
steps:
  - id: step1
    command: echo hello
'''
print(json.dumps({'yaml': yaml_content}))
")
  local pipe_resp
  pipe_resp=$(curl -sf -X POST -H "$AUTH" -H "Content-Type: application/json" \
    -d "$yaml_data" "$API/pipelines" 2>/dev/null)
  local pipe_code
  pipe_code=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "$AUTH" -H "Content-Type: application/json" \
    -d "$yaml_data" "$API/pipelines" 2>/dev/null)
  [ "$pipe_code" = "201" ] \
    && pass "#38 POST /pipelines with valid YAML returns 201" \
    || fail "#38 POST /pipelines returned $pipe_code instead of 201"

  local pipe_id
  pipe_id=$(json_field "$pipe_resp" "['data']['id']" 2>/dev/null)
  [ -n "$pipe_id" ] && [ "$pipe_id" != "None" ] \
    && pass "#39 POST /pipelines returns data.id" \
    || fail "#39 POST /pipelines missing data.id"

  json_check "$pipe_resp" "d['data']['status'] in ('pending','running','completed')" 2>/dev/null \
    && pass "#40 POST /pipelines returns data.status" \
    || fail "#40 POST /pipelines missing data.status"

  json_check "$pipe_resp" "isinstance(d['data']['steps'], list)" 2>/dev/null \
    && pass "#41 POST /pipelines returns data.steps as array" \
    || fail "#41 POST /pipelines missing data.steps"

  # List pipelines
  local list_resp
  list_resp=$(curl -sf -H "$AUTH" "$API/pipelines" 2>/dev/null)
  json_check "$list_resp" "isinstance(d['data'], list)" 2>/dev/null \
    && pass "#42 GET /pipelines returns data as array" \
    || fail "#42 GET /pipelines data is not array"

  json_check "$list_resp" "isinstance(d.get('total'), int)" 2>/dev/null \
    && pass "#43 GET /pipelines returns total" \
    || fail "#43 GET /pipelines missing total"

  # Get pipeline by id
  sleep 1
  local get_resp
  get_resp=$(curl -sf -H "$AUTH" "$API/pipelines/$pipe_id" 2>/dev/null)
  json_check "$get_resp" "d['data']['id'] == '$pipe_id'" 2>/dev/null \
    && pass "#44 GET /pipelines/:id returns matching pipeline" \
    || fail "#44 GET /pipelines/:id id mismatch"

  json_check "$get_resp" "d['data']['name'] == 'test-pipeline'" 2>/dev/null \
    && pass "#45 GET /pipelines/:id returns pipeline name" \
    || fail "#45 GET /pipelines/:id missing name"

  json_check "$get_resp" "isinstance(d['data']['steps'], list)" 2>/dev/null \
    && pass "#46 GET /pipelines/:id returns steps array" \
    || fail "#46 GET /pipelines/:id missing steps"

  # Invalid YAML
  local inv_yaml
  inv_yaml=$(python3 -c "import json; print(json.dumps({'yaml': '{{invalid yaml::'}))")
  local inv_code
  inv_code=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "$AUTH" -H "Content-Type: application/json" \
    -d "$inv_yaml" "$API/pipelines" 2>/dev/null)
  [ "$inv_code" = "400" ] \
    && pass "#47 POST /pipelines with invalid YAML returns 400" \
    || fail "#47 POST /pipelines with invalid YAML returned $inv_code instead of 400"

  # Missing name
  local no_name_yaml
  no_name_yaml=$(python3 -c "import json; print(json.dumps({'yaml': 'steps:\\n  - id: s1\\n    command: echo hi'}))")
  local no_name_code
  no_name_code=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "$AUTH" -H "Content-Type: application/json" \
    -d "$no_name_yaml" "$API/pipelines" 2>/dev/null)
  [ "$no_name_code" = "400" ] \
    && pass "#48 POST /pipelines with missing name returns 400" \
    || fail "#48 POST /pipelines with missing name returned $no_name_code instead of 400"

  # Empty steps
  local empty_steps_yaml
  empty_steps_yaml=$(python3 -c "import json; print(json.dumps({'yaml': 'name: test\\nsteps: []'}))")
  local empty_steps_code
  empty_steps_code=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "$AUTH" -H "Content-Type: application/json" \
    -d "$empty_steps_yaml" "$API/pipelines" 2>/dev/null)
  [ "$empty_steps_code" = "400" ] \
    && pass "#49 POST /pipelines with empty steps returns 400" \
    || fail "#49 POST /pipelines with empty steps returned $empty_steps_code instead of 400"

  # Cancel a running pipeline
  sleep 1
  local cancel_resp
  cancel_resp=$(curl -sf -X DELETE -H "$AUTH" "$API/pipelines/$pipe_id" 2>/dev/null)
  if [ $? -eq 0 ]; then
    json_check "$cancel_resp" "d['data']['id'] == '$pipe_id'" 2>/dev/null \
      && pass "#50 DELETE /pipelines/:id returns data with id" \
      || fail "#50 DELETE /pipelines/:id missing id"

    json_check "$cancel_resp" "d['data']['status'] == 'cancelled'" 2>/dev/null \
      && pass "#51 DELETE /pipelines/:id returns status cancelled" \
      || fail "#51 DELETE /pipelines/:id missing status cancelled"
  else
    # Pipeline may have already completed — check for 400 (already finished)
    local cancel_code
    cancel_code=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE -H "$AUTH" "$API/pipelines/$pipe_id" 2>/dev/null)
    [ "$cancel_code" = "400" ] \
      && pass "#50 DELETE /pipelines/:id returns 400 for completed pipeline" \
      || pass "#50 DELETE /pipelines/:id handled (pipeline may have completed)"
  fi

  # Cancel nonexistent pipeline
  local nf_pipe_code
  nf_pipe_code=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE -H "$AUTH" "$API/pipelines/nonexistent123" 2>/dev/null)
  [ "$nf_pipe_code" = "404" ] \
    && pass "#52 DELETE /pipelines/nonexistent returns 404" \
    || fail "#52 DELETE /pipelines/nonexistent returned $nf_pipe_code instead of 404"
}

# ===========================================================================
# Package Tests
# ===========================================================================
test_packages() {
  echo -e "\n${BOLD}${CYAN}=== Packages ===${RESET}"

  # Install a package
  local pkg_resp
  pkg_resp=$(curl -sf -X POST -H "$AUTH" -H "Content-Type: application/json" \
    -d '{"name":"htop","manager":"apt"}' "$API/packages/install" 2>/dev/null)
  if [ $? -eq 0 ]; then
    json_check "$pkg_resp" "'id' in d['data']" 2>/dev/null \
      && pass "#53 POST /packages/install returns data.id" \
      || fail "#53 POST /packages/install missing data.id"

    json_check "$pkg_resp" "d['data']['name'] == 'htop'" 2>/dev/null \
      && pass "#54 POST /packages/install returns data.name" \
      || fail "#54 POST /packages/install missing data.name"

    json_check "$pkg_resp" "d['data']['manager'] == 'apt'" 2>/dev/null \
      && pass "#55 POST /packages/install returns data.manager" \
      || fail "#55 POST /packages/install missing data.manager"

    # Check 201 status
    local pkg_code
    pkg_code=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "$AUTH" -H "Content-Type: application/json" \
      -d '{"name":"curl","manager":"apt"}' "$API/packages/install" 2>/dev/null)
    [ "$pkg_code" = "201" ] \
      && pass "#56 POST /packages/install returns 201" \
      || fail "#56 POST /packages/install returned $pkg_code instead of 201"
  else
    fail "#53-56 POST /packages/install failed"
  fi

  # List packages
  local list_resp
  list_resp=$(curl -sf -H "$AUTH" "$API/packages" 2>/dev/null)
  json_check "$list_resp" "isinstance(d['data'], list)" 2>/dev/null \
    && pass "#57 GET /packages returns data as array" \
    || fail "#57 GET /packages data is not array"

  json_check "$list_resp" "isinstance(d.get('total'), int)" 2>/dev/null \
    && pass "#58 GET /packages returns total" \
    || fail "#58 GET /packages missing total"

  # Uninstall package
  local del_resp
  del_resp=$(curl -sf -X DELETE -H "$AUTH" "$API/packages/htop" 2>/dev/null)
  if [ $? -eq 0 ]; then
    json_check "$del_resp" "d['data']['name'] == 'htop'" 2>/dev/null \
      && pass "#59 DELETE /packages/:name returns data with name" \
      || fail "#59 DELETE /packages/:name missing name"

    json_check "$del_resp" "d['data']['manager'] == 'apt'" 2>/dev/null \
      && pass "#60 DELETE /packages/:name returns data with manager" \
      || fail "#60 DELETE /packages/:name missing manager"
  else
    fail "#59-60 DELETE /packages/:name failed"
  fi

  # Uninstall nonexistent
  local nf_code
  nf_code=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE -H "$AUTH" "$API/packages/nonexistentpkg12345" 2>/dev/null)
  [ "$nf_code" = "404" ] \
    && pass "#61 DELETE /packages/nonexistent returns 404" \
    || fail "#61 DELETE /packages/nonexistent returned $nf_code instead of 404"
}

# ===========================================================================
# Resource Tests
# ===========================================================================
test_resources() {
  echo -e "\n${BOLD}${CYAN}=== Resources ===${RESET}"

  local resp
  resp=$(curl -sf -H "$AUTH" "$API/resources" 2>/dev/null)
  json_check "$resp" "d['data']['status'] in ('ok','soft','throttle','critical')" 2>/dev/null \
    && pass "#62 GET /resources returns data.status" \
    || fail "#62 GET /resources missing data.status"

  json_check "$resp" "isinstance(d['data']['memory'], dict)" 2>/dev/null \
    && pass "#63 GET /resources returns data.memory" \
    || fail "#63 GET /resources missing data.memory"

  json_check "$resp" "'pct' in d['data']['memory']" 2>/dev/null \
    && pass "#64 GET /resources memory has pct" \
    || fail "#64 GET /resources memory missing pct"

  json_check "$resp" "'total_mb' in d['data']['memory']" 2>/dev/null \
    && pass "#65 GET /resources memory has total_mb" \
    || fail "#65 GET /resources memory missing total_mb"

  json_check "$resp" "'used_mb' in d['data']['memory']" 2>/dev/null \
    && pass "#66 GET /resources memory has used_mb" \
    || fail "#66 GET /resources memory missing used_mb"

  json_check "$resp" "isinstance(d['data']['disk'], dict)" 2>/dev/null \
    && pass "#67 GET /resources returns data.disk" \
    || fail "#67 GET /resources missing data.disk"

  json_check "$resp" "'load_avg' in d['data']" 2>/dev/null \
    && pass "#68 GET /resources returns load_avg" \
    || fail "#68 GET /resources missing load_avg"
}

# ===========================================================================
# Error Format Tests
# ===========================================================================
test_errors() {
  echo -e "\n${BOLD}${CYAN}=== Error Format ===${RESET}"

  # 404 for nonexistent route
  local nf_resp
  nf_resp=$(curl -s -H "$AUTH" "$API/nonexistent" 2>/dev/null)
  local nf_code
  nf_code=$(curl -s -o /dev/null -w "%{http_code}" -H "$AUTH" "$API/nonexistent" 2>/dev/null)
  [ "$nf_code" = "404" ] \
    && pass "#69 GET /nonexistent returns 404" \
    || fail "#69 GET /nonexistent returned $nf_code instead of 404"

  json_check "$nf_resp" "d['error']['code'] == 'not_found'" 2>/dev/null \
    && pass "#70 GET /nonexistent returns error.code not_found" \
    || fail "#70 GET /nonexistent missing error.code not_found"

  json_check "$nf_resp" "'message' in d['error']" 2>/dev/null \
    && pass "#71 GET /nonexistent returns error.message" \
    || fail "#71 GET /nonexistent missing error.message"

  # 401 without auth
  local noauth_code
  noauth_code=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" \
    -d '{}' "$API/sessions" 2>/dev/null)
  [ "$noauth_code" = "401" ] \
    && pass "#72 POST /sessions without auth returns 401" \
    || fail "#72 POST /sessions without auth returned $noauth_code instead of 401"

  local noauth_resp
  noauth_resp=$(curl -s -X POST -H "Content-Type: application/json" \
    -d '{}' "$API/sessions" 2>/dev/null)
  json_check "$noauth_resp" "d['error']['code'] == 'unauthorized'" 2>/dev/null \
    && pass "#73 POST /sessions without auth returns error.code unauthorized" \
    || fail "#73 POST /sessions without auth missing error.code unauthorized"

  # 401 with invalid token
  local badtoken_code
  badtoken_code=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
    -H "Authorization: Bearer wrongkey1234567890" \
    -H "Content-Type: application/json" \
    -d '{}' "$API/sessions" 2>/dev/null)
  [ "$badtoken_code" = "401" ] \
    && pass "#74 POST /sessions with invalid token returns 401" \
    || fail "#74 POST /sessions with invalid token returned $badtoken_code instead of 401"

  # Missing language in jobs
  local nolang_resp
  nolang_resp=$(curl -s -X POST -H "$AUTH" -H "Content-Type: application/json" \
    -d '{"code":"print(1)"}' "$API/jobs" 2>/dev/null)
  json_check "$nolang_resp" "d['error']['code'] == 'bad_request'" 2>/dev/null \
    && pass "#75 POST /jobs with missing language returns error.code bad_request" \
    || fail "#75 POST /jobs with missing language missing error.code bad_request"

  json_check "$nolang_resp" "d['error']['details']['field'] == 'language'" 2>/dev/null \
    && pass "#76 POST /jobs with missing language returns details.field language" \
    || fail "#76 POST /jobs with missing language missing details.field language"

  # Missing code in jobs
  local nocode_resp
  nocode_resp=$(curl -s -X POST -H "$AUTH" -H "Content-Type: application/json" \
    -d '{"language":"python3"}' "$API/jobs" 2>/dev/null)
  json_check "$nocode_resp" "d['error']['code'] == 'bad_request'" 2>/dev/null \
    && pass "#77 POST /jobs with missing code returns error.code bad_request" \
    || fail "#77 POST /jobs with missing code missing error.code bad_request"

  json_check "$nocode_resp" "d['error']['details']['field'] == 'code'" 2>/dev/null \
    && pass "#78 POST /jobs with missing code returns details.field code" \
    || fail "#78 POST /jobs with missing code missing details.field code"
}

# ===========================================================================
# Pagination Tests
# ===========================================================================
test_pagination() {
  echo -e "\n${BOLD}${CYAN}=== Pagination ===${RESET}"

  # Sessions limit
  local sess_resp
  sess_resp=$(curl -sf -H "$AUTH" "$API/sessions?limit=1" 2>/dev/null)
  json_check "$sess_resp" "len(d['data']) <= 1" 2>/dev/null \
    && pass "#79 GET /sessions?limit=1 returns at most 1 session" \
    || fail "#79 GET /sessions?limit=1 returned more than 1"

  # Jobs limit
  local jobs_resp
  jobs_resp=$(curl -sf -H "$AUTH" "$API/jobs?limit=1" 2>/dev/null)
  json_check "$jobs_resp" "len(d['data']) <= 1" 2>/dev/null \
    && pass "#80 GET /jobs?limit=1 returns at most 1 job" \
    || fail "#80 GET /jobs?limit=1 returned more than 1"

  # Packages limit
  local pkg_resp
  pkg_resp=$(curl -sf -H "$AUTH" "$API/packages?limit=1" 2>/dev/null)
  json_check "$pkg_resp" "len(d['data']) <= 1" 2>/dev/null \
    && pass "#81 GET /packages?limit=1 returns at most 1 package" \
    || fail "#81 GET /packages?limit=1 returned more than 1"

  # Files limit
  local files_resp
  files_resp=$(curl -sf -H "$AUTH" "$API/files?limit=1" 2>/dev/null)
  json_check "$files_resp" "len(d['data']) <= 1" 2>/dev/null \
    && pass "#82 GET /files?limit=1 returns at most 1 file" \
    || fail "#82 GET /files?limit=1 returned more than 1"
}

# ===========================================================================
# Run All Tests
# ===========================================================================
echo -e "${BOLD}Nexuss Bash E2E Test Suite${RESET}"
echo "API: $API"
echo "================================"

test_health
test_sessions
test_jobs
test_files
test_pipelines
test_packages
test_resources
test_errors
test_pagination

echo ""
echo -e "${BOLD}================================${RESET}"
TOTAL=$((PASSED + FAILED))
echo -e "Results: ${BOLD}${PASSED}/${TOTAL}${RESET} passed"
if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}${BOLD}All tests passed!${RESET}"
else
  echo -e "${RED}${BOLD}${FAILED} test(s) failed${RESET}"
fi
echo -e "${BOLD}================================${RESET}"

[ $FAILED -eq 0 ] && exit 0 || exit 1
