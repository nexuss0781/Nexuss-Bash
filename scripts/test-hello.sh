#!/bin/bash
set -e

API="https://nexuss-bash.onrender.com"
KEY="nexuss-bash-prod-key-2026"
DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== Nexuss Bash - Upload & Execute Pipeline ==="

echo "1. Upload hello-world.yaml"
UPLOAD=$(curl -sf -X POST "$API/files/upload" \
  -H "Authorization: Bearer $KEY" \
  -F "file=@$DIR/examples/hello-world.yaml")
FILE_ID=$(echo "$UPLOAD" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])")
echo "   File ID: $FILE_ID"

echo "2. Execute pipeline from uploaded file"
RESP=$(curl -sf -X POST "$API/pipelines" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d "{\"file_id\": \"$FILE_ID\"}")
PIPE_ID=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])")
echo "   Pipeline ID: $PIPE_ID"

echo "3. Waiting for completion..."
for i in $(seq 1 30); do
  sleep 2
  S=$(curl -sf "$API/pipelines/$PIPE_ID" -H "Authorization: Bearer $KEY" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['status'])")
  if [ "$S" = "completed" ] || [ "$S" = "failed" ]; then
    break
  fi
  echo "   Status: $S..."
done

echo "4. Results:"
curl -sf "$API/pipelines/$PIPE_ID" -H "Authorization: Bearer $KEY" | python3 -c "
import sys,json
d=json.load(sys.stdin)['data']
print(f\"Pipeline: {d['id']} | Status: {d['status']} | Duration: {d.get('duration_ms', '?')}ms\")
for s in d['steps']:
    tag = 'PASS' if s['status']=='completed' else 'FAIL'
    print(f\"  {tag}: {s['id']}\")
    if s.get('stdout'):
        for line in s['stdout'].strip().split('\n'):
            print(f'    {line}')
    if s.get('stderr') and s['status'] != 'completed':
        for line in s['stderr'].strip().split('\n'):
            print(f'    ERR: {line}')
"
