---
tags: [decision]
created: 2026-04-09
updated: 2026-04-13
---

# Admin Safety

Three backend guards prevent scenarios where the system ends up with no admin access.

## Cannot Delete Own Account

In `DELETE /users/:id`, the very first check compares `req.userId === req.params.id`. This runs before even looking up the user. Without this guard, an admin could delete themselves and then have no way to log back in.

## Cannot Delete Last Admin

If the target user is an admin, the handler counts remaining admins via `getAllUsers()`. If only one admin remains, it returns 400: "Cannot delete the last admin." This prevents the scenario where an admin deletes all other admins and then themselves.

## Cannot Demote Last Admin

In `PUT /users/:id`, if the role is being changed away from admin, the handler counts remaining admins. If only one remains, it returns 400: "Cannot demote the last admin." This handles the subtle case where changing the last admin's role to operator effectively loses admin access.

## Frontend Enforcement

The RoleAssignment page in [[Frontend Pages]] also enforces these rules:

- The current admin's row has the delete button disabled or hidden
- The role toggle for the last admin is disabled
- Confirmation modals warn about role changes

These are convenience guards -- the backend is the source of truth. See [[Roles and Permissions]] for the full permission model.

## Known Limitation

Two admins could theoretically delete each other simultaneously. Both `getAllUsers` queries return 2 admins, both pass the check, both deletions proceed, leaving zero admins. A production fix would wrap the admin-count check and deletion in a single DynamoDB `TransactWriteCommand` with a `ConditionExpression`. See [[Known Limitations]] for the full list of MVP shortcuts, and [[Concurrency Scenarios]] for other race conditions.

## See also

- [[Roles and Permissions]] -- what admin access means
- [[API Endpoints]] -- the DELETE and PUT /users endpoints
- [[Concurrency Scenarios]] -- the broader picture of race conditions
