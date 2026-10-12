#!/bin/bash
# ============================================
# Test: nginx security headers on all routes
# ============================================
# Verifies that security headers (X-Frame-Options, X-Content-Type-Options,
# X-XSS-Protection, Referrer-Policy) are present on all routes, including
# those with their own add_header directives.
#
# This test requires the nginx container to be running.
# Run: ./deploy/test/nginx-security-headers.test.sh

set -e

NGINX_URL="${NGINX_URL:-http://localhost:6969}"
REQUIRED_HEADERS=(
  "X-Frame-Options: SAMEORIGIN"
  "X-Content-Type-Options: nosniff"
  "X-XSS-Protection: 1; mode=block"
  "Referrer-Policy: strict-origin-when-cross-origin"
)

echo "Testing nginx security headers on $NGINX_URL"
echo "============================================"
echo ""

# Routes to test
ROUTES=(
  "/"
  "/manifest.webmanifest"
  "/registerSW.js"
  "/sw.js"
  "/sw-push.js"
  "/version.json"
  "/api/v1/salute"
  "/socket.io/"
)

FAILED=0
PASSED=0

for ROUTE in "${ROUTES[@]}"; do
  echo "Testing: $ROUTE"

  # Fetch headers (follow redirects for /)
  RESPONSE=$(curl -sI -L "$NGINX_URL$ROUTE" 2>&1 || echo "CURL_FAILED")

  if [[ "$RESPONSE" == "CURL_FAILED" ]]; then
    echo "  ❌ FAILED: Could not connect to $NGINX_URL$ROUTE"
    echo "     Make sure the nginx container is running."
    FAILED=$((FAILED + 1))
    echo ""
    continue
  fi

  ROUTE_FAILED=0
  for HEADER in "${REQUIRED_HEADERS[@]}"; do
    if echo "$RESPONSE" | grep -qi "^${HEADER}"; then
      echo "  ✓ $HEADER"
    else
      echo "  ❌ MISSING: $HEADER"
      ROUTE_FAILED=1
      FAILED=$((FAILED + 1))
    fi
  done

  if [ $ROUTE_FAILED -eq 0 ]; then
    PASSED=$((PASSED + 1))
  fi

  echo ""
done

echo "============================================"
echo "Results: $PASSED routes passed"
if [ $FAILED -gt 0 ]; then
  echo "         $FAILED checks failed"
  exit 1
else
  echo "All security headers are present on all routes ✓"
  exit 0
fi
