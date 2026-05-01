/**
 * Shared utilities + endpoints for the deployed-AWS smoke suite.
 *
 * Cost-optimization principles enforced here:
 *   - One JWT per suite invocation, cached in module scope and reused
 *     across every test (vs. logging in per-test, which is 30+ Lambda
 *     invocations of the auth route)
 *   - Constants for the small set of canonical IDs we touch — pin them
 *     so we don't accidentally create per-test data
 *
 * The endpoints are pinned to the deployed dev stack. If the API IDs
 * change (re-create the stack from scratch), update both here AND the
 * frontend's VITE_WS_URL build. They're surfaced as Terraform outputs
 * — see infrastructure/outputs.tf.
 */

export const HTTP_API = 'https://3j62zhgkj3.execute-api.us-west-2.amazonaws.com';
export const WS_API = 'wss://sh3h9ijmza.execute-api.us-west-2.amazonaws.com/prod';

export const ADMIN_EMAIL = 'ymartinez@gallo.com';
export const ADMIN_PASSWORD = 'admin123';

let cachedAdminToken: string | null = null;

/**
 * Get a valid admin JWT, cached for the suite lifetime. The first
 * call performs the only `/api/auth/login` invocation per `npm run
 * test:deployed`; every subsequent call returns the cached token.
 */
export async function getAdminToken(): Promise<string> {
  if (cachedAdminToken) return cachedAdminToken;
  const res = await fetch(`${HTTP_API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  if (!res.ok) {
    throw new Error(`getAdminToken: HTTP ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as { token: string };
  cachedAdminToken = body.token;
  return body.token;
}

/** Standard JSON fetch with bearer auth. */
export async function authedFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = await getAdminToken();
  return fetch(`${HTTP_API}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Sleep helper. Used sparingly — prefer assertion polling — but
 * required when waiting on eventually-consistent broadcasts.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
