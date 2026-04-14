---
tags: [subsystem]
created: 2026-04-10
updated: 2026-04-13
---

# Image Handling

Operators can attach photos to individual checklist items. The system supports upload, retrieval via presigned URLs, and deletion, all with atomic DynamoDB updates and WebSocket broadcasting.

## Upload Flow

1. **Frontend:** `ChecklistFill` renders a camera/file picker per checklist item. When the user selects files, they are sent as `FormData` multipart to `POST /api/checklists/:id/images` with `machineIdx`, `catIdx`, and `itemIdx` in the form body.

2. **Multer processing:** The `multer` middleware validates MIME type against the whitelist (JPEG, PNG, WebP, HEIC, HEIF) and enforces a 10MB per-file size limit. See [[Input Validation]] for details.

3. **Count checks:** The route handler checks per-item (20) and per-checklist (200) image limits before proceeding.

4. **S3 upload:** Each file gets a unique key: `{checklistId}/{machineIdx}-{catIdx}-{itemIdx}/{timestamp}-{uuid8}-{originalname}`. The timestamp + UUID prefix prevents collisions.

5. **Atomic DynamoDB update:** `appendChecklistImages()` uses an `UpdateCommand` with `list_append` to atomically add the new keys to the item's `images` array in [[DynamoDB Tables]]. This avoids a read-modify-write race. It also appends an `Activity` record and resets `viewedAt` to null.

6. **WebSocket broadcast:** An `image_update` message is sent via the [[WebSocket System]] to all subscribers (except the uploader).

## Retrieval

Images are never served directly. The frontend requests presigned S3 URLs with a 1-hour expiry.

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
