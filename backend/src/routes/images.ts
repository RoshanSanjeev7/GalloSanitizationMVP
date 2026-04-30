import { Router } from 'express';
import multer from 'multer';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import crypto from 'node:crypto';
import { uploadImage, getImageUrl, getImageUrls, deleteImage, getPresignedPutUrl } from '../data/s3.js';
import { getChecklist, getUser, appendChecklistImages, removeChecklistImage } from '../data/dynamo.js';
import { getBroadcaster } from '../utils/broadcast.js';
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_FILE_SIZE,
  MAX_IMAGES_PER_UPLOAD,
  MAX_IMAGES_PER_ITEM,
  MAX_IMAGES_PER_CHECKLIST,
  MAX_IMAGE_URL_BATCH,
} from '../config/constants.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, WebP, and HEIC are allowed.'));
    }
  },
});

router.use(authMiddleware);

// ─── Presigned-URL upload flow ────────────────────────────────────────
// Two-phase upload that bypasses the API for the actual byte transfer.
// Required for Lambda hosting (6 MB request payload cap) and faster /
// cheaper than proxying multipart uploads through Express in any host.
//
// Phase 1: client describes the files it wants to upload; server
//          validates limits + MIME types and returns a presigned PUT URL
//          (and S3 key) for each. Server holds NO byte state.
// Phase 2: client PUTs each file directly to S3 against its presigned URL.
// Phase 3: client tells the server "I uploaded these keys"; server
//          atomically appends them to the checklist record and broadcasts
//          the WS update. Ownership of the keys is enforced via the
//          shared `<checklistId>/...` prefix that only this server could
//          have generated in phase 1.

interface PresignFileRequest {
  name: string;
  mimeType: string;
  size: number;
}

router.post('/:id/images/presign', async (req: AuthRequest, res) => {
  const id = req.params.id as string;
  const machineIdx = parseInt(req.body.machineIdx, 10);
  const catIdx = parseInt(req.body.catIdx, 10);
  const itemIdx = parseInt(req.body.itemIdx, 10);
  const files = req.body.files as PresignFileRequest[] | undefined;

  if (!Array.isArray(files) || files.length === 0) {
    res.status(400).json({ error: 'files array required' });
    return;
  }
  if (files.length > MAX_IMAGES_PER_UPLOAD) {
    res.status(400).json({ error: `Maximum ${MAX_IMAGES_PER_UPLOAD} files per upload` });
    return;
  }

  // Validate every requested file before minting any URLs — partial
  // pre-signing would leave the client with some valid keys that nothing
  // ever finalizes.
  for (const f of files) {
    if (!f || typeof f.name !== 'string' || typeof f.mimeType !== 'string' || typeof f.size !== 'number') {
      res.status(400).json({ error: 'each file must have name, mimeType, and size' });
      return;
    }
    if (!ALLOWED_IMAGE_TYPES.includes(f.mimeType)) {
      res.status(400).json({ error: `Unsupported MIME type: ${f.mimeType}` });
      return;
    }
    if (f.size > MAX_IMAGE_FILE_SIZE || f.size <= 0) {
      res.status(400).json({ error: `File size must be 1 byte to ${MAX_IMAGE_FILE_SIZE} bytes` });
      return;
    }
  }

  const checklist = await getChecklist(id);
  if (!checklist) {
    res.status(404).json({ error: 'Checklist not found' });
    return;
  }
  const machine = checklist.machines[machineIdx];
  const category = machine?.categories[catIdx];
  const item = category?.items[itemIdx];
  if (!item) {
    res.status(400).json({ error: 'Invalid machine/category/item index' });
    return;
  }

  // Per-item and per-checklist limits — enforced here so a client can't
  // request 100 presigns and PUT them all before /finalize would catch it.
  if ((item.images?.length || 0) + files.length > MAX_IMAGES_PER_ITEM) {
    res.status(400).json({ error: `Maximum ${MAX_IMAGES_PER_ITEM} images per item` });
    return;
  }
  const totalImages = checklist.machines.flatMap((m) =>
    m.categories.flatMap((c) => c.items.flatMap((i) => i.images || [])),
  ).length;
  if (totalImages + files.length > MAX_IMAGES_PER_CHECKLIST) {
    res.status(400).json({ error: `Maximum ${MAX_IMAGES_PER_CHECKLIST} images per checklist` });
    return;
  }

  // Generate keys + presigned URLs in parallel. Key prefix matches the
  // multipart endpoint's pattern so /image-urls and /:id/images/* work
  // identically across both upload paths.
  const uploads = await Promise.all(
    files.map(async (f) => {
      const uniqueId = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
      const key = `${id}/${machineIdx}-${catIdx}-${itemIdx}/${uniqueId}-${f.name}`;
      const putUrl = await getPresignedPutUrl(key, f.mimeType);
      return { key, putUrl, contentType: f.mimeType };
    }),
  );

  res.json({ uploads });
});

