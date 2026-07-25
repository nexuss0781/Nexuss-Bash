#!/bin/bash
set -e

API="${API_URL:-https://nexuss-bash.onrender.com}"
KEY="${API_KEY:-nexuss-bash-prod-key-2026}"
DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== Nexuss Bash - One-Line Pipeline Run ==="

echo "Running hello-world.yaml..."
RESULT=$(curl -sf -X POST "$API/pipelines/run" \
  -H "Authorization: Bearer $KEY" \
  -F "file=@$DIR/examples/hello-world.yaml")

echo "$RESULT" | python3 -c "
import sys, json
d = json.load(sys.stdin)['data']
print(f\"Pipeline: {d['id']} | Status: {d['status']}\")
for s in d['steps']:
    tag = 'PASS' if s['status'] == 'completed' else 'FAIL'
    print(f\"  {tag}: {s['id']}\")
    if s.get('stdout'):
        for line in s['stdout'].strip().split('\n'):
            print(f'    {line}')
    if s.get('stderr') and s['status'] != 'completed':
        print(f'    ERR: {s[\"stderr\"][:200]}')
"
