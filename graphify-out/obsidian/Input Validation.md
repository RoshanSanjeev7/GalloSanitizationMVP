---
tags:
  - backend
---

# Input Validation

The backend validates incoming data at multiple levels to prevent malformed writes and potential security issues.

## Machine Structure Validation

The `validateMachines()` function in `checklists.ts` recursively checks the structure of the machines payload on `PUT /:id/items`:

- Top level must be an array
- Each machine must have a `name` (string) and `categories` (array)
- Each category must have a `name` (string) and `items` (array)
- Each item must have a `description` (string), `completed` (boolean or null), optional `issue` (string or null), and optional `images` (array)

If validation fails, the endpoint returns `400: Invalid machines structure`. The per-machine endpoint (`PUT /:id/machines/:machineIdx`) validates the machine index range but relies on the same structural expectations.

## Image Validation

Image uploads go through several validation layers in `images.ts`:

**MIME whitelist:** Only `image/jpeg`, `image/png`, `image/webp`, `image/heic`, and `image/heif` are accepted. The multer `fileFilter` rejects anything else before the file even reaches the route handler.

**File size:** multer's `limits.fileSize` caps each file at 10MB.

**Count limits:**
- Per item: maximum 20 images. If `item.images.length + files.length > 20`, returns 400.
- Per checklist: maximum 200 images total across all machines/categories/items. Calculated by flattening the entire `machines` array.

**Key ownership:** When retrieving presigned URLs via `POST /:id/image-urls`, every key in the `keys` array must start with `${checklistId}/`. Keys that don't match get a 403: "Access denied to requested image keys". This prevents one checklist from accessing another's images. The batch endpoint also caps at 50 keys per request.

The same ownership check applies to `DELETE /:id/images` -- the `key` must start with the checklist's ID.

See [[Image Handling]] for the full upload/retrieval/delete flow that uses these validation checks.

## Body Size Limit

Express is configured with `express.json({ limit: '1mb' })`, rejecting any JSON body larger than 1MB. This prevents accidental or malicious large payloads.

## Pagination Caps

All list endpoints cap the `limit` parameter at 100 and floor it at 1: `Math.min(100, Math.max(1, parsed))`. This prevents clients from requesting unbounded result sets. See [[API Endpoints]] for which endpoints use pagination.

## What's NOT Validated

- Template structure on create/update (templates are trusted admin input)
- Email format on user creation (no regex check)
- Password complexity (plaintext, dev only)

These are acceptable gaps for an MVP but should be addressed before production deployment.

## See also

- [[API Endpoints]] -- which endpoints validate what
- [[Image Handling]] -- MIME types and limits in context
- [[Rate Limiting]] -- another defense layer complementing validation
