---
tags: [subsystem]
created: 2026-04-09
updated: 2026-04-13
---

# PDF Export

The system supports two modes of PDF generation: synchronous (direct HTTP streaming) and asynchronous (SQS queue + Lambda). Both use PDFKit to build the document.

## Synchronous Mode

`GET /checklists/:id/pdf` is an admin-only endpoint that generates a PDF with PDFKit and streams it directly to the HTTP response. This is the default mode used during local development and for on-demand exports.

`GET /checklists/:id/pdf/status` checks whether a cached PDF already exists by looking at the `checklist.pdfKey` field. If the key is present, the PDF was previously generated and stored in S3, so the frontend can link directly to it.

## PDF Structure

The generated PDF follows a consistent layout:

- **Page 1 -- Summary:** Operator name, contributors, start/end times, completion statistics, and machine-level progress bars showing percentage complete.
- **Subsequent pages -- One per machine:** Each machine gets its own page with categories listed as sections containing task items with status indicators, comments, and image references.

## Asynchronous Mode (SQS + Lambda)

When a checklist is submitted via `POST /checklists/:id/submit`, the backend sends a message to the `pdf-generation-queue` SQS queue. The Lambda handler (`lambda-pdf.ts`) generates the PDF, stores it in S3, and updates the checklist record with `pdfKey` and `pdfGeneratedAt`.

This async path is designed for production where submission volume may be high. The synchronous endpoint remains available as a fallback. The async path is **scaffolded but not functional in local dev** -- LocalStack creates the SQS queue but no Lambda is configured to consume it locally.

## S3 Storage

Generated PDFs are stored in the same S3 bucket used for [[Image Handling]] (`checklist-images`). The key follows `pdfs/<checklistId>.pdf`. Presigned URLs provide time-limited download access.

## Access Control

Both PDF endpoints are admin-only, enforced by the `adminOnly` middleware described in [[Roles and Permissions]]. See [[API Endpoints]] for the PDF routes.

## See also

- [[API Endpoints]] -- the PDF-related routes in the Checklists section
- [[System Architecture]] -- where SQS fits in the runtime topology
- [[Image Handling]] -- shared S3 bucket for PDFs and images
