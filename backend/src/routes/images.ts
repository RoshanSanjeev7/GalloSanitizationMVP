import { Router } from 'express';
import multer from 'multer';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import { uploadImage, getImageUrl, deleteImage } from '../data/s3.js';
import { getChecklist, putChecklist } from '../data/dynamo.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.use(authMiddleware);

// Upload images for a checklist item
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

    const newKeys: string[] = [];
    for (const file of files) {
      const timestamp = Date.now();
      const key = `${id}/${machineIdx}-${catIdx}-${itemIdx}/${timestamp}-${file.originalname}`;
      await uploadImage(key, file.buffer, file.mimetype);
      newKeys.push(key);
    }

    if (!item.images) item.images = [];
    item.images.push(...newKeys);
    await putChecklist(checklist);

    res.json({ images: item.images });
  }
);

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

// Delete an image from a checklist item
router.delete('/:id/images', async (req: AuthRequest, res) => {
  const id = req.params.id as string;
  const { key, machineIdx, catIdx, itemIdx } = req.body;

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
  item.images = (item.images || []).filter((k: string) => k !== key);
  await putChecklist(checklist);

  res.json({ images: item.images });
});

export default router;
