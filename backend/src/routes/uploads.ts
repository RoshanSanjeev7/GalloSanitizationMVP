import { Router } from 'express';
import multer from 'multer';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync, readFileSync, unlinkSync } from 'fs';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../config/env.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = resolve(__dirname, '../../uploads');

if (!existsSync(UPLOAD_DIR)) {
  mkdirSync(UPLOAD_DIR, { recursive: true });
}

// S3 client (only initialized if credentials are provided)
const s3Client = config.awsRegion && config.s3Bucket
  ? new S3Client({ region: config.awsRegion })
  : null;

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = file.originalname.split('.').pop() || 'jpg';
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

const router = Router();

router.use(authMiddleware);

router.post('/', upload.single('photo'), async (req: AuthRequest, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }

  // If S3 is configured, upload there
  if (s3Client && config.s3Bucket) {
    try {
      const fileBuffer = readFileSync(req.file.path);
      const key = `photos/${req.file.filename}`;

      await s3Client.send(new PutObjectCommand({
        Bucket: config.s3Bucket,
        Key: key,
        Body: fileBuffer,
        ContentType: req.file.mimetype,
      }));

      // Delete local file after S3 upload
      unlinkSync(req.file.path);

      // Return S3 URL
      const url = `https://${config.s3Bucket}.s3.${config.awsRegion}.amazonaws.com/${key}`;
      res.json({ url });
      return;
    } catch (err) {
      console.error('S3 upload failed:', err);
      // Fall back to local storage
    }
  }

  // Local storage fallback
  const url = `/api/uploads/${req.file.filename}`;
  res.json({ url });
});

export default router;
