#!/usr/bin/env bash
# Quick end-to-end test of a running RetailFlow. Prints PASS/FAIL for each check.
#   ./scripts/smoke.sh                              local (http://localhost:8080)
#   ./scripts/smoke.sh https://retailflow.<ip>.sslip.io   the cloud deployment
set -uo pipefail
BASE="${1:-http://localhost:8080}"
pass=0; fail=0
check() { if [ "$2" = "$3" ]; then echo "  PASS  $1"; pass=$((pass+1)); else echo "  FAIL  $1 (expected $3, got $2)"; fail=$((fail+1)); fi; }
code() { curl -sk -o /dev/null -w '%{http_code}' -X "$1" "$BASE$2" -H 'Content-Type: application/json' ${3:+-d "$3"}; }
field() { sed -n "s/.*\"$1\" *: *\"\{0,1\}\([^\",}]*\).*/\1/p" | head -1; }

echo "Testing $BASE"
for _ in $(seq 1 60); do [ "$(code GET /health)" = 200 ] && break; sleep 2; done

check "health check" "$(code GET /health)" 200
check "website loads" "$(code GET /)" 200
check "products list" "$(code GET /api/products)" 200
check "invalid product is rejected" "$(code POST /api/products '{"name":"x","price":-1,"stock":1}')" 400
ID=$(curl -sk -X POST "$BASE/api/products" -H 'Content-Type: application/json' -d '{"name":"Test monitor","price":9999.5,"stock":2}' | field id)
[ -n "$ID" ] && check "add a product" ok ok || check "add a product" missing ok
check "place an order" "$(code POST /api/orders "{\"productId\":$ID,\"quantity\":2}")" 201
check "order more than the stock is refused" "$(code POST /api/orders "{\"productId\":$ID,\"quantity\":1}")" 409
check "orders list" "$(code GET /api/orders)" 200

echo "Result: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
