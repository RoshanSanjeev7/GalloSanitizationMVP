/**
 * Express app factory — pure construction, no side effects.
 *
 * This module builds the HTTP API surface (middleware + routes) and returns
 * the Express `app`. It deliberately does NOT:
 *   - Call `app.listen()` — entry points (local-server in `index.ts`,
 *     Lambda handler in `lambda-api.ts`) decide how the app runs.
 *   - Seed the database — that belongs to dev startup, not production.
 *   - Initialize the WebSocket broadcaster — broadcasters are attached
 *     after construction via `app.set('broadcaster', ...)`. Routes read
 *     it back through `backend/src/utils/broadcast.ts`.
 *
 * Keeping this file side-effect-free is what makes the same Express app
 * runnable as a long-lived Node process locally and as a per-request
 * Lambda invocation in production.
 */

import express from 'express';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { config } from './config/env.js';
import { DynamoDbRateLimitStore } from './middleware/rate-limit-store.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import lineRoutes from './routes/lines.js';
import templateRoutes from './routes/templates.js';
import checklistRoutes from './routes/checklists.js';
import imageRoutes from './routes/images.js';
import auditRoutes from './routes/audit.js';
import factoryRoutes from './routes/factories.js';

export function createApp(): express.Express {
  const app = express();

  app.use(cors({ origin: config.frontendOrigin, credentials: true }));
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));

  // ─── RATE LIMITING ─────────────────────────────────────────────────
  // Skipped in dev/test to keep E2E tests fast; only on in production.
  // Each limiter uses its OWN DynamoDB store instance so the windowMs
  // passed to the store via init() matches the one declared on the
  // limiter (a shared store would mix windows from different limiters).
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction) {
    const globalLimiter = rateLimit({
      windowMs: 60 * 1000,
      max: 100,
      standardHeaders: true,
      legacyHeaders: false,
      store: new DynamoDbRateLimitStore(),
      message: { error: 'Too many requests, please try again later' },
    });
    app.use(globalLimiter);
  }

  const loginLimiter = isProduction
    ? rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 10,
        store: new DynamoDbRateLimitStore(),
        message: { error: 'Too many login attempts, please try again later' },
      })
    : (_req: express.Request, _res: express.Response, next: express.NextFunction) => next();

  const checklistCreateLimiter = isProduction
    ? rateLimit({
        windowMs: 60 * 1000,
        max: 5,
        store: new DynamoDbRateLimitStore(),
        message: { error: 'Too many checklists created, please slow down' },
      })
    : (_req: express.Request, _res: express.Response, next: express.NextFunction) => next();

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/auth/login', loginLimiter);
  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/lines', lineRoutes);
  app.use('/api/templates', templateRoutes);
  app.post('/api/checklists', checklistCreateLimiter);
  app.use('/api/checklists', checklistRoutes);
  app.use('/api/checklists', imageRoutes);
  app.use('/api/audit', auditRoutes);
  app.use('/api/factories', factoryRoutes);

  return app;
}
