#!/usr/bin/env bash
set -euo pipefail
mkdir -p ci
cat > ci/nightly-2026-11-12.log <<'LOG'
nightly build 2026-11-12 01:00 UTC, main at 4f2c9e1
PASS tests/checkout.test.js (38 tests)
PASS tests/cart.test.js (52 tests)
FAIL tests/payment.test.js
  refund rounds to cents: expected 10.00, received 9.99
PASS tests/search.test.js (123 tests)
Result: FAILED (1 of 214 tests failed)
LOG