router.post('/:id/images/finalize', async (req: AuthRequest, res) => {
  const id = req.params.id as string;
  const machineIdx = parseInt(req.body.machineIdx, 10);
  const catIdx = parseInt(req.body.catIdx, 10);
  const itemIdx = parseInt(req.body.itemIdx, 10);
  const keys = req.body.keys as string[] | undefined;

  if (!Array.isArray(keys) || keys.length === 0) {
    res.status(400).json({ error: 'keys array required' });
    return;
  }
  // Ownership check: every key must live under the `<id>/` prefix.
  // Without this an attacker could finalize keys from another checklist.
  // The presigned URL itself only authorizes a single PUT to one key, so
  // this is the layer that prevents claim-jumping after upload.
  const invalid = keys.filter((k) => typeof k !== 'string' || !k.startsWith(`${id}/`));
  if (invalid.length > 0) {
    res.status(403).json({ error: 'Access denied to one or more provided keys' });
    return;
  }

  const checklist = await getChecklist(id);
  if (!checklist) {
    res.status(404).json({ error: 'Checklist not found' });
    return;
  }
  const machine = checklist.machines[machineIdx];
  const category = machine?.categories[catIdx];
  const item = category?.items[itemIdx];
  if (!item) {
    res.status(400).json({ error: 'Invalid machine/category/item index' });
    return;
  }

  // Re-check limits at finalize time. Client validation in /presign was
  // best-effort; another upload could have raced and won. If the limit
  // is now exceeded, reject — the client must delete some images first.
  if ((item.images?.length || 0) + keys.length > MAX_IMAGES_PER_ITEM) {
    res.status(400).json({ error: `Maximum ${MAX_IMAGES_PER_ITEM} images per item` });
    return;
  }

  const uploader = await getUser(req.userId!);
  const activity = {
    type: 'image' as const,
    by: uploader?.name || 'Unknown',
    at: new Date().toISOString(),
    detail: `${keys.length} photo${keys.length > 1 ? 's' : ''} added`,
  };

  await appendChecklistImages(id, machineIdx, catIdx, itemIdx, keys, activity);

  res.json({ images: [...(item.images || []), ...keys] });
  // Fire-and-forget: broadcast failures must not block the HTTP response.
  const bc = getBroadcaster(req);
  if (bc) {
    bc.broadcastToChecklist(
      id,
      {
        type: 'image_update',
        checklistId: id,
        machineIdx,
        catIdx,
        itemIdx,
        images: [...(item.images || []), ...keys],
        by: uploader?.name || 'Unknown',
        at: new Date().toISOString(),
      },
      req.userId,
    ).catch(() => {});
  }
});

