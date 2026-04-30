---
tags: [subsystem]
created: 2026-04-10
updated: 2026-04-30
---

# Image Handling

Operators can attach photos to individual checklist items. The system supports upload, retrieval via presigned URLs, and deletion, all with atomic DynamoDB updates and WebSocket broadcasting.

## Upload Flow (Presigned URL — primary path)

Updated 2026-04-30 to bypass the API for the actual byte transfer. Required for Lambda hosting (6 MB request payload cap) and faster / cheaper than proxying multipart through Express in any host. See [[2026-04-30 Lambda Readiness and WS Hardening]] for context.

1. **Phase 1 — Presign:** Frontend POSTs to `POST /api/checklists/:id/images/presign` with `{ machineIdx, catIdx, itemIdx, files: [{ name, mimeType, size }, ...] }`. Server validates MIME types, file sizes, per-item limit (20), per-checklist limit (200), and returns one presigned PUT URL per file along with the S3 key.

2. **Phase 2 — Direct upload to S3:** Frontend PUTs each file directly to its presigned URL (with `Content-Type` only — no Authorization header, the URL signature embeds auth). Bytes never touch the API. URLs expire in 60 seconds, but S3 honors PUTs that started before expiry.

3. **Phase 3 — Finalize:** Frontend POSTs `POST /api/checklists/:id/images/finalize` with `{ machineIdx, catIdx, itemIdx, keys: [...] }`. Server enforces ownership (every key must start with `<checklistId>/`), atomically appends keys to the item's `images` array via `appendChecklistImages()`, logs the `Activity`, and broadcasts an `image_update` over the [[WebSocket System]] to all peers.

The `<checklistId>/...` prefix on the key is the ownership boundary — only this server could have generated such a key during phase 1, so an attacker can't smuggle in pre-uploaded keys to claim-jump someone else's checklist.

## Upload Flow (Multipart — legacy fallback)

`POST /api/checklists/:id/images` retained for older clients and as a transparent fallback when phase-1 returns 404 (e.g. backend predates the rollout). Accepts multipart `FormData` with `images[]`. Goes through `multer` MIME / size validation, then the same S3 upload + atomic DynamoDB append + WS broadcast.

The frontend `uploadImages` in `frontend/src/services/api.ts` tries the presigned path first and only falls back to multipart on a `PRESIGN_NOT_AVAILABLE` signal — real validation errors (400/403) are surfaced as-is, not papered over with a slow fallback.

## Retrieval

Images are never served directly. The frontend requests presigned S3 GET URLs with a 1-hour expiry.

**Single URL:** `GET /api/checklists/:id/images/:key` returns `{ url: "https://..." }`.

**Batch URLs:** `POST /api/checklists/:id/image-urls` accepts a `keys` array (max 50). The `useImageUrlsForMachines` hook uses this batch endpoint to load all images for the active machine tab in one request.

Both endpoints verify key ownership -- every key must start with `${checklistId}/`. This prevents cross-checklist image access.

## Deletion

`DELETE /api/checklists/:id/images` accepts `{ key, machineIdx, catIdx, itemIdx }`. The handler verifies key ownership, deletes the object from S3, updates DynamoDB with the remaining images, and broadcasts `image_update` via WebSocket.

## Frontend State

The `useImageUrlsForMachines` hook tracks which image keys need URLs, fetches them in batches, and caches presigned URLs for the session. During upload, an `uploading` state map shows a spinner on the affected item.

## See also

- [[DynamoDB Tables]] -- the Checklists table's nested images arrays
- [[Input Validation]] -- MIME whitelist and count limits
- [[WebSocket System]] -- `image_update` broadcast on upload/delete
- [[2026-04-30 Lambda Readiness and WS Hardening]] -- devlog for the presigned-URL flow rollout
