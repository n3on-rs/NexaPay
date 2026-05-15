#!/usr/bin/env bash
# End-to-end: two full KYC users → fund via pay-by-card → transfer → agent apply.
# Requires: docker with compose, curl, python3; Postgres from repo docker-compose (port 5433).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BC="${ROOT}/blockchain"
COMPOSE="${ROOT}/docker-compose.yml"
PORT="${NEXAPAY_PORT:-18080}"
BASE="http://127.0.0.1:${PORT}"
KYC_OTP="${KYC_DEV_OTP:-554433}"
SUF="$(python3 -c 'import time; print(int(time.time()*1000) % 100000000)')"
N8A="$(printf '%08d' "$SUF")"
N8B="$(printf '%08d' "$(((SUF + 137) % 100000000))")"
PHONE1="216${N8A}"
PHONE2="216${N8B}"
CIN1="E${SUF}A"
CIN2="F${SUF}B"
EMAIL1="e2e-a-${SUF}@nexapay.test"
EMAIL2="e2e-b-${SUF}@nexapay.test"
WORKDIR="$(mktemp -d)"
STATE="${WORKDIR}/state"
DATA="${WORKDIR}/data"
UP="${WORKDIR}/uploads"
export NEXAPAY_STATE_DIR="$STATE"
export NEXAPAY_CHAIN_DATA_DIR="$DATA"
export UPLOAD_BASE_PATH="$UP"
export NEXAPAY_PORT="$PORT"
export NEXAPAY_DATABASE_URL="${NEXAPAY_DATABASE_URL:-postgresql://nexapay:nexapay_secret@127.0.0.1:5433/nexapay}"
export KYC_DEV_OTP="$KYC_OTP"
export LIVENESS_MOCK_PASS=true
export APP_ENV=development
export AGENT_SCORER_INTERVAL_SECS=3
export NEXAPAY_ALLOW_LEGACY_REGISTER=false

log() { echo "[e2e] $*" >&2; }

need_bin() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing dependency: $1" >&2
    exit 1
  }
}

need_bin curl
need_bin python3

if docker compose -f "$COMPOSE" ps postgres 2>/dev/null | grep -q 'Up'; then
  log "Postgres container already running"
else
  log "Starting Postgres (docker compose)…"
  docker compose -f "$COMPOSE" up -d postgres
  for i in $(seq 1 40); do
    if docker compose -f "$COMPOSE" exec -T postgres pg_isready -U nexapay -d nexapay >/dev/null 2>&1; then
      break
    fi
    sleep 0.5
  done
fi

mkdir -p "$STATE" "$DATA" "$UP"
# Document placeholders (>1 KiB) for KYC upload checks
dd if=/dev/zero of="${WORKDIR}/doc.bin" bs=2048 count=1 status=none
cp "${WORKDIR}/doc.bin" "${WORKDIR}/cin_front.bin"
cp "${WORKDIR}/doc.bin" "${WORKDIR}/live.bin"

kyc_user() {
  local name="$1" phone="$2" email="$3" cin="$4"
  local sid resp
  resp="$(curl -sS -X POST "${BASE}/auth/register/init" \
    -H 'Content-Type: application/json' \
    -d "{\"full_name\":\"${name}\",\"phone\":\"${phone}\",\"email\":\"${email}\",\"password\":\"TestPass1\",\"date_of_birth\":\"1994-06-15\",\"cin_number\":\"${cin}\"}")"
  sid="$(echo "$resp" | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'session_id' in d, d; print(d['session_id'])")"
  log "init ok session=${sid} (${name})"

  resp="$(curl -sS -X POST "${BASE}/auth/register/verify-phone" \
    -H 'Content-Type: application/json' \
    -d "{\"session_id\":\"${sid}\",\"otp_code\":\"${KYC_OTP}\"}")"
  echo "$resp" | SESSION_ID="$sid" python3 -c "import os,sys,json; d=json.load(sys.stdin); assert d.get('session_id')==os.environ['SESSION_ID'], d"

  resp="$(curl -sS -X POST "${BASE}/auth/register/upload-documents" \
    -F "session_id=${sid}" \
    -F "address_line=1 Test St" \
    -F "governorate=Tunis" \
    -F "postal_code=1000" \
    -F "cin_front=@${WORKDIR}/doc.bin" \
    -F "cin_back=@${WORKDIR}/doc.bin" \
    -F "proof_of_address=@${WORKDIR}/doc.bin")"
  echo "$resp" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('next_step')=='liveness_check', d"

  local live_json
  live_json="$(curl -sS -X POST "${BASE}/auth/register/liveness" \
    -F "session_id=${sid}" \
    -F "liveness_video=@${WORKDIR}/live.bin;type=video/mp4" \
    -F "cin_front=@${WORKDIR}/cin_front.bin;type=image/jpeg")"
  echo "$live_json" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('status')=='APPROVED', d; print(d['address'])"
}

