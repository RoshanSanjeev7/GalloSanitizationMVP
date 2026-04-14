---
tags:
  - architecture
---

# Factories

Factories represent physical bottling plant locations. They sit at the top of the data hierarchy: **Factory → Lines → Templates → Checklists**. Each production line belongs to exactly one factory, and operators are assigned to specific factories by admins.

## Factory Locations

The seed data includes four Gallo facilities:

| Factory | Location | Lines |
|---------|----------|-------|
| Modesto Plant | Modesto, CA | Line 91, 92, 93 |
| Livingston Winery | Livingston, CA | Line 101, 102 |
| Fresno Facility | Fresno, CA | Line 201, 202 |
| Dry Creek Vineyard | Healdsburg, CA | Line 301 |

## How Factory Scoping Works

**Operators** are assigned to factories via a `factoryIds` array on their user record (see [[DynamoDB Tables]]). When an operator queries checklists, the backend filters results to only include checklists from lines belonging to their assigned factories. Operators do NOT choose their factory — admins assign them via the [[Roles and Permissions]] page.

**Admins** see all factories but must select a factory first ("Select a Factory" dropdown) on the [[Frontend Pages]] AdminDashboard and CreateTemplate pages. This is a convenience filter, not an access restriction. Admins can switch between factories freely. When creating a new user, at least one factory must be assigned (the "Add User" button is disabled until a factory checkbox is selected).

## Data Flow

When a checklist is created, the backend stamps it with `factoryId` from the line's factory. This denormalized field enables efficient filtering without requiring a line-to-factory lookup on every query. The [[Checklist Workflow]] documents the full creation flow.

The `GET /api/checklists` endpoint applies factory filtering for operators automatically — the operator never sees checklists from factories they're not assigned to. The [[API Endpoints]] page documents the endpoint behavior.

## Factory Management

Admins can create and delete factories via `POST/DELETE /api/factories`. The **Manage Factories** page (accessible from Settings) lets admins add new factories with a name and location, and delete existing ones with a confirmation modal. The RoleAssignment page shows factory assignment checkboxes for each user — check/uncheck a factory to control which facilities the user can access. When creating a new user, at least one factory must be selected before the "Add User" button is enabled.

## See also

- [[DynamoDB Tables]] — SanitizationFactories table and factoryId fields on Lines, Users, Checklists
- [[Roles and Permissions]] — who can manage factories and how operator scoping works
- [[Checklist Workflow]] — how factoryId flows from line to checklist at creation
- [[API Endpoints]] — factory CRUD endpoints
