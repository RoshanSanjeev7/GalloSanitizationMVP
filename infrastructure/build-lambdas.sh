#!/usr/bin/env bash
# Build script for the Lambda deployment artifacts.
#
# Bundles backend/src/lambda-api.ts and backend/src/lambda-pdf.ts into
# self-contained ESM bundles that Lambda can run without an
# `npm install` at the destination. esbuild handles tree-shaking so
# the @aws-sdk imports stay small (we only pull the clients each
# Lambda actually uses).
#
# Output:
#   backend/dist/lambda-api/index.mjs   (handler is `lambda-api.handler`)
#   backend/dist/lambda-pdf/index.mjs   (handler is `lambda-pdf.handler`)
#
# Run from the infrastructure/ directory before `terraform apply`. CI
# should run this as a pre-step.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/../backend" && pwd)"
DIST_DIR="$BACKEND_DIR/dist"

echo "==> Cleaning old artifacts"
rm -rf "$DIST_DIR/lambda-api" "$DIST_DIR/lambda-pdf"
mkdir -p "$DIST_DIR/lambda-api" "$DIST_DIR/lambda-pdf"

# `--external:@aws-sdk/*` keeps the AWS SDK out of our bundle — Lambda's
# Node.js 22.x runtime ships with @aws-sdk v3 already, so bundling it
# would just bloat the zip and slow cold starts. Same logic for `aws-sdk`
# (v2 legacy, also runtime-provided).
COMMON_FLAGS=(
  --bundle
  --platform=node
  --target=node22
  --format=esm
  --minify
  --sourcemap
  --external:@aws-sdk/*
  --external:aws-sdk
  # esbuild's ESM output uses `import.meta.url` etc. — banner injects
  # a CommonJS-friendly shim so any transitive `require()` from a dep
  # still resolves at runtime.
  --banner:js="import { createRequire } from 'module'; const require = createRequire(import.meta.url);"
)

echo "==> Building lambda-api"
npx --prefix "$BACKEND_DIR" esbuild "$BACKEND_DIR/src/lambda-api.ts" \
  --outfile="$DIST_DIR/lambda-api/index.mjs" \
  "${COMMON_FLAGS[@]}"

echo "==> Building lambda-pdf"
npx --prefix "$BACKEND_DIR" esbuild "$BACKEND_DIR/src/lambda-pdf.ts" \
  --outfile="$DIST_DIR/lambda-pdf/index.mjs" \
  "${COMMON_FLAGS[@]}"

echo "==> Done. Artifact sizes:"
du -h "$DIST_DIR/lambda-api/index.mjs" "$DIST_DIR/lambda-pdf/index.mjs"
