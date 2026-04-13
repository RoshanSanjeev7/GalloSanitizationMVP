---
tags:
  - backend
  - architecture
---

# PDF Export

The system supports two modes of PDF generation: synchronous (direct HTTP streaming) and asynchronous (SQS queue + Lambda). Both use PDFKit to build the document.

## Synchronous Mode

`GET /checklists/:id/pdf` is an admin-only endpoint that generates a PDF with PDFKit and streams it directly to the HTTP response. The route handler loads the checklist, builds the PDF document in memory, and pipes it to `res` with `Content-Type: application/pdf`. This is the default mode used during local development and for on-demand exports.

`GET /checklists/:id/pdf/status` checks whether a cached PDF already exists by looking at the `checklist.pdfKey` field. If the key is present, the PDF was previously generated and stored in S3, so the frontend can link directly to it instead of regenerating.

## PDF Structure

The generated PDF follows a consistent layout:

- **Page 1 -- Summary:** Operator name, contributors, start/end times, completion statistics, and machine-level progress bars showing percentage complete.
- **Subsequent pages -- One per machine:** Each machine gets its own page with categories listed as sections. Each category contains its task items with status indicators (completed, incomplete, flagged with issue). Comments and image references are included inline.

## Asynchronous Mode (SQS + Lambda)

When a checklist is submitted via `POST /checklists/:id/submit`, the backend sends a message to the `pdf-generation-queue` SQS queue. This triggers asynchronous PDF generation so the operator doesn't wait for PDF creation during submission.

The Lambda handler (`lambda-pdf.ts`) reads messages from SQS, generates the PDF using the same PDFKit logic, stores the result in S3, and updates the checklist record with `pdfKey` and `pdfGeneratedAt`. Once these fields are set, the `GET /checklists/:id/pdf/status` endpoint returns a positive response, and admins can download the cached PDF without regenerating it.

This asynchronous path is designed for production where submission volume may be high and PDF generation should not block the request/response cycle. The synchronous endpoint remains available as a fallback for on-demand regeneration.

## Local Development

The async Lambda/SQS path is **scaffolded but not functional in local dev**. LocalStack creates the SQS queue, and `submit` sends a message to it, but no Lambda is configured to consume the queue locally. The synchronous `GET /checklists/:id/pdf` endpoint works in local dev — PDFs are generated on-demand via PDFKit streaming. The Lambda handler (`lambda-pdf.ts`) is only active when deployed to AWS with a proper SQS trigger.

## S3 Storage

Generated PDFs are stored in the same S3 bucket used for [[Image Handling]] (`checklist-images`). The key follows a pattern like `pdfs/<checklistId>.pdf`. Presigned URLs provide time-limited download access.

## Access Control

Both PDF endpoints are admin-only, enforced by the `adminOnly` middleware described in [[Roles and Permissions]]. Operators cannot generate or download PDF reports.

## See also

- [[API Endpoints]] -- the PDF-related routes in the Checklists section
- [[System Architecture]] -- where SQS fits in the runtime topology
- [[Image Handling]] -- shared S3 bucket for PDFs and images
