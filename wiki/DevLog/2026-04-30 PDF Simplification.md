---
tags: [devlog, simplification]
created: 2026-04-30
updated: 2026-04-30
---

# 2026-04-30 PDF Simplification — moved generation client-side

## What happened

Right after the first AWS deploy, two PDF problems surfaced:

1. **Blank PDFs.** The server-side `/pdf` route returned a 14-31 KB file structurally — `pdfinfo` saw 9-13 pages — but `pdftotext` extracted **zero characters** and users saw blank white pages.
2. **Spam-click did nothing.** Clicking Export PDF a few times in a row produced silent failures. The UI gave no feedback.

## Root causes

**Blank PDFs:** API Gateway HTTP API was treating the Lambda's response body as UTF-8 text. PDFKit writes a `%` followed by 4 high-bit bytes (≥ 0x80) as a "this is a binary file" marker right after the version line. API Gateway interpreted those bytes as invalid UTF-8 and replaced each one with `0xEF 0xBF 0xBD` (the Unicode replacement character). The structural PDF objects (mostly ASCII) survived, but font streams, glyph data, and content streams (all binary) were mangled — readers saw structure → rendered nothing visible.

Hex evidence (first 16 bytes):
- Before fix: `25 50 44 46 2D 31 2E 33 0A 25 EF BF BD EF BF BD ...`
- After fix:  `25 50 44 46 2D 31 2E 33 0A 25 FF FF FF FF ...`

The fix was a one-line change in `backend/src/lambda-api.ts`: tell `serverless-http` which Content-Types to base64-encode:

```ts
return serverless(app, {
  binary: ['application/pdf', 'application/octet-stream', 'image/*'],
});
```

**Spam-click feedback:** A protective rate limiter on `/pdf` (5/min/IP, DynamoDB-backed) was returning 429s after the 5th request, but the frontend silently swallowed errors. Admins saw "the click did nothing" instead of "you're temporarily blocked."

## Decision: scrap the server-side PDF stack entirely

After fixing the binary-encoding bug and confirming PDFs rendered correctly, the user asked: *"i dont want to store pdfs at all, it should only be to download them as fast as possible and make sure that the process doesnt destory the system... can we just have the pdf generation happen client side in the browser no complicated logic?"*

Yes. The whole reason PDF generation was on the server was institutional inertia (PDFKit is a Node library; it ran where the rest of the backend ran). At this scale (few admins, ~50 items per checklist, ~30 KB output) the browser can do the work in <100ms. Moving it client-side eliminates **every** failure mode in this domain at once:

- No API call → no API Gateway encoding bugs
- No Lambda → no cold-start latency, no concurrency caps
- No rate limiter needed → no "spam-click did nothing"
- No S3 cache → no stale-PDF risk
- No SQS / async path → no polling, no DLQ, no idempotency
- Lambda zip drops 2.4 MB → 1.4 MB (PDFKit + .afm fonts gone)

## Implementation

**Library:** jsPDF + jspdf-autotable. ~150 KB gzipped added to the frontend bundle. Mature, well-maintained, supports text + tables + images out of the box.

**File:** `frontend/src/utils/pdf.ts`. Two exports:
- `generateChecklistPdf(checklist) → Blob` — pure function
- `downloadChecklistPdf(checklist) → void` — generate + trigger download

The layout matches the previous server-side output exactly. Same summary block, same per-machine progress bars, same per-machine pages with categories and tasks. Status glyphs are unicode (✓ ✗ —) which jsPDF renders fine using its bundled Helvetica.

**Button wiring:** `ChecklistDetail.tsx` calls `downloadChecklistPdf(checklist)` directly. State machine: idle → "Generating…" (button disabled) → idle. A `setTimeout(0)` between setState and the synchronous render lets the disabled label paint before the main thread blocks for ~50ms.

## What was removed

**Backend code:**
- `backend/src/routes/checklists.ts` — entire `GET /:id/pdf` route handler (~250 lines)
- `backend/src/lambda-pdf.ts` — async PDF Lambda (already removed earlier this session)
- `backend/src/data/sqs.ts`
- `backend/src/data/pdf-generator.ts`
- `pdfkit`, `@types/pdfkit` from `backend/package.json`
- `pdfLimiter` middleware from `backend/src/app.ts`
- The `import PDFDocument from 'pdfkit'` line at the top of `checklists.ts`

**Infrastructure (Terraform):**
- `infrastructure/sqs.tf` (already deleted)
- `aws_lambda_function.pdf` + event source mapping (already deleted)
- `aws_iam_role.lambda_pdf` + its policies (already deleted)
- `aws_s3_bucket.pdfs` + dependents (already deleted)
- `aws_cloudwatch_metric_alarm.pdf_dlq_messages` (already deleted)
- `enable_async_pdf` variable (already deleted)
- `.afm` font-copy step in `infrastructure/build-lambdas.sh`

**Frontend code:**
- `downloadChecklistPdf` in `frontend/src/services/api.ts` (the network-based version)

## Verification

- `curl /api/checklists/:id/pdf` → **HTTP 404** (route is gone)
- `curl /api/factories` → 200 OK, returns 4 factories (other endpoints unaffected)
- `curl /api/checklists?limit=1` → 200 OK
- Browser: hard-refresh, click Export PDF on any checklist → instant download with valid content
- Spam-click: each click triggers a separate download (browser handles concurrent downloads fine; no rate limit to hit)
- Lambda CloudWatch: zero PDF-related errors

## Lessons captured

1. **Don't run binary I/O through API Gateway HTTP API without setting `binary` on `serverless-http`.** The default text-encoding silently corrupts every byte ≥ 0x80. Symptoms look like font / rendering bugs.
2. **Match the engine to the workload's scale.** A PDF render that takes ~50ms on a laptop doesn't need a queue, a Lambda, an S3 cache, and a 30-second polling protocol. Each layer adds failure surface; none added value here.
3. **Frontend bundle size is cheaper than infrastructure.** Adding 150 KB of jsPDF to the SPA bundle (cached forever after first load) cost less than the SQS queue + extra Lambda + S3 bucket + IAM role + CloudWatch alarm + Terraform glue.

## Files touched

**Modified:**
- `backend/src/routes/checklists.ts` — removed PDF route + import
- `backend/src/lambda-api.ts` — added `binary` option (still used briefly before client-side rewrite)
- `backend/src/app.ts` — removed `pdfLimiter`
- `backend/package.json` — removed `pdfkit`, `@types/pdfkit`
- `frontend/src/services/api.ts` — removed `downloadChecklistPdf` export
- `frontend/src/pages/ChecklistDetail.tsx` — calls client-side `downloadChecklistPdf` from utils
- `frontend/package.json` — added `jspdf`, `jspdf-autotable`
- `infrastructure/build-lambdas.sh` — removed PDFKit font-copy step

**Created:**
- `frontend/src/utils/pdf.ts`
