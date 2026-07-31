#!/usr/bin/env bash
# Signs in a seeded demo account against the running dev server and writes a
# session cookie jar, so authenticated screens can be verified with curl.
#
# Auth.js credentials sign-in needs a CSRF token paired with its cookie, which is
# why this cannot be a one-liner. Reads the OTP from the notification log, exactly
# as the presenter will during the demo.
#
# Usage:  scripts/login.sh 0700000002 [jarfile]
# Then:   curl -s -b "$JAR" http://localhost:3005/fa/dashboard
set -euo pipefail

PHONE="${1:?usage: login.sh <phone> [jar]}"
JAR="${2:-/tmp/gulbahar-session-$PHONE.txt}"
BASE="${BASE_URL:-http://localhost:3005}"

rm -f "$JAR"

# 1. Request a code through the real server action path by calling requestOtp
#    directly — the action needs a request context, so use the script instead.
npx tsx -e "
import 'dotenv/config';
import { requestOtp } from './lib/auth/otp';
import { sql } from './lib/db';
requestOtp('$PHONE').then(async (r) => {
  if (!r.ok) { console.error('requestOtp failed:', r.error); process.exit(1); }
  await sql.end();
});
" >/dev/null 2>&1

# 2. Read the code out of the notification log.
# regexp_match extracts the group directly; regexp_replace with a lazy prefix
# does not behave as expected here and leaves the rest of the sentence attached.
# The body may be Dari or English depending on the recipient's locale, so match on
# the digits rather than on any surrounding words.
CODE=$(docker exec gulbahar-postgres psql -U gulbahar -d gulbahar -tAc \
  "select (regexp_match(body, '([0-9]{6})'))[1] from notifications
   where event_key = 'otp' order by created_at desc limit 1;" | tr -d '[:space:]')

if ! [[ "$CODE" =~ ^[0-9]{6}$ ]]; then
  echo "could not read a 6-digit OTP from the log (got: '$CODE')" >&2
  exit 1
fi

# 3. CSRF token, saving its cookie into the jar.
#
# Retried, because `next dev` restarts itself when it approaches its memory
# threshold — routine during a check that walks thirty pages — and an in-flight
# request during that window comes back empty. Without the retry that surfaces
# as a python JSONDecodeError traceback from inside a shell script, which names
# neither the server nor the check that was running.
CSRF=""
for attempt in 1 2 3 4; do
  RESPONSE=$(curl -s --max-time 30 -c "$JAR" "$BASE/api/auth/csrf" || true)
  CSRF=$(printf '%s' "$RESPONSE" | python3 -c 'import json,sys
try:
    print(json.load(sys.stdin)["csrfToken"])
except Exception:
    pass' 2>/dev/null || true)
  [ -n "$CSRF" ] && break
  sleep "$attempt"
done

if [ -z "$CSRF" ]; then
  echo "no CSRF token from $BASE — is the dev server up?" >&2
  exit 1
fi

# 4. Exchange phone + code for a session. The path carries the PROVIDER ID, which
#    is "otp" here, not "credentials" — the generic path 302s to
#    ?error=Configuration with "Provider with id credentials not found".
curl -s -o /dev/null -b "$JAR" -c "$JAR" \
  -X POST "$BASE/api/auth/callback/otp" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode "csrfToken=$CSRF" \
  --data-urlencode "phone=$PHONE" \
  --data-urlencode "code=$CODE" \
  --data-urlencode "redirect=false" \
  --data-urlencode "callbackUrl=$BASE/fa"

# 5. Confirm the session actually exists.
USERJSON=$(curl -s -b "$JAR" "$BASE/api/auth/session")
if ! echo "$USERJSON" | grep -q '"role"'; then
  echo "sign-in did not establish a session. response: $USERJSON" >&2
  exit 1
fi

echo "$JAR"