// ─── Legacy multipart upload (deprecated) ─────────────────────────────
// The original multipart-form-data path. Kept for backward compatibility
// with older clients and as a fallback when the presigned flow can't
// reach S3 directly. New clients should prefer /presign + /finalize.
router.post(
  '/:id/images',
  upload.array('images', MAX_IMAGES_PER_UPLOAD),
  async (req: AuthRequest, res) => {
    const id = req.params.id as string;
    const machineIdx = parseInt(req.body.machineIdx, 10);
    const catIdx = parseInt(req.body.catIdx, 10);
    const itemIdx = parseInt(req.body.itemIdx, 10);

    const checklist = await getChecklist(id);
    if (!checklist) {
      res.status(404).json({ error: 'Checklist not found' });
      return;
    }

    const machine = checklist.machines[machineIdx];
    if (!machine) {
      res.status(400).json({ error: 'Invalid machine index' });
      return;
    }

    const category = machine.categories[catIdx];
    if (!category) {
      res.status(400).json({ error: 'Invalid category index' });
      return;
    }

    const item = category.items[itemIdx];
    if (!item) {
      res.status(400).json({ error: 'Invalid item index' });
      return;
    }

    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      res.status(400).json({ error: 'No files uploaded' });
      return;
    }

    // Per-item limit
    if ((item.images?.length || 0) + files.length > MAX_IMAGES_PER_ITEM) {
      res.status(400).json({ error: `Maximum ${MAX_IMAGES_PER_ITEM} images per item` });
      return;
    }

    // Per-checklist limit
    const totalImages = checklist.machines.flatMap(m =>
      m.categories.flatMap(c => c.items.flatMap(i => i.images || []))
    ).length;
    if (totalImages + files.length > MAX_IMAGES_PER_CHECKLIST) {
      res.status(400).json({ error: `Maximum ${MAX_IMAGES_PER_CHECKLIST} images per checklist` });
      return;
    }

    // Upload to S3 with unique keys (timestamp + random suffix prevents collisions)
    const newKeys: string[] = [];
    for (const file of files) {
      const uniqueId = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
      const key = `${id}/${machineIdx}-${catIdx}-${itemIdx}/${uniqueId}-${file.originalname}`;
      await uploadImage(key, file.buffer, file.mimetype);
      newKeys.push(key);
    }

    // Atomically append image keys (no read-modify-write race)
    const uploader = await getUser(req.userId!);
    const activity = {
      type: 'image' as const,
      by: uploader?.name || 'Unknown',
      at: new Date().toISOString(),
      detail: `${files.length} photo${files.length > 1 ? 's' : ''} added`,
    };

    await appendChecklistImages(id, machineIdx, catIdx, itemIdx, newKeys, activity);

    // Return updated images array
    res.json({ images: [...(item.images || []), ...newKeys] });
    // Fire-and-forget: broadcast failures must not block the HTTP response
    const bc = getBroadcaster(req);
    if (bc) bc.broadcastToChecklist(id, { type: 'image_update', checklistId: id, machineIdx, catIdx, itemIdx, images: [...(item.images || []), ...newKeys], by: uploader?.name || 'Unknown', at: new Date().toISOString() }, req.userId).catch(() => {});
  }
);

router.post('/:id/image-urls', async (req: AuthRequest, res) => {
  const id = req.params.id as string;
  const { keys } = req.body;
  if (!Array.isArray(keys) || keys.length === 0) {
    res.status(400).json({ error: 'keys array required' });
    return;
  }
  // Verify ownership: all keys must belong to this checklist
  const invalid = keys.filter((k: string) => !k.startsWith(`${id}/`));
  if (invalid.length > 0) {
    res.status(403).json({ error: 'Access denied to requested image keys' });
    return;
  }
  const cappedKeys = keys.slice(0, MAX_IMAGE_URL_BATCH);
  const urls = await getImageUrls(cappedKeys);
  res.json({ urls });
});

// Get a presigned URL for an image
router.get('/:id/images/*', async (req: AuthRequest, res) => {
  const key = req.params[0] as string;
  if (!key) {
    res.status(400).json({ error: 'Image key required' });
    return;
  }

  const url = await getImageUrl(key);
  res.json({ url });
});

router.delete('/:id/images', async (req: AuthRequest, res) => {
  const id = req.params.id as string;
  const { key, machineIdx, catIdx, itemIdx } = req.body;

  // Verify key ownership
  if (typeof key !== 'string' || !key.startsWith(`${id}/`)) {
    res.status(403).json({ error: 'Access denied to this image key' });
    return;
  }

  const checklist = await getChecklist(id);
  if (!checklist) {
    res.status(404).json({ error: 'Checklist not found' });
    return;
  }

  const item = checklist.machines[machineIdx]?.categories[catIdx]?.items[itemIdx];
  if (!item) {
    res.status(400).json({ error: 'Invalid item index' });
    return;
  }

  await deleteImage(key);
  const remainingImages = (item.images || []).filter((k: string) => k !== key);
  await removeChecklistImage(id, machineIdx, catIdx, itemIdx, remainingImages);

  res.json({ images: remainingImages });
  // Fire-and-forget
  const bc = getBroadcaster(req);
  if (bc) bc.broadcastToChecklist(id, { type: 'image_update', checklistId: id, machineIdx, catIdx, itemIdx, images: remainingImages, by: 'System', at: new Date().toISOString() }, req.userId).catch(() => {});
});

export default router;
