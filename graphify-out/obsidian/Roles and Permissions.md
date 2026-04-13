---
tags:
  - architecture
---

# Roles and Permissions

The system has exactly two roles: **operator** and **admin**. There are no fine-grained permissions, scopes, or role hierarchies -- the role field on the user record is sufficient because the permission model is simple and unlikely to change.

## Operator Capabilities

- Create checklists for any production line
- Fill out checklist items (toggle completion, add comments, upload images)
- Submit checklists for review
- View their own checklists (in progress, submitted, completed)
- View their own profile in Settings

Operators can only see their own checklists on the OperatorDashboard. The frontend sends `operatorId` as a query parameter matching the logged-in user.

**Backend enforcement of data isolation:** The `GET /checklists` endpoint does NOT automatically filter by the requesting user's ID. The frontend sends `operatorId` as a query parameter, but an operator could craft an API request without it and see all checklists. This is an access control gap — the backend should enforce `operatorId = req.userId` when the requester is an operator. See [[Known Limitations]].

## Admin Capabilities

Everything operators can do, plus:

- **Review checklists:** Approve or deny submitted checklists. Admins can also edit items on submitted checklists (the backend checks `isAdmin && checklist.status === 'submitted'` to allow writes).
- **Delete checklists:** Admin-only `DELETE /:id` endpoint.
- **Manage users:** Create new accounts, change roles, delete accounts. Subject to [[Admin Safety]] constraints.
- **Manage templates:** Create, edit, and delete checklist templates.
- **Create production lines:** Add new lines to the system.
- **Export PDF:** Generate downloadable PDF reports for checklists.
- **View audit log:** Access the [[Audit Log]] page to see all actions.
- **View all checklists:** AdminDashboard shows checklists from all operators, not filtered by `operatorId`.

## Backend Enforcement

The [[Authentication]] middleware chain handles role checking:

1. `authMiddleware` runs on every route -- verifies the JWT and sets `req.userId` and `req.userRole`.
2. `adminOnly` runs on specific routes -- returns 403 if `req.userRole !== 'admin'`.

Admin-only routes: `POST/PUT/DELETE /users`, `POST/PUT/DELETE /templates`, `POST /lines`, `POST /:id/approve`, `POST /:id/deny`, `DELETE /checklists/:id`, `GET /:id/pdf`, `GET /audit`, `POST /mark-all-viewed`, `GET /notifications`.

## Frontend Enforcement

The frontend uses three mechanisms:

1. **`ProtectedRoute`** -- wraps all routes except `/login`. If `state.auth.user` is null, redirects to `/login`.
2. **`HomeRedirect`** -- the `/` route checks `user.role`: admins go to `/admin`, operators stay on `/` (OperatorDashboard).
3. **Conditional rendering** -- UI elements like "Delete", "Approve/Deny", "Manage Users", "Audit Log" links are only rendered when `user.role === 'admin'`. This is purely cosmetic -- the backend is the true enforcement layer.

Note that all page routes (including `/admin`, `/settings/roles`, `/settings/audit`) use the same `ProtectedRoute` wrapper. There's no `AdminRoute` wrapper on the frontend -- an operator who navigates directly to `/admin` will see the AdminDashboard page but with operator-filtered data (because the backend returns different results based on role). The admin-only actions (approve, deny, delete) would fail with 403 on the backend.

## See also

- [[Authentication]] -- JWT middleware that sets role on every request
- [[Checklist Workflow]] -- what each role does in the checklist lifecycle
- [[Admin Safety]] -- constraints preventing admin lockout
