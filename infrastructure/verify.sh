#!/usr/bin/env bash
# Post-deploy verification — run after every `terraform apply`.
#
# Three checks, each fast:
#   1. Idempotency: a clean apply should produce zero changes on the
#      next plan. Drift here means Terraform state has fallen out of
#      sync with the cloud (a console edit, a Lambda code update done
#      out-of-band, etc.) — fix the drift before the next deploy.
#   2. Both Lambdas exist and are reachable via the AWS API.
#   3. The HTTP API responds to /health with 200.
#
# Run via: ./infrastructure/verify.sh
# Exits 0 on full success, 1 on any failure.

set -euo pipefail

cd "$(dirname "$0")"

echo "==> [1/3] Verifying terraform plan is clean (no drift)"
JWT_SECRET_FILE="${JWT_SECRET_FILE:-/tmp/gallo-jwt-secret.txt}"
if [ ! -f "$JWT_SECRET_FILE" ]; then
  echo "    ERROR: JWT secret file not found at $JWT_SECRET_FILE"
  echo "    Set JWT_SECRET_FILE=/path/to/secret or create the default file."
  exit 1
fi

# detailed-exitcode: 0 = no diff, 1 = error, 2 = changes pending
set +e
AWS_PROFILE=gallo-cap TF_VAR_jwt_secret="$(cat "$JWT_SECRET_FILE")" \
  terraform plan -var-file=dev.tfvars -detailed-exitcode -no-color -out=/tmp/tf-verify.plan >/tmp/tf-verify.out 2>&1
PLAN_EXIT=$?
set -e

case $PLAN_EXIT in
  0) echo "    OK — no drift" ;;
  2)
    echo "    DRIFT DETECTED:"
    grep -E '^\s*[~+-]' /tmp/tf-verify.out | head -30
    exit 1
    ;;
  *)
    echo "    plan failed with exit $PLAN_EXIT:"
    tail -20 /tmp/tf-verify.out
    exit 1
    ;;
esac

echo "==> [2/3] Verifying Lambdas exist"
for FN in gallo-sanitization-dev-api gallo-sanitization-dev-ws; do
  if AWS_PROFILE=gallo-cap aws lambda get-function --function-name "$FN" --region us-west-2 >/dev/null 2>&1; then
    echo "    OK — $FN"
  else
    echo "    MISSING — $FN"
    exit 1
  fi
done

echo "==> [3/3] Verifying API Gateway /health responds 200"
API=$(terraform output -raw api_gateway_url)
if curl -sf "$API/health" >/dev/null; then
  echo "    OK — $API/health"
else
  echo "    FAIL — $API/health did not return 200"
  exit 1
fi

echo
echo "==> All deploy checks passed."
