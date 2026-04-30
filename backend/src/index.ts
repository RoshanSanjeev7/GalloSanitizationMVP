/**
 * Local development server entry point.
 *
 * This file exists ONLY for `npm run dev` and `npm run start` (long-lived
 * Node process). The Express app itself lives in `app.ts` so the Lambda
 * handler in `lambda-api.ts` can mount the same routes without running
 * the seed step or starting an HTTP listener.
 *
 * Responsibilities of this file:
 *   - Seed DynamoDB if empty (dev convenience; never runs in NODE_ENV=production
 *     because prod data is real).
 *   - Bind the Express app to `config.port`.
 *   - Initialize the local WebSocket broadcaster (which attaches a `ws`
 *     server to the same HTTP server). In Lambda mode, the equivalent is
 *     API Gateway WebSocket + per-route Lambdas — handled separately.
 *
 * Vitest sets `process.env.VITEST`, which short-circuits the bootstrap so
 * importing this module in tests doesn't open a port.
 */

import { createApp } from './app.js';
import { config } from './config/env.js';
import { seedIfEmpty } from './data/seed-dynamo.js';
import { createBroadcaster } from './ws/broadcaster.js';

const app = createApp();

if (!process.env.VITEST) {
  const startServer = async () => {
    const server = app.listen(config.port, () => {
      console.log(`Backend running on http://localhost:${config.port}`);
    });

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