log "Building nexapay-node…"
(cd "$BC" && cargo build -q --bin nexapay-node)

log "Starting API (background)…"
(cd "$BC" && env NEXAPAY_DATABASE_URL="$NEXAPAY_DATABASE_URL" NEXAPAY_STATE_DIR="$NEXAPAY_STATE_DIR" \
  NEXAPAY_CHAIN_DATA_DIR="$NEXAPAY_CHAIN_DATA_DIR" NEXAPAY_PORT="$NEXAPAY_PORT" \
  KYC_DEV_OTP="$KYC_DEV_OTP" LIVENESS_MOCK_PASS=true APP_ENV=development \
  AGENT_SCORER_INTERVAL_SECS="$AGENT_SCORER_INTERVAL_SECS" UPLOAD_BASE_PATH="$UPLOAD_BASE_PATH" \
  NEXAPAY_ALLOW_LEGACY_REGISTER=false \
  ./target/debug/nexapay-node) &
PID=$!
trap 'kill $PID 2>/dev/null || true' EXIT

for i in $(seq 1 50); do
  if curl -sS -o /dev/null -w "%{http_code}" "${BASE}/chain/stats" | grep -q 200; then
    break
  fi
  sleep 0.2
done
log "API up at ${BASE}"

ADDR1="$(kyc_user "E2E Alice" "$PHONE1" "$EMAIL1" "$CIN1")"
log "User1 address=${ADDR1}"

ADDR2="$(kyc_user "E2E Bob" "$PHONE2" "$EMAIL2" "$CIN2")"
log "User2 address=${ADDR2}"

token_login() {
  local phone="$1"
  curl -sS -X POST "${BASE}/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"cin\":\"${phone}\",\"password\":\"TestPass1\"}" \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])"
}

TOK1="$(token_login "$PHONE1")"
TOK2="$(token_login "$PHONE2")"
log "Logged in both users"

curl -sS -X POST "${BASE}/accounts/${ADDR1}/set-pin" \
  -H "X-Account-Token: ${TOK1}" \
  -H 'Content-Type: application/json' \
  -d '{"pin":"9876"}' | python3 -c "import sys,json; assert json.load(sys.stdin).get('success')==True"
log "User1 PIN set"

curl -sS -X POST "${BASE}/accounts/${ADDR2}/set-pin" \
  -H "X-Account-Token: ${TOK2}" \
  -H 'Content-Type: application/json' \
  -d '{"pin":"4567"}' >/dev/null
log "User2 PIN set"

# Top up user1 via public pay-by-card (test card path)
curl -sS -X POST "${BASE}/wallets/${ADDR1}/pay-by-card" \
  -H 'Content-Type: application/json' \
  -d '{
    "amount": 5000000,
    "card_number": "4242424242424242",
    "expiry_month": "12",
    "expiry_year": "2029",
    "cvv": "123",
    "pin": "1234",
    "card_holder_name": "E2E Alice",
    "memo": "e2e fund"
  }' | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('success')==True, d"
log "Funded user1 (+5000 TND equivalent in millimes units)"

xfer="$(curl -sS -X POST "${BASE}/accounts/${ADDR1}/transfer" \
  -H "X-Account-Token: ${TOK1}" \
  -H 'Content-Type: application/json' \
  -d "{\"to\":\"${EMAIL2}\",\"amount\":100000,\"pin\":\"9876\",\"memo\":\"hello bob\"}")"
echo "$xfer" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('success')==True, d; assert 'to_name' in d"
log "Transfer ok: $(echo "$xfer" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('to_name'), d.get('tx_hash')[:16]+'…')")"

curl -sS "${BASE}/accounts/${ADDR2}/notifications" -H "X-Account-Token: ${TOK2}" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); assert len(d['notifications'])>=1"
log "User2 notifications feed non-empty"

dd if=/dev/zero of="${WORKDIR}/tax.pdf" bs=2048 count=1 status=none

curl -sS -X POST "${BASE}/accounts/${ADDR1}/agent/apply" \
  -F "user_address=${ADDR1}" \
  -F "business_name=Alice Agent Co" \
  -F "business_type=retail" \
  -F "tax_registration_number=TX-123" \
  -F "business_address=1 Rue Test" \
  -F "business_governorate=Tunis" \
  -F "business_description=High volume cash in agent network for e2e." \
  -F "expected_monthly_volume=250000" \
  -F "tax_document=@${WORKDIR}/tax.pdf;type=application/pdf" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('status')=='PENDING', d"
log "Agent application submitted"

log "Waiting for agent scorer…"
sleep 12
agent_http="$(curl -sS -o /tmp/e2e_agent.json -w '%{http_code}' "${BASE}/accounts/${ADDR1}/agent/status" || true)"
log "agent/status HTTP=${agent_http} body=$(cat /tmp/e2e_agent.json 2>/dev/null || true)"

log "E2E finished OK."
echo "ADDR1=${ADDR1}"
echo "ADDR2=${ADDR2}"
