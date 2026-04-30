---
tags: [subsystem]
created: 2026-04-09
updated: 2026-04-30
---

# PDF Export

PDF generation runs **entirely in the browser**. Click "Export PDF" → jsPDF builds the document from the Checklist already loaded in the page → blob → `<a download>`. No server API call, no Lambda invocation, no S3 cache.

## Implementation

`frontend/src/utils/pdf.ts` — the canonical generator. Two exports:

- **`generateChecklistPdf(checklist: Checklist): Blob`** — pure function, returns the PDF bytes. Synchronous; <100ms typical for a 50-item / 5-machine checklist.
- **`downloadChecklistPdf(checklist: Checklist): void`** — wraps `generate*` and triggers a browser download with a sensible filename (`<lineName>-checklist-<id8>.pdf`).

## Layout

Mirrors what the previous server-side PDFKit renderer produced:

- **Page 1 — Summary:** Title + status, key-value summary block (operator, contributors, start/end times, duration, completed/issues/pending counts), per-machine progress bars, and a Notes & Issues section listing every item with an `issue` set.
- **Pages 2+ — One per machine:** Machine header with completion ratio, then categories with their tasks. Each task shows status glyph (✓ / ✗ / —), description, `completedBy` + timestamp stamp, and any `issue` text in red italic.

The renderer pre-measures each item's height and atomically page-breaks before half-rendering — no item ever splits across pages.

## Why client-side

Originally the design had a server-side `/pdf` route plus an async path (SQS + Lambda + S3 cache + frontend polling). Every layer of that delivered zero value at this scale and produced real bugs:

- **API Gateway corrupted PDFs.** The HTTP API, by default, treated the binary Lambda response as UTF-8 text. Every byte ≥ 0x80 became `0xEF 0xBF 0xBD` (the Unicode replacement character). PDFs structurally rendered (page count, layout) but had zero extractable text → users saw blank white pages. Fixable via `serverless-http`'s `binary` option, but the underlying mistake was sending bytes through a transport that wanted text.
- **Rate-limiter UX.** A protective per-IP limit on `/pdf` returned 429 after 5 PDFs/min, but the frontend silently swallowed the error. Admins clicking Export multiple times saw "nothing happen" instead of "you're rate-limited."
- **Architecture mismatch with intent.** The user wanted "download as fast as possible." The async path adds a 30s polling window for a cache that never warms (the seed inserts checklists without hitting `submit`, so no SQS message, so no cached PDF, so polling always times out, so the sync fallback runs anyway).

Client-side generation removes all three failure modes. PDF rendering is CPU work that doesn't need shared infrastructure for a small admin tool.

## What's NOT here anymore

- Server `/pdf` route (was in `backend/src/routes/checklists.ts`)
- Server `/pdf/status` route
- `backend/src/lambda-pdf.ts`
- `backend/src/data/sqs.ts`
- `backend/src/data/pdf-generator.ts`
- `pdfkit` dependency
- `pdfLimiter` middleware
- SQS `pdf-generation-queue` + DLQ (Terraform)
- S3 `pdfs` bucket (Terraform)
- PDF Lambda + IAM role (Terraform)
- DLQ depth CloudWatch alarm
- `enable_async_pdf` Terraform variable
- `pdfKey` / `pdfGeneratedAt` fields on Checklist are still in the type but aren't written by the active codebase. Existing seed records may still have them; harmless.

## See also

- [[2026-04-30 First AWS Deployment]] — the deploy that exposed the PDF bugs
- [[2026-04-30 PDF Simplification]] — devlog for this rewrite
- [[Frontend Pages]] — ChecklistDetail is the (only) page with the Export PDF button
- [[System Architecture]] — updated to reflect the simpler topology
