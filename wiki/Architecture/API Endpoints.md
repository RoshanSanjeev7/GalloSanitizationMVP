---
tags: [architecture]
created: 2026-04-09
updated: 2026-04-13
---

# API Endpoints

All endpoints are prefixed with `/api`. Every endpoint except `POST /api/auth/login` requires a valid JWT (see [[Authentication]]). Admin-only endpoints additionally require `role: 'admin'` in the token.

## Auth

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/login` | None | Validate credentials, return JWT + user |
| POST | `/auth/refresh` | JWT | Issue a fresh 8h token |
| GET | `/auth/me` | JWT | Return current user's profile |

## Users

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/users` | JWT | List all users (paginated, max 100) |
| POST | `/users` | Admin | Create user with [[Email Uniqueness]] transaction |
| PUT | `/users/:id` | Admin | Update role (with [[Admin Safety]] checks) |
| DELETE | `/users/:id` | Admin | Delete user + email lock (with self-delete and last-admin guards) |

## Lines

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/lines` | JWT | List all production lines |
| POST | `/lines` | Admin | Create a new production line |

## Templates

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/templates` | JWT | List all templates |
| GET | `/templates/:id` | JWT | Get a single template |
| POST | `/templates` | Admin | Create template |
| PUT | `/templates/:id` | Admin | Update template |
| DELETE | `/templates/:id` | Admin | Delete template |
| POST | `/templates/:id/publish` | Admin | Publish or unpublish template (see [[Template Publishing]]) |

## Checklists

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/checklists` | JWT | List checklists (filterable by status, operatorId, lineId, search, date; paginated) |
| GET | `/checklists/notifications` | Admin | Submitted + in-progress checklists for admin notification bell |
| POST | `/checklists/mark-all-viewed` | Admin | Atomically mark all submitted + in_progress checklists as viewed |
| GET | `/checklists/:id` | JWT | Get single checklist (auto-marks viewed for admin) |
| POST | `/checklists` | JWT | Create checklist from line's template (409 if in-progress exists for line) |
| PUT | `/checklists/:id/items` | JWT | Update all machines (uses [[Optimistic Concurrency]]) |
| PUT | `/checklists/:id/machines/:machineIdx` | JWT | Update single machine (uses [[Per-Machine Auto-Save]]) |
| POST | `/checklists/:id/submit` | JWT | Submit (conditional on `in_progress` + version) |
| POST | `/checklists/:id/approve` | Admin | Approve (conditional on `submitted` + version) |
| POST | `/checklists/:id/deny` | Admin | Deny (conditional on `submitted` + version) |
| DELETE | `/checklists/:id` | Admin | Delete (conditional on existence) |
| GET | `/checklists/:id/pdf/status` | Admin | Check if cached PDF is available |
| GET | `/checklists/:id/pdf` | Admin | Generate and stream PDF report |

The submit, approve, and deny endpoints all use `conditionalStatusTransition` which checks both the expected status and version. This is described in detail in [[Optimistic Concurrency]].

## Images

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/checklists/:id/images` | JWT | Upload images (multipart, max 10 files, 10MB each) |
| POST | `/checklists/:id/image-urls` | JWT | Batch get presigned S3 URLs (max 50) |
| GET | `/checklists/:id/images/*` | JWT | Get single presigned URL |
| DELETE | `/checklists/:id/images` | JWT | Delete image from S3 and DynamoDB |

Image uploads go through [[Input Validation]] for MIME type checking and count limits. See [[Image Handling]] for the full upload/retrieval/delete lifecycle.

