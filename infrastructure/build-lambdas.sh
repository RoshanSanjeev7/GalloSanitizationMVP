#!/usr/bin/env bash
# Build script for the Lambda deployment artifact.
#
# Bundles backend/src/lambda-api.ts into a self-contained ESM bundle
# that Lambda can run without an `npm install` at the destination.
# esbuild handles tree-shaking so the @aws-sdk imports stay small
# (we only pull the clients the Lambda actually uses).
#
# Output:
#   backend/dist/lambda-api/index.mjs       (handler is `index.handler`)
#
# Run from the infrastructure/ directory before `terraform apply`. CI
# should run this as a pre-step.
#
# Note: there used to be a second Lambda (lambda-pdf) that consumed an
# SQS queue to render PDFs out-of-band. It was removed in favor of
# rendering synchronously inside lambda-api. See
# wiki/Subsystems/PDF Export.md.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/../backend" && pwd)"
DIST_DIR="$BACKEND_DIR/dist"

echo "==> Cleaning old artifacts"
rm -rf "$DIST_DIR/lambda-api" "$DIST_DIR/lambda-ws"
mkdir -p "$DIST_DIR/lambda-api" "$DIST_DIR/lambda-ws"

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
  # esbuild's ESM output replaces CommonJS globals with module-scoped
  # references. The banner injects shims for everything PDFKit, dotenv,
  # multer, etc. expect to find at runtime:
  #   - `require()` for transitive CJS deps using dynamic require
  #   - `__filename` / `__dirname` for libs that locate bundled assets
  #     by file path (PDFKit's font-file loader is the canonical case;
  #     it crashed Lambda with "ReferenceError: __dirname is not defined"
  #     until this was added)
  --banner:js="import { createRequire as __cr } from 'module'; import { fileURLToPath as __fu } from 'url'; import { dirname as __dn } from 'path'; const require = __cr(import.meta.url); const __filename = __fu(import.meta.url); const __dirname = __dn(__filename);"
)

echo "==> Building lambda-api"
npx --prefix "$BACKEND_DIR" esbuild "$BACKEND_DIR/src/lambda-api.ts" \
  --outfile="$DIST_DIR/lambda-api/index.mjs" \
  "${COMMON_FLAGS[@]}"

# Note: PDFKit fonts (.afm files) used to be copied here for the
# server-side /pdf route. PDF generation moved client-side (jsPDF in
# the browser), so PDFKit is no longer a dependency and the font
# copy step is gone too.

echo "==> Building lambda-ws"
npx --prefix "$BACKEND_DIR" esbuild "$BACKEND_DIR/src/lambda-ws.ts" \
  --outfile="$DIST_DIR/lambda-ws/index.mjs" \
  "${COMMON_FLAGS[@]}"

echo "==> Done. Artifact sizes:"
du -h "$DIST_DIR/lambda-api/index.mjs"
du -h "$DIST_DIR/lambda-ws/index.mjs"
