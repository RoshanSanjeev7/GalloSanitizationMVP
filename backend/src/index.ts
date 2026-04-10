import express from 'express';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { config } from './config/env.js';
import { seedIfEmpty } from './data/seed-dynamo.js';
import { createBroadcaster } from './ws/broadcaster.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import lineRoutes from './routes/lines.js';
import templateRoutes from './routes/templates.js';
import checklistRoutes from './routes/checklists.js';
import imageRoutes from './routes/images.js';

const app = express();

app.use(cors({ origin: config.frontendOrigin, credentials: true }));
app.use(compression());
app.use(express.json({ limit: '1mb' }));

// ─── RATE LIMITING ─────────────────────────────────────────────────
// Skip rate limiting in development/test to avoid breaking E2E tests.
// In production, these protect against brute force and API abuse.
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction) {
  const globalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later' },
  });
  app.use(globalLimiter);
}

const loginLimiter = isProduction
  ? rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 10,
      message: { error: 'Too many login attempts, please try again later' },
    })
  : (_req: express.Request, _res: express.Response, next: express.NextFunction) => next();

const checklistCreateLimiter = isProduction
  ? rateLimit({
      windowMs: 60 * 1000,
      max: 5,
      message: { error: 'Too many checklists created, please slow down' },
    })
  : (_req: express.Request, _res: express.Response, next: express.NextFunction) => next();

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Routes with targeted rate limiters
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/lines', lineRoutes);
app.use('/api/templates', templateRoutes);
app.post('/api/checklists', checklistCreateLimiter);
app.use('/api/checklists', checklistRoutes);
app.use('/api/checklists', imageRoutes);

// Seed on startup (skip in test and production environments), then listen
if (!process.env.VITEST) {
  const startServer = async () => {
    const server = app.listen(config.port, () => {
      console.log(`Backend running on http://localhost:${config.port}`);
    });

    // Initialize WebSocket broadcaster
    const broadcaster = await createBroadcaster(config.wsMode);
    broadcaster.init(server);
    app.set('broadcaster', broadcaster);
    console.log(`WebSocket mode: ${config.wsMode}`);
  };

  if (process.env.NODE_ENV === 'production') {
    startServer();
  } else {
    seedIfEmpty().then(startServer);
  }
}

export { app };
