---
tags:
  - backend
  - frontend
---

# Image Handling

Operators can attach photos to individual checklist items. The system supports upload, retrieval via presigned URLs, and deletion, all with atomic DynamoDB updates and WebSocket broadcasting.

## Upload Flow

1. **Frontend:** `ChecklistFill` renders a camera/file picker per checklist item. When the user selects files, they're sent as `FormData` multipart to `POST /api/checklists/:id/images` with `machineIdx`, `catIdx`, and `itemIdx` in the form body.

2. **Multer processing:** The `multer` middleware validates MIME type against the whitelist (JPEG, PNG, WebP, HEIC, HEIF) and enforces a 10MB per-file size limit. See [[Input Validation]] for details.

3. **Count checks:** The route handler checks per-item (20) and per-checklist (200) image limits before proceeding.

4. **S3 upload:** Each file gets a unique key: `{checklistId}/{machineIdx}-{catIdx}-{itemIdx}/{timestamp}-{uuid8}-{originalname}`. The timestamp + UUID prefix prevents collisions even if the same file is uploaded twice in rapid succession. The file buffer and MIME type are passed to `uploadImage()` in `data/s3.ts`.

5. **Atomic DynamoDB update:** `appendChecklistImages()` uses an `UpdateCommand` with `list_append` to atomically add the new keys to the item's `images` array:

```typescript
SET ${imgPath} = list_append(if_not_exists(${imgPath}, :empty), :keys)
```

This avoids a read-modify-write race -- no need to read the current images, append, and write back. It also appends an `Activity` record and resets `viewedAt` to null (so admins see it as new activity).

6. **[[WebSocket System]] broadcast:** An `image_update` message is sent to all subscribers of that checklist (except the uploader), containing the full updated images array for that item.

## Retrieval

Images are never served directly. The frontend requests presigned S3 URLs with a 1-hour expiry.

**Single URL:** `GET /api/checklists/:id/images/:key` returns `{ url: "https://..." }`.

**Batch URLs:** `POST /api/checklists/:id/image-urls` accepts a `keys` array (max 50) and returns `{ urls: { key1: url1, key2: url2, ... } }`. The `useImageUrlsForMachines` hook on the frontend uses this batch endpoint to load all images for the active machine tab in one request.

Both endpoints verify key ownership -- every key must start with `${checklistId}/`. This prevents cross-checklist image access.

## Deletion

`DELETE /api/checklists/:id/images` accepts `{ key, machineIdx, catIdx, itemIdx }`. The handler:

1. Verifies key ownership (`key.startsWith(id + '/')`)
2. Deletes the object from S3
3. Computes the remaining images (filtering out the deleted key)
4. Updates DynamoDB with `removeChecklistImage()`, which `SET`s the item's images array to the remaining list
5. Broadcasts an `image_update` via WebSocket

## Frontend State

The `useImageUrlsForMachines` hook tracks which image keys need URLs, fetches them in batches, and caches the presigned URLs. When the active machine tab changes, it fetches URLs for the new machine's images. URLs are cached for the session to avoid redundant requests (presigned URLs are valid for 1 hour).

During upload, an `uploading` state map keyed by item identifier shows a spinner on the affected item. After upload completes, the new image keys are added to local state and the hook fetches their presigned URLs.

## See also

- [[DynamoDB Tables]] -- the Checklists table's nested images arrays
- [[Input Validation]] -- MIME whitelist and count limits
- [[WebSocket System]] -- `image_update` broadcast on upload/delete
