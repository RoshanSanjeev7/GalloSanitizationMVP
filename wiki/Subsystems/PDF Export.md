---
tags: [subsystem]
created: 2026-04-09
updated: 2026-04-30
---

# PDF Export

The system supports two modes of PDF generation: synchronous (direct HTTP streaming) and asynchronous (SQS queue + Lambda). Both use PDFKit to build the document, sharing the `generatePdfBuffer()` helper in `backend/src/data/pdf-generator.ts`.

## Synchronous Mode

`GET /checklists/:id/pdf` is an admin-only endpoint that generates a PDF with PDFKit and streams it directly to the HTTP response. Used as a fallback for when the async path isn't ready (e.g. checklists submitted before async rollout, or polling timed out).

Important constraint: under Lambda hosting (see [[System Architecture]]), API Gateway has a 30-second hard timeout. Very large checklists may not finish streaming within that window — that's another reason to make the async path the default and the sync path the "force regenerate" admin tool.

## Asynchronous Mode (SQS + Lambda)

Wired up in [[2026-04-30 Lambda Readiness and WS Hardening]]:

1. **Submit triggers the queue.** When a checklist is submitted via `POST /checklists/:id/submit`, the backend publishes `{ checklistId }` to the `pdf-generation-queue` SQS queue **behind the `ENABLE_ASYNC_PDF=true` env flag**. Fire-and-forget — SQS failures are logged but never block the submit response.
2. **Lambda generates the PDF.** `lambda-pdf.ts` consumes the SQS message, builds the PDF via `generatePdfBuffer()`, uploads to S3 at key `pdfs/<checklistId>.pdf`, and updates the checklist record with `pdfKey` and `pdfGeneratedAt`.
3. **Idempotency guard.** Lambda checks `pdfKey` before regenerating; SQS at-least-once redelivery becomes a cheap GetItem instead of a duplicate PDF render. Re-generation is opt-in via `force: true` on the SQS payload (used by an admin "regenerate" tool not yet built).
4. **Status endpoint serves a presigned URL.** `GET /checklists/:id/pdf/status` returns `{ ready: false, url: null }` while the Lambda is still working, then `{ ready: true, url: <presigned S3 URL> }` once `pdfKey` is set. The presigned URL is valid for 1 hour and lets the browser pull bytes directly from S3 with no round-trip through the API.
5. **Frontend polls then downloads.** `frontend/src/services/api.ts` `downloadChecklistPdf` polls `/pdf/status` every 2 seconds for up to 30 seconds. When ready, it triggers the download via `<a download>` with the presigned URL — no Authorization header needed because the signature embeds auth. If polling times out (Lambda is slow, queue backed up, async path disabled), it falls through to the synchronous endpoint as a transparent fallback.

The async path is **functional in local dev** when LocalStack's SQS queue is consumed — historically it was scaffolded but unwired; the wiring is now in place, only the Lambda runtime in LocalStack is not configured locally.

## PDF Structure

The generated PDF follows a consistent layout:

- **Page 1 -- Summary:** Operator name, contributors, start/end times, completion statistics, and machine-level progress bars showing percentage complete.
- **Subsequent pages -- One per machine:** Each machine gets its own page with categories listed as sections containing task items with status indicators, comments, and image references.

## S3 Storage

Generated PDFs are stored in the same S3 bucket used for [[Image Handling]] (`checklist-images` in dev). The key follows `pdfs/<checklistId>.pdf`. Presigned URLs (via `getImageUrl()`) provide time-limited download access.

## Access Control

Both PDF endpoints are admin-only, enforced by the `adminOnly` middleware described in [[Roles and Permissions]]. See [[API Endpoints]] for the PDF routes.

## See also

- [[API Endpoints]] -- the PDF-related routes in the Checklists section
- [[System Architecture]] -- where SQS fits in the Lambda topology
- [[Image Handling]] -- shared S3 bucket for PDFs and images
- [[2026-04-30 Lambda Readiness and WS Hardening]] -- devlog entry for the async path wiring
