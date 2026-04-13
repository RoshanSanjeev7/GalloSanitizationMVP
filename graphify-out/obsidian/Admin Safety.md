---
tags:
  - backend
  - decision
---

# Admin Safety

Three backend guards prevent scenarios where the system ends up with no admin access.

## Cannot Delete Own Account

In `DELETE /users/:id`, the very first check is:

```typescript
if (req.userId === req.params.id) {
  res.status(400).json({ error: 'Cannot delete your own account' });
  return;
}
```

This runs before even looking up the user. Without this guard, an admin could delete themselves and then have no way to log back in to create a new admin.

## Cannot Delete Last Admin

If the target user is an admin, the handler counts remaining admins:

```typescript
if (user.role === 'admin') {
  const allUsers = await getAllUsers();
  const adminCount = allUsers.filter(u => u.role === 'admin').length;
  if (adminCount <= 1) {
    res.status(400).json({ error: 'Cannot delete the last admin' });
    return;
  }
}
```

This prevents the scenario where an admin deletes all other admins and then tries to delete themselves (which the self-delete guard also catches). Even without the self-delete guard, this check would prevent the last admin from being deleted by anyone.

## Cannot Demote Last Admin

In `PUT /users/:id`, if the role is being changed away from admin:

```typescript
if (role && role !== 'admin' && user.role === 'admin') {
  const allUsers = await getAllUsers();
  const adminCount = allUsers.filter(u => u.role === 'admin').length;
  if (adminCount <= 1) {
    res.status(400).json({ error: 'Cannot demote the last admin' });
    return;
  }
}
```

This handles the subtle case where an admin changes the last admin's role to operator, which is effectively the same as deleting the last admin in terms of losing admin access.

## Frontend Enforcement

The RoleAssignment page also enforces these rules in the UI:

- The current admin's row has the delete button disabled or hidden
- The role toggle for the last admin is disabled
- Confirmation modals warn about role changes

But these are convenience guards -- the backend is the source of truth. See [[Roles and Permissions]] for the full permission model.

## Relationship to Concurrency

The "count admins" check has a potential race condition: two admins could simultaneously try to delete each other. Both count 2 admins, both pass the check, both delete, leaving zero admins. In practice this is extremely unlikely (there are typically 1-2 admins), and the window is milliseconds. A production-grade fix would use a DynamoDB transaction to atomically check and delete. See [[Concurrency Scenarios]] for other race conditions.

## See also

- [[Roles and Permissions]] -- what admin access means
- [[API Endpoints]] -- the DELETE and PUT /users endpoints
- [[Concurrency Scenarios]] -- the broader picture of race conditions
