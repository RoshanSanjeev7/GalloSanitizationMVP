import { Router } from 'express';
import multer from 'multer';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import crypto from 'node:crypto';
import { uploadImage, getImageUrl, getImageUrls, deleteImage } from '../data/s3.js';
import { getChecklist, getUser, appendChecklistImages, removeChecklistImage } from '../data/dynamo.js';
import type { WebSocketBroadcaster } from '../ws/broadcaster.js';

function getBroadcaster(req: AuthRequest): WebSocketBroadcaster | null {
  return req.app.get('broadcaster') || null;
}

const router = Router();
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, WebP, and HEIC are allowed.'));
    }
  },
});

router.use(authMiddleware);

router.post(
  '/:id/images',
  upload.array('images', 10),
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

    // Per-item limit: 20 images
    if ((item.images?.length || 0) + files.length > 20) {
      res.status(400).json({ error: 'Maximum 20 images per item' });
      return;
    }

    // Per-checklist limit: 200 images
    const totalImages = checklist.machines.flatMap(m =>
      m.categories.flatMap(c => c.items.flatMap(i => i.images || []))
    ).length;
    if (totalImages + files.length > 200) {
      res.status(400).json({ error: 'Maximum 200 images per checklist' });
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
  const cappedKeys = keys.slice(0, 50);
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
  const bc = getBroadcaster(req);
  if (bc) bc.broadcastToChecklist(id, { type: 'image_update', checklistId: id, machineIdx, catIdx, itemIdx, images: remainingImages, by: 'System', at: new Date().toISOString() }, req.userId).catch(() => {});
});

export default router;
