---
tags: [devlog]
created: 2026-04-13
updated: 2026-04-13
---

# 2026-04-13 Factory Feature

Added multi-facility support so the application can manage multiple bottling plants, each with their own production lines, operators, and checklists.

## What Shipped

### Factories Data Model

Added factory concept to the data hierarchy: **Factory -> Lines -> Templates -> Checklists**. Each line belongs to a factory, each user is assigned to one or more factories. See [[Factories]] for the full design and [[DynamoDB Tables]] for schema changes.

### Factory Scoping

Both operators and admins are scoped to their assigned factories. The backend filters checklists and lines by the user's `factoryIds` array. This applies to both `GET /checklists` and `GET /lines` endpoints. See [[Roles and Permissions]] for how scoping differs by role.

### Manage Factories Page

New admin-only page accessible from Settings in [[Frontend Pages]]. Admins can create factories with a name and location, and delete them with a confirmation modal.

### Factory Assignment

The RoleAssignment page now shows factory checkboxes for each user. Admins can assign/unassign users to factories. When creating a new user, at least one factory must be selected. This is enforced in the UI (button disabled until a factory is checked).

### Seed Data

Expanded seed data with four Gallo facilities (Modesto, Livingston, Fresno, Dry Creek) and assigned production lines to each. Demo users are assigned to specific factories. Updated [[Demo Credentials]] documentation.

### Denormalized factoryId

Checklists are stamped with `factoryId` from the line's factory at creation time. This enables efficient filtering in [[API Endpoints]] without requiring a join-like lookup on every query.

## See also

- [[Factories]] -- the full documentation of this feature
- [[2026-04-12 Code Cleanup]] -- the previous session
- [[DynamoDB Tables]] -- schema changes for factory support
