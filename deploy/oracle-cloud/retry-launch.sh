#!/usr/bin/env bash
# ─── Retry VM Launch Until Capacity is Available ───
# Oracle Free Tier ARM instances run out of capacity frequently.
# This keeps retrying every 2 minutes until it succeeds.
# Run: bash deploy/oracle-cloud/retry-launch.sh
set -euo pipefail

TENANCY="ocid1.tenancy.oc1..aaaaaaaaqslwnuzgyocz6ow72ppcknecswdsb3uioaet3zk3lexgapkhbz6a"
COMPARTMENT="$TENANCY"
AD="myBM:EU-MILAN-1-AD-1"
SUBNET="ocid1.subnet.oc1.eu-milan-1.aaaaaaaacvo64psyiipmxwx3ybe7e2wkkazjtzdcwegk4exxcotrf4ijjy3a"
IMAGE="ocid1.image.oc1.eu-milan-1.aaaaaaaaihdqn22x3oxlmx6yd5j6lfiynymab7d5hyjikqma3rqi5ih3dega"
SSH_KEY="$HOME/.ssh/id_ed25519.pub"
ATTEMPT=0

echo "Starting retry loop — trying every 2 minutes for Ampere A1 capacity..."
echo "Press Ctrl+C to stop."
echo ""

while true; do
    ATTEMPT=$((ATTEMPT + 1))
    TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
    echo -n "[$TIMESTAMP] Attempt #$ATTEMPT... "

    RESULT=$(oci compute instance launch \
      -c "$COMPARTMENT" \
      --availability-domain "$AD" \
      --display-name "nexapay" \
      --shape "VM.Standard.A1.Flex" \
      --shape-config '{"ocpus":4,"memoryInGBs":24}' \
      --image-id "$IMAGE" \
      --subnet-id "$SUBNET" \
      --boot-volume-size-in-gbs 200 \
      --assign-public-ip true \
      --ssh-authorized-keys-file "$SSH_KEY" \
      --max-retries 1 \
      2>&1) || true

    if echo "$RESULT" | grep -q '"lifecycle-state": "PROVISIONING"'; then
        echo ""
        echo "=============================================="
        echo " SUCCESS! Instance is provisioning!"
        echo "=============================================="
        echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d, indent=2))" 2>/dev/null || echo "$RESULT"
        echo ""
        echo "Check status:  oci compute instance list -c $COMPARTMENT --output table"
        exit 0
    elif echo "$RESULT" | grep -q "Out of host capacity"; then
        echo "No capacity yet. Retrying in 2 min..."
    elif echo "$RESULT" | grep -q "LimitExceeded\|QuotaExceeded"; then
        echo "LIMIT/QUOTA EXCEEDED — check your tenancy limits."
        echo "$RESULT"
        exit 1
    elif echo "$RESULT" | grep -q "429\|TooManyRequests"; then
        echo "Rate limited. Waiting 5 min..."
        sleep 300
    elif echo "$RESULT" | grep -q '"lifecycle-state"'; then
        echo ""
        echo "Instance may have been created! Raw response:"
        echo "$RESULT"
        exit 0
    else
        echo "Unexpected response. Retrying in 2 min..."
        echo "$RESULT" | tail -3
    fi

    sleep 120
done
