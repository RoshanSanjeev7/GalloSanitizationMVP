import express from 'express';
import cors from 'cors';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { config } from './config/env.js';
import { load } from './data/store.js';
import { seedIfEmpty } from './data/seed.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import lineRoutes from './routes/lines.js';
import templateRoutes from './routes/templates.js';
import checklistRoutes from './routes/checklists.js';
import notificationRoutes from './routes/notifications.js';
import uploadRoutes from './routes/uploads.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();

app.use(cors({ origin: config.frontendOrigin, credentials: true }));
app.use(express.json({ limit: '20mb' }));

load();
seedIfEmpty();

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/uploads', express.static(resolve(__dirname, '../uploads')));
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/lines', lineRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/checklists', checklistRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/uploads', uploadRoutes);

app.listen(config.port, () => {
  console.log(`Backend running on http://localhost:${config.port}`);
});
