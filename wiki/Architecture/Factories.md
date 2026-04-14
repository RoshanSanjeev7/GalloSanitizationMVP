---
tags: [architecture]
created: 2026-04-13
updated: 2026-04-13
---

# Factories

Factories represent physical bottling plant locations. They sit at the top of the data hierarchy: **Factory -> Lines -> Templates -> Checklists**. Each production line belongs to exactly one factory, and operators are assigned to specific factories by admins.

## Factory Locations

The seed data includes four Gallo facilities:

| Factory | Location | Lines |
|---------|----------|-------|
| Modesto Plant | Modesto, CA | Line 91, 92, 93 |
| Livingston Winery | Livingston, CA | Line 101, 102 |
| Fresno Facility | Fresno, CA | Line 201, 202 |
| Dry Creek Vineyard | Healdsburg, CA | Line 301 |

## How Factory Scoping Works

**Operators** are assigned to factories via a `factoryIds` array on their user record (see [[DynamoDB Tables]]). When an operator queries checklists, the backend filters results to only include checklists from lines belonging to their assigned factories. Operators do not choose their factory -- admins assign them via the [[Roles and Permissions]] page.

**Admins** are also scoped to their assigned factories -- the backend filters checklists and lines by the admin's `factoryIds`, just like operators. There is no "All Factories" option. Factory assignment is managed on the RoleAssignment page. When creating a new user, at least one factory must be assigned.

## Data Flow

When a checklist is created, the backend stamps it with `factoryId` from the line's factory. This denormalized field enables efficient filtering without requiring a line-to-factory lookup on every query. The [[Checklist Workflow]] documents the full creation flow.

The `GET /api/checklists` endpoint applies factory filtering automatically -- users never see checklists from factories they are not assigned to. The [[API Endpoints]] page documents the endpoint behavior.

## Factory Management

Admins can create and delete factories via `POST/DELETE /api/factories`. The Manage Factories page (accessible from Settings in [[Frontend Pages]]) lets admins add new factories with a name and location, and delete existing ones with a confirmation modal. The RoleAssignment page shows factory assignment checkboxes for each user.

## Factory Deletion Cascade

**What happens when a factory is deleted:**

Currently, deleting a factory (`DELETE /api/factories/:id`) hard-deletes the factory record from the `SanitizationFactories` table. No cascade cleanup is performed. This means:

- **Lines orphaned:** Lines that referenced this factory retain their `factoryId`, but it now points to a nonexistent factory. Lines are still queryable but display no factory label.
- **Checklists retain stale factoryId:** Checklists stamped with the deleted factory's `factoryId` remain visible to users who had that factory in their `factoryIds` array. Factory-scoped filtering in `GET /api/checklists` still matches these checklists because it checks user `factoryIds` against checklist `factoryId`.
- **Users retain stale factoryIds:** Users with the deleted factory in their `factoryIds` array keep that entry. The RoleAssignment page may show a factory checkbox for a factory that no longer exists.

This is a [[Known Limitations]] item. Production should add one of:
1. **Cascade cleanup:** On factory delete, remove the `factoryId` from all Lines, Checklists, and Users, or reassign them to another factory.
2. **Soft-delete:** Mark the factory as deleted instead of removing it, and filter it out of the factory list while preserving referential integrity.

## See also

- [[DynamoDB Tables]] -- factoryId fields on Lines, Users, Checklists
- [[Roles and Permissions]] -- who can manage factories and how operator scoping works
- [[Checklist Workflow]] -- how factoryId flows from line to checklist at creation
- [[Known Limitations]] -- factory cascade is a P1 issue
