/**
 * DynamoDB-backed `Store` implementation for `express-rate-limit`.
 *
 * Why this exists: the default in-memory store is single-process. On
 * Lambda each invocation is a fresh container, so a malicious client
 * could trivially evade an in-memory limit by spreading requests across
 * cold starts. DynamoDB gives us a single source of truth that every
 * Lambda instance can hit cheaply.
 *
 * Storage shape (table `SanitizationRateLimits`, PK `pk`):
 *   { pk: 'ip:1.2.3.4' | 'user:u123', count: number, resetAt: number, ttl: number }
 *   `resetAt` and `ttl` are both epoch — `resetAt` in MS for the limiter,
 *   `ttl` in seconds for DynamoDB's auto-eviction.
 *
 * Atomicity: increments use a conditional UpdateItem ("ADD count :one
 * iff resetAt > :now"). If the condition fails (no row, or window
 * already expired), we PutItem a fresh count=1 row. The narrow race
 * window between failed-update and put is acceptable for rate limiting
 * — at worst one extra request slips through during window rollover.
 */

import {
  DynamoDBClient,
  UpdateItemCommand,
  PutItemCommand,
  DeleteItemCommand,
  ConditionalCheckFailedException,
} from '@aws-sdk/client-dynamodb';
import type { Store, ClientRateLimitInfo, IncrementResponse, Options } from 'express-rate-limit';
import { config } from '../config/env.js';

const client = new DynamoDBClient({
  region: config.aws.region,
  endpoint: config.aws.endpoint,
  credentials: config.aws.credentials,
});

export class DynamoDbRateLimitStore implements Store {
  private windowMs = 60_000;

  /** express-rate-limit calls this once with the middleware's options. */
  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  async increment(key: string): Promise<IncrementResponse> {
    const now = Date.now();
    const pk = `rl:${key}`;

    try {
      // Path 1: row exists AND window hasn't rolled over yet → atomic bump.
      const result = await client.send(
        new UpdateItemCommand({
          TableName: config.tables.rateLimits,
          Key: { pk: { S: pk } },
          UpdateExpression: 'ADD #count :one',
          ConditionExpression: 'attribute_exists(pk) AND #resetAt > :nowMs',
          ExpressionAttributeNames: { '#count': 'count', '#resetAt': 'resetAt' },
          ExpressionAttributeValues: {
            ':one': { N: '1' },
            ':nowMs': { N: now.toString() },
          },
          ReturnValues: 'ALL_NEW',
        }),
      );
      const count = parseInt(result.Attributes?.count?.N || '1', 10);
      const resetAt = parseInt(result.Attributes?.resetAt?.N || (now + this.windowMs).toString(), 10);
      return { totalHits: count, resetTime: new Date(resetAt) };
    } catch (err) {
      if (!(err instanceof ConditionalCheckFailedException)) throw err;

      // Path 2: row missing or window expired → start a fresh window.
      // Setting `ttl` ~60s past resetAt gives DynamoDB time to evict
      // without surprising any in-flight read of the just-written row.
      const resetAt = now + this.windowMs;
      await client.send(
        new PutItemCommand({
          TableName: config.tables.rateLimits,
          Item: {
            pk: { S: pk },
            count: { N: '1' },
            resetAt: { N: resetAt.toString() },
            ttl: { N: (Math.floor(resetAt / 1000) + 60).toString() },
          },
        }),
      );
      return { totalHits: 1, resetTime: new Date(resetAt) };
    }
  }

  async decrement(key: string): Promise<void> {
    const pk = `rl:${key}`;
    try {
      await client.send(
        new UpdateItemCommand({
          TableName: config.tables.rateLimits,
          Key: { pk: { S: pk } },
          UpdateExpression: 'ADD #count :neg',
          // Don't go negative — a decrement on a missing/zero counter is a
          // no-op rather than a phantom -1 that lets one extra request slip.
          ConditionExpression: 'attribute_exists(pk) AND #count > :zero',
          ExpressionAttributeNames: { '#count': 'count' },
          ExpressionAttributeValues: {
            ':neg': { N: '-1' },
            ':zero': { N: '0' },
          },
        }),
      );
    } catch (err) {
      if (!(err instanceof ConditionalCheckFailedException)) throw err;
    }
  }

  async resetKey(key: string): Promise<void> {
    const pk = `rl:${key}`;
    await client.send(
      new DeleteItemCommand({
        TableName: config.tables.rateLimits,
        Key: { pk: { S: pk } },
      }),
    );
  }

  /**
   * Optional read-only fetch (used by `Retry-After` header generation in
   * some configs). Not strictly required, but cheap to implement.
   */
  async get(_key: string): Promise<ClientRateLimitInfo | undefined> {
    // express-rate-limit's typings allow this to be undefined; the only
    // caller path that matters (`increment`) doesn't depend on it. Skip
    // the extra DynamoDB read.
    return undefined;
  }
}
