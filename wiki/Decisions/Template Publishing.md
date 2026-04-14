---
tags: [decision]
created: 2026-04-10
updated: 2026-04-13
---

# Template Publishing

Templates have a `published` boolean field that controls operator visibility. This prevents operators from creating checklists with incomplete or draft templates.

## How It Works

When an admin creates a new template via `POST /templates`, it starts as **unpublished** (`published: false`). The admin can build the template, save multiple times, and only publish when it is ready.

**Publishing:** `POST /templates/:id/publish` with `{ published: true }` makes the template visible to operators. The endpoint toggles the field and logs the action to the [[Audit Log]].

**Unpublishing:** Sending `{ published: false }` hides the template from operators. Existing in-progress checklists created from this template continue to work -- they already have a copy of the template structure. Only new checklist creation is blocked.

## Visibility Rules

- `GET /templates` -- operators see only templates where `published !== false`. Admins see all templates regardless.
- `POST /checklists` -- operators can only create checklists from published templates. Admins can use any template. The backend returns 400 "No published template available" if no published template exists for the selected line.

## Frontend

The CreateTemplate page in [[Frontend Pages]] shows a Draft/Published badge and a Publish/Unpublish button in the header bar. The badge is green for published, amber for draft.

## What Happens to Existing Checklists

Unpublishing a template does NOT affect checklists already created from it. The checklist stores its own copy of the machine/category/task structure at creation time in [[DynamoDB Tables]] -- it does not reference the template at runtime. Only the `templateId` field links back for auditing.

## See also

- [[Checklist Workflow]] -- how templates feed into checklist creation
- [[API Endpoints]] -- the publish endpoint
- [[DynamoDB Tables]] -- the published field on SanitizationTemplates
