#!/usr/bin/env bash
#
# End-to-end smoke test. Exercises the full stack:
#   1. Register a user + org
#   2. Upload a document
#   3. Poll until ingestion completes
#   4. Ask a question via the streaming endpoint
#
# Requires the API to be running on http://localhost:4000.
# Usage: bash scripts/smoke.sh [path-to-file-to-upload]
#
set -euo pipefail

API_URL="${API_URL:-http://localhost:4000}"
FILE_PATH="${1:-README.md}"
EMAIL="smoke-$(date +%s)@test.local"
PASSWORD="password12345"
ORG="SmokeOrg-$(date +%s)"

echo "════════════════════════════════════════════════════"
echo " Aperture Smoke Test"
echo "════════════════════════════════════════════════════"
echo " API:      $API_URL"
echo " File:     $FILE_PATH"
echo " Email:    $EMAIL"
echo

# ── 1. Health ─────────────────────────────────────────────────────────
echo "▶ 1/5 Health check"
HEALTH=$(curl -fsS "$API_URL/health")
echo "   $HEALTH"
echo

# ── 2. Register ───────────────────────────────────────────────────────
echo "▶ 2/5 Register user"
REG=$(curl -fsS -X POST "$API_URL/api/v1/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"name\":\"Smoke Tester\",\"organizationName\":\"$ORG\"}")

TOKEN=$(echo "$REG" | grep -o '"token":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -z "$TOKEN" ]; then
  echo "   FAILED: no token in response"
  echo "   $REG"
  exit 1
fi
echo "   Got token (${#TOKEN} chars)"
echo

# ── 3. Upload ─────────────────────────────────────────────────────────
echo "▶ 3/5 Upload document"
UPLOAD=$(curl -fsS -X POST "$API_URL/api/v1/documents/upload" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@$FILE_PATH")

DOC_ID=$(echo "$UPLOAD" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -z "$DOC_ID" ]; then
  echo "   FAILED: no document id"
  echo "   $UPLOAD"
  exit 1
fi
echo "   Document ID: $DOC_ID"
echo

# ── 4. Poll for ready ─────────────────────────────────────────────────
echo "▶ 4/5 Wait for ingestion"
STATUS=""
for i in $(seq 1 30); do
  DOC=$(curl -fsS "$API_URL/api/v1/documents/$DOC_ID" \
    -H "Authorization: Bearer $TOKEN")
  STATUS=$(echo "$DOC" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
  echo "   [$i/30] status=$STATUS"
  if [ "$STATUS" = "ready" ]; then break; fi
  if [ "$STATUS" = "failed" ]; then
    echo "   FAILED: ingestion error"
    echo "   $DOC"
    exit 1
  fi
  sleep 1
done

if [ "$STATUS" != "ready" ]; then
  echo "   TIMEOUT: ingestion did not complete in 30s"
  exit 1
fi
echo

# ── 5. Chat ───────────────────────────────────────────────────────────
echo "▶ 5/5 Streaming chat"
echo "   Query: \"What is this document about?\""
echo "   (SSE response, first 40 lines):"
echo "   ─────────────────────────────────"

curl -fsS -N -X POST "$API_URL/api/v1/chat/stream" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"What is this document about?"}' \
  | head -40

echo
echo "   ─────────────────────────────────"
echo
echo "════════════════════════════════════════════════════"
echo " ✓ Smoke test passed"
echo "════════════════════════════════════════════════════"