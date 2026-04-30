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
  // Active whenever this process runs inside AWS Lambda (every deployed
  // environment) — regardless of NODE_ENV label. Skipped only for local
  // `npm run dev` and unit/E2E tests so they don't trip on rapid-fire
  // requests. AWS Lambda always sets `AWS_LAMBDA_FUNCTION_NAME`; nothing
  // local does. Each limiter uses its OWN DynamoDB store instance so
  // the windowMs passed to the store via init() matches the one
  // declared on the limiter (a shared store would mix windows from
  // different limiters).
  const isLambda = !!process.env.AWS_LAMBDA_FUNCTION_NAME;
  const isProduction = isLambda || process.env.NODE_ENV === 'production';

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
        windowMs: 5 * 60 * 1000,
        max: 10,
        // Only count *failed* logins. Successful logins (200 OK) shouldn't
        // chip away at the bucket — otherwise an admin who logs in/out a
        // few times during testing locks themselves out, which is the
        // exact incident this comment is named after. Brute-force
        // protection still applies because every attempt with a wrong
        // password hits the bucket.
        skipSuccessfulRequests: true,
        store: new DynamoDbRateLimitStore(),
        message: { error: 'Too many failed login attempts, please try again in a few minutes' },
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
