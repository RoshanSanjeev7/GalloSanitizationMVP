/**
 * Lambda handler for the HTTP API.
 *
 * Wraps the Express app from `app.ts` with `serverless-http` so every
 * route, middleware, and handler runs unchanged inside a Lambda invocation
 * triggered by API Gateway HTTP API.
 *
 * Cold start strategy:
 *   - The Express app and broadcaster are built ONCE (in `bootstrap()`)
 *     and cached on the module so warm invocations skip construction
 *     entirely. AWS keeps the container alive between requests when
 *     traffic is steady.
 *   - Seed is intentionally NOT run here — production data is real,
 *     `seedIfEmpty()` belongs to local dev (`index.ts`) only.
 *   - The WebSocket broadcaster is `ApiGatewayBroadcaster` (selected via
 *     `WS_MODE=apigw`); its `init()` only sets up the AWS Management API
 *     client, no HTTP server binding needed in Lambda mode.
 *
 * Configuration:
 *   - `WS_MODE=apigw` — selects the API Gateway broadcaster.
 *   - `APIGW_WS_ENDPOINT=https://<api-id>.execute-api.<region>.amazonaws.com/<stage>`
 *     — the management endpoint for posting back to WebSocket clients.
 *
 * Local dev does NOT use this entry point — `npm run dev` runs `index.ts`
 * (long-lived Node + the local `ws` server). This file is built and
 * deployed via the IaC defined in `infrastructure/`.
 */

import serverless from 'serverless-http';
import { createApp } from './app.js';
import { createBroadcaster } from './ws/broadcaster.js';
import { config } from './config/env.js';

type LambdaHandler = (event: object, context: object) => Promise<object>;

let cachedHandler: LambdaHandler | null = null;
let bootstrapPromise: Promise<LambdaHandler> | null = null;

async function bootstrap(): Promise<LambdaHandler> {
  const app = createApp();
  const broadcaster = await createBroadcaster(config.wsMode);
  // ApiGatewayBroadcaster.init() ignores the server argument and just
  // configures the AWS client. LocalWsBroadcaster.init() WOULD need a
  // server, but Lambda mode should never instantiate the local one.
  broadcaster.init();
  app.set('broadcaster', broadcaster);
  return serverless(app) as LambdaHandler;
}

export async function handler(event: object, context: object): Promise<object> {
  // Single-flight bootstrap: if multiple requests race during a cold start,
  // they all await the same promise rather than building the app twice.
  if (!cachedHandler) {
    if (!bootstrapPromise) bootstrapPromise = bootstrap();
    cachedHandler = await bootstrapPromise;
  }
  return cachedHandler(event, context);
}
