import express from 'express';
import cors from 'cors';
import { config } from './config/env.js';
import { load } from './data/store.js';
import { seedIfEmpty } from './data/seed.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import lineRoutes from './routes/lines.js';
import templateRoutes from './routes/templates.js';
import checklistRoutes from './routes/checklists.js';

const app = express();

app.use(cors({ origin: config.frontendOrigin, credentials: true }));
app.use(express.json());

// Load data from file
load();
seedIfEmpty();

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/lines', lineRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/checklists', checklistRoutes);

app.listen(config.port, () => {
  console.log(`Backend running on http://localhost:${config.port}`);
});
