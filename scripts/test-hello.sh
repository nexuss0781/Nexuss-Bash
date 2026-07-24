#!/bin/bash
set -e

API="https://nexuss-bash.onrender.com"
KEY="nexuss-bash-prod-key-2026"

echo "1. Push hello-world.yaml to GitHub"
cd /home/nexuss0781/Desktop/Nex/Nexuss-Bash
git add examples/hello-world.yaml
git commit -m "hello world" || true
git push

echo "2. Clone fresh copy"
rm -rf /tmp/nexuss-clone
git clone https://github.com/nexuss0781/Nexuss-Bash.git /tmp/nexuss-clone

echo "3. Execute pipeline from cloned repo"
YAML=$(cat /tmp/nexuss-clone/examples/hello-world.yaml)
RESP=$(curl -sf -X POST "$API/pipelines" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d "{\"yaml\": $(echo "$YAML" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))')}")

ID=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])")
echo "Pipeline: $ID"

echo "4. Waiting..."
for i in $(seq 1 30); do
  sleep 2
  S=$(curl -sf "$API/pipelines/$ID" -H "Authorization: Bearer $KEY" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['status'])")
  [ "$S" = "completed" ] || [ "$S" = "failed" ] && break
done

echo "5. Results:"
curl -sf "$API/pipelines/$ID" -H "Authorization: Bearer $KEY" | python3 -c "
import sys,json
d=json.load(sys.stdin)['data']
for s in d['steps']:
    print(('PASS' if s['status']=='completed' else 'FAIL'), s['id'])
    if s.get('stdout'): print('   ', s['stdout'].strip())
"