## Audit

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/audit` | Admin | Query audit log (filterable by userId, action, date range; paginated) |

## Common Patterns

**Pagination:** All list endpoints accept `limit` (capped at 100) and `offset` parameters, returning `{ items, total, hasMore }`.

**Error responses:** Consistent `{ error: "message" }` shape. 409 for concurrency conflicts (see [[Concurrency Scenarios]]), 403 for insufficient role, 400 for validation failures, 404 for missing resources.

**[[Input Validation]]:** Checklist item updates run through `validateMachines()` which recursively checks the machines/categories/items structure. Image endpoints validate MIME types and enforce per-item (20) and per-checklist (200) limits.

## Request/Response Examples

### POST /api/auth/login

**Request:**
```json
{
  "email": "ymartinez@gallo.com",
  "password": "admin123"
}
```

**Response (200):**
```json
{
  "user": {
    "id": "a1b2c3d4-...",
    "name": "Yolanda Martinez",
    "email": "ymartinez@gallo.com",
    "role": "admin",
    "factoryIds": ["f1", "f2"]
  },
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

The `password` field is stripped from the response via destructuring (`const { password: _, ...userPublic } = user`). The token is a JWT with 8h expiry containing `userId` and `role`. See [[Authentication]].

### POST /api/checklists

Creates a new checklist from the published template for the given line. Returns 409 if an in-progress checklist already exists for that line.

**Request:**
```json
{
  "lineId": "line-uuid-here"
}
```

**Response (201):**
```json
{
  "id": "new-uuid",
  "templateId": "template-uuid",
  "lineId": "line-uuid-here",
  "lineName": "Line 91 - Red Wine Bottling",
  "operatorId": "user-uuid",
  "operatorName": "Gabriel Sanchez",
  "factoryId": "factory-uuid",
  "status": "in_progress",
  "startTime": "2026-04-09T14:30:00.000Z",
  "endTime": null,
  "submittedAt": null,
  "updatedAt": null,
  "version": 1,
  "machines": [
    {
      "name": "Filler",
      "categories": [
        {
          "name": "Exterior Cleaning",
          "items": [
            {
              "description": "Wipe down all exterior surfaces",
              "machine": null,
              "completed": null,
              "completedBy": null,
              "completedAt": null,
              "issue": null,
              "images": []
            }
          ]
        }
      ]
    }
  ]
}
```

### PUT /api/checklists/:id/items

Full-machine save. Replaces the entire `machines` array using [[Optimistic Concurrency]]. The client must send the current `version`; the server returns the updated checklist with `version` incremented.

**Request:**
```json
{
  "machines": [
    {
      "name": "Filler",
      "categories": [
        {
          "name": "Exterior Cleaning",
          "items": [
            {
              "description": "Wipe down all exterior surfaces",
              "machine": null,
              "completed": true,
              "completedBy": "Gabriel Sanchez",
              "completedAt": "2026-04-09T14:45:00.000Z",
              "issue": null,
              "images": []
            }
          ]
        }
      ]
    }
  ],
  "version": 1
}
```

**Response (200):** The full Checklist object with `version: 2`.

**Error (409):** `{ "error": "Checklist has been modified by another user. Please refresh." }`

### PUT /api/checklists/:id/machines/:machineIdx

Per-machine save via [[Per-Machine Auto-Save]]. Uses `UpdateCommand SET machines[N]` so operators on different machines never conflict. Returns only the new version number.

**Request:**
```json
{
  "machine": {
    "name": "Filler",
    "categories": [
      {
        "name": "Exterior Cleaning",
        "items": [
          {
            "description": "Wipe down all exterior surfaces",
            "machine": null,
            "completed": true,
            "completedBy": "Gabriel Sanchez",
            "completedAt": "2026-04-09T14:45:00.000Z",
            "issue": null,
            "images": []
          }
        ]
      }
    ]
  },
  "version": 1
}
```

**Response (200):**
```json
{
  "version": 2
}
```

### POST /api/checklists/:id/images

Multipart form data upload. Files are stored in S3 with keys like `{checklistId}/{machineIdx}-{catIdx}-{itemIdx}/{timestamp}-{uuid}-{filename}`. The image keys are atomically appended to the item's `images` array via `appendChecklistImages`.

**Request:** `multipart/form-data`
- `images` -- file field (up to 10 files, max 10MB each)
- `machineIdx` -- integer
- `catIdx` -- integer
- `itemIdx` -- integer

**Response (200):**
```json
{
  "images": [
    "checklist-uuid/0-0-0/1712678400000-a1b2c3d4-photo.jpg",
    "checklist-uuid/0-0-0/1712678401000-e5f6g7h8-photo2.jpg"
  ]
}
```

See [[Image Handling]] for the full upload/retrieval/delete lifecycle.

### POST /api/users

Admin-only. Creates a user with atomic [[Email Uniqueness]] via `TransactWriteCommand`.

**Request:**
```json
{
  "name": "Jane Doe",
  "email": "jdoe@gallo.com",
  "password": "operator123",
  "role": "operator"
}
```

**Response (201):**
```json
{
  "id": "new-uuid",
  "name": "Jane Doe",
  "email": "jdoe@gallo.com",
  "role": "operator"
}
```

**Error (409):** `{ "error": "Email already exists" }` -- the `TransactionCanceledException` from the email lock is mapped to 409.

Note: the `password` field is never returned in any user response. The password is currently stored in plaintext; see [[Known Limitations]].

## See also

- [[Authentication]] -- how auth headers are verified
- [[Checklist Workflow]] -- the business logic behind the checklist endpoints
- [[Rate Limiting]] -- which endpoints have specific rate limits
- [[DynamoDB Access Patterns]] -- which GSIs power these endpoints
