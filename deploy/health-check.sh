#!/usr/bin/env bash
set -euo pipefail

#
# Ṣafwa LLM Server - health check
#
# Verifies the vLLM server is up and responding.
# Run this after launch.sh, once you see "Application startup complete" in the logs.
#
# Usage:
#   ./health-check.sh
#   ./health-check.sh 1.2.3.4   # check a remote instance

HOST="${1:-localhost}"
PORT=8000
URL="http://${HOST}:${PORT}"

echo "=== Ṣafwa LLM Server - Health Check ==="
echo "Endpoint: $URL"
echo ""

# 1. Check if the port is open
echo -n "Port check: "
if curl -s --connect-timeout 5 "${URL}/v1/models" >/dev/null 2>&1; then
  echo "OK"
else
  echo "FAIL (server not responding on port $PORT)"
  echo "Check: docker logs safwa-llm-server"
  exit 1
fi

# 2. List available models
echo ""
echo "Available models:"
curl -s "${URL}/v1/models" | python3 -m json.tool 2>/dev/null || curl -s "${URL}/v1/models"

# 3. Send a test classification request
echo ""
echo "Test classification request:"
TEST_RESPONSE=$(curl -s "${URL}/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "'$(curl -s ${URL}/v1/models | python3 -c "import sys,json; print(json.load(sys.stdin)['data'][0]['id'])" 2>/dev/null || echo "Ornith-1.5-9B")'",
    "messages": [
      {"role": "system", "content": "You classify Dari/Persian Q&A comments. Respond with JSON: {\"classification\": \"duplicate\"} or {\"classification\": \"primary\"}."},
      {"role": "user", "content": "Recent questions:\n- \"آیا زکات بر طلا واجب است؟\"\n\nNew comment: \"آیا پرداخت زکات برای طلا لازم است؟\"\n\nIs this a duplicate? Respond with JSON."}
    ],
    "temperature": 0.0,
    "max_tokens": 64
  }')

echo "$TEST_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$TEST_RESPONSE"

echo ""
echo "Health check complete. If the test response contains classification: \"duplicate\","
  echo "the server is working correctly for the Ṣafwa combo pipeline."
