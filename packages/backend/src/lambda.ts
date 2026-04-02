import serverless from 'serverless-http';
import express from 'express';
import cors from 'cors';
import { config } from './config/env.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import lineRoutes from './routes/lines.js';
import templateRoutes from './routes/templates.js';
import checklistRoutes from './routes/checklists.js';
import imageRoutes from './routes/images.js';

const app = express();

app.use(cors({ origin: config.frontendOrigin, credentials: true }));
app.use(express.json());

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
app.use('/api/checklists', imageRoutes);

export const handler = serverless(app);
