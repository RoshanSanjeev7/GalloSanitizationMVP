---
tags: [subsystem]
created: 2026-04-13
updated: 2026-04-13
---

# Error Handling

Unified view of how errors are handled across the backend and frontend. This page covers HTTP error codes, backend error patterns, frontend error patterns, and failure modes.

## HTTP Error Codes

| Code | Meaning | When Used |
|------|---------|-----------|
| 400 | Validation failure | Missing required fields, invalid machine index, invalid machines structure, invalid file type, image limits exceeded |
| 401 | Authentication failure | Invalid credentials on login, expired/missing JWT in `authMiddleware` |
| 403 | Authorization failure | Non-admin hitting `adminOnly` endpoints, accessing image keys from another checklist |
| 404 | Not found / deleted | Checklist, user, line, template, or factory does not exist; also returned when `conditionalDeleteChecklist` fails (item already deleted) |
| 409 | Conflict / duplicate | `ConditionalCheckFailedException` from [[Optimistic Concurrency]], `TransactionCanceledException` from [[Email Uniqueness]], in-progress checklist already exists for a line |
| 413 | Body too large | Express body-parser limit (10MB default) or multer file size limit (10MB per image) |
| 429 | Rate limited | `express-rate-limit` returns this when request count exceeds the window threshold (see [[Rate Limiting]]) |

All error responses use a consistent shape: `{ "error": "Human-readable message" }`. Some 409 responses include extra fields (e.g., `existingId` when a duplicate in-progress checklist is found).

## Backend Error Patterns

### ConditionalCheckFailedException to 409

Every conditional DynamoDB write (version checks, status transitions, existence checks) can throw `ConditionalCheckFailedException`. The route handlers catch this by name and return 409:

```typescript
} catch (err: unknown) {
  if (err instanceof Error && err.name === 'ConditionalCheckFailedException') {
    res.status(409).json({ error: 'Checklist has been modified by another user. Please refresh.' });
    return;
  }
  throw err;  // Re-throw unexpected errors
}
```

This pattern appears in `PUT /checklists/:id/items`, `PUT /checklists/:id/machines/:machineIdx`, `POST /checklists/:id/submit`, `POST /checklists/:id/approve`, `POST /checklists/:id/deny`, and `DELETE /checklists/:id`. See [[Optimistic Concurrency]] and [[Concurrency Scenarios]] for details.

### TransactionCanceledException to 409

User creation uses `TransactWriteCommand` to atomically create both the user record and an `EMAIL#` lock item. If the email already exists, the transaction is cancelled and the handler returns 409:

```typescript
} catch (err: unknown) {
  if (err instanceof Error && err.name === 'TransactionCanceledException') {
    res.status(409).json({ error: 'Email already exists' });
    return;
  }
  throw err;
}
```

See [[Email Uniqueness]] for the full transaction design.

### Fire-and-Forget for Audit and Broadcast

After successful HTTP responses, audit logging and WebSocket broadcasting use `.catch(() => {})` to ensure failures do not block or error the response:

```typescript
logAudit({ ... }).catch(() => {});
bc.broadcastToChecklist(checklist.id, { ... }, req.userId).catch(() => {});
```

This is intentional -- audit and broadcast are best-effort side effects. If DynamoDB or the WebSocket layer is temporarily down, the primary operation (create, update, approve, etc.) still succeeds and the client gets a normal response. The tradeoff is that audit entries or real-time updates may silently be lost.

### Unhandled Errors

Errors that don't match `ConditionalCheckFailedException` or `TransactionCanceledException` are re-thrown with `throw err`, which lets Express's default error handler return 500. There is no global error-handling middleware with custom formatting -- unhandled errors produce Express's default HTML error page in development.

## Frontend Error Patterns

### 401 -- Clear Auth and Redirect

The API client in `services/api.ts` intercepts 401 responses globally. When received, it clears the auth token from `localStorage` and the Redux store, then redirects to `/login`. This handles JWT expiry transparently.

### 409 -- Conflict Banner

When a save returns 409 (version mismatch), the [[Auto-Save and Conflict Resolution]] system shows a conflict banner with a "Reload" button. The user must reload to get the latest version before continuing edits. The [[Offline Queue]] discards 409 entries on the assumption they are stale.

### 404 -- Deleted Banner

When a checklist returns 404 or the WebSocket delivers a `checklist_deleted` message, the page shows a "This checklist has been deleted" banner and redirects the user back to the dashboard after a brief delay. The `useChecklistSync` hook tracks this via its `isDeleted` state.

### Network Failure

When a save fails with a network error (no HTTP status), the save status indicator shows "error". If the [[Offline Queue]] is available, the failed save is queued to IndexedDB for retry when the connection is restored. The `useOfflineQueue` hook listens for the `online` event and automatically replays the queue.

### ErrorBoundary

The `ErrorBoundary` component wraps all lazily-loaded routes in `App.tsx`. It catches React render crashes (e.g., accessing a property on undefined data) and displays a fallback UI instead of a blank screen. This prevents a single page crash from taking down the entire application.

## Failure Modes

### DynamoDB Down

If DynamoDB is unreachable, all API calls fail with 500. The frontend shows error states on every data-fetching component. No data can be read or written. Recovery is automatic once DynamoDB is reachable again.

### S3 Upload Succeeds but DynamoDB Update Fails

Image upload first writes the file to S3, then atomically appends the image key to DynamoDB via `appendChecklistImages`. If the DynamoDB write fails after the S3 upload, the image file is orphaned in S3 with no reference in the checklist data. There is no cleanup or reconciliation mechanism. This is a [[Known Limitations]] item.

### WebSocket Broadcaster Init Fails

If the WebSocket broadcaster cannot be initialized (e.g., the `getBroadcaster(req)` helper returns null), all real-time features (item syncing, presence, status change notifications) are silently disabled. The application continues to work in a polling-free, refresh-to-see-updates mode. This is graceful degradation by design.

### PDF Generation Fails Mid-Stream

The PDF endpoint streams the document directly to the HTTP response via `doc.pipe(res)`. If PDFKit throws an error partway through generation, a partial or broken PDF is sent to the client. There is no buffering, retry, or error recovery -- the client receives whatever bytes were written before the failure.

## See also

- [[Optimistic Concurrency]] -- the version-check pattern that produces most 409 errors
- [[Offline Queue]] -- how network failures are handled client-side
- [[Known Limitations]] -- MVP shortcuts including orphaned S3 images and plaintext passwords
