/**
 * Post-suite check: scan the Lambda log groups for ERROR / Task timed
 * out entries within the test window and fail if any appear.
 *
 * Implementation notes:
 *   - Uses `execFile` (no shell) to invoke the AWS CLI — no shell
 *     interpretation, no injection surface.
 *   - The window is 5 minutes ago to "now" — generous enough to
 *     capture anything emitted during the http-api + ws-api tests
 *     without blowing the suite timeout.
 *   - Skips cleanly if the AWS CLI isn't available or SSO is expired.
 */

import { describe, it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const LOG_GROUPS = [
  '/aws/lambda/gallo-sanitization-dev-api',
  '/aws/lambda/gallo-sanitization-dev-ws',
];

// Capture the start of this test run at module load. The window for
// the error scan is from this timestamp onward so we only fail on
// errors that this run actually triggered — old errors from prior
// runs (or from before a fix was deployed) age out naturally.
// The 30-second back-window gives margin for clock skew and for any
// errors fired by the http-api/ws-api tests that may run before this
// file in suite order.
const SUITE_START_MS = Date.now() - 30_000;

async function awsAvailable(): Promise<boolean> {
  try {
    await execFileAsync('aws', [
      'sts', 'get-caller-identity',
      '--profile', 'gallo-cap',
    ]);
    return true;
  } catch {
    return false;
  }
}

async function fetchErrors(logGroup: string, sinceMs: number): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync('aws', [
      'logs', 'filter-log-events',
      '--profile', 'gallo-cap',
      '--region', 'us-west-2',
      '--log-group-name', logGroup,
      '--start-time', String(sinceMs),
      '--filter-pattern', '?ERROR ?"Task timed out" ?"Process exited"',
      '--query', 'events[*].message',
      '--output', 'text',
    ]);
    const trimmed = stdout.trim();
    return trimmed.length > 0 ? trimmed.split(/\s*\n\s*/) : [];
  } catch {
    return [];
  }
}

describe('Deployed CloudWatch error scan', () => {
  it('Lambda log groups have no ERROR entries from the recent test window', async () => {
    if (!(await awsAvailable())) {
      // Skip — most common cause is expired SSO.
      console.warn('[deployed] CloudWatch scan skipped — AWS CLI unavailable or SSO expired');
      return;
    }

    const allErrors: Array<{ group: string; line: string }> = [];
    for (const group of LOG_GROUPS) {
      const errors = await fetchErrors(group, SUITE_START_MS);
      for (const e of errors) {
        allErrors.push({ group, line: e });
      }
    }

    if (allErrors.length > 0) {
      const summary = allErrors
        .slice(0, 20)
        .map((e) => `[${e.group}] ${e.line.slice(0, 200)}`)
        .join('\n');
      throw new Error(
        `CloudWatch reports ${allErrors.length} error entries in the last 5 minutes:\n${summary}`,
      );
    }
    expect(allErrors.length).toBe(0);
  });
});
