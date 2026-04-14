---
tags: [architecture]
created: 2026-04-09
updated: 2026-04-14
---

# Roles and Permissions

The system has exactly two roles: **operator** and **admin**. There are no fine-grained permissions, scopes, or role hierarchies -- the role field on the user record is sufficient because the permission model is simple.

## Operator Capabilities

- Create checklists for any production line within their assigned [[Factories]]
- Fill out checklist items (toggle completion, add comments, upload images)
- Submit checklists for review
- View their own checklists (in progress, submitted, completed)
- View their own profile in Settings

Operators can only see their own checklists on the OperatorDashboard. The frontend sends `operatorId` as a query parameter matching the logged-in user.

**Backend enforcement gap:** The `GET /checklists` endpoint does NOT automatically filter by the requesting user's ID. The frontend sends `operatorId` as a query parameter, but an operator could craft an API request without it and see all checklists. See [[Known Limitations]].

## Admin Capabilities

Everything operators can do, plus:

- **Review checklists:** Approve or deny submitted checklists. Admins can edit items on submitted checklists.
- **Delete checklists:** Admin-only `DELETE /:id` endpoint.
- **Manage users:** Create accounts, change roles, delete accounts. Subject to [[Admin Safety]] constraints.
- **Manage templates:** Create, edit, and delete checklist templates. Control [[Template Publishing]].
- **Create production lines:** Add new lines to the system.
- **Manage factories:** Create and delete [[Factories]].
- **Export PDF:** Generate downloadable PDF reports (see [[PDF Export]]).
- **View audit log:** Access the [[Audit Log]] page.
- **View factory-scoped checklists:** AdminDashboard shows checklists from all operators within the admin's assigned [[Factories]]. The backend filters `GET /checklists` by `user.factoryIds` for ALL users, including admins -- admins do NOT see checklists from factories they are not assigned to.

## Backend Enforcement

The [[Authentication]] middleware chain handles role checking:

1. `authMiddleware` runs on every route -- verifies the JWT and sets `req.userId` and `req.userRole`.
2. `adminOnly` runs on specific routes -- returns 403 if `req.userRole !== 'admin'`.

Admin-only routes: `POST/PUT/DELETE /users`, `POST/PUT/DELETE /templates`, `POST /lines`, `POST /:id/approve`, `POST /:id/deny`, `DELETE /checklists/:id`, `GET /:id/pdf`, `GET /audit`, `POST /mark-all-viewed`, `GET /notifications`.

## Frontend Enforcement

Three mechanisms on the frontend:

1. **`ProtectedRoute`** -- wraps all routes except `/login`. Redirects to `/login` if no user in Redux store.
2. **`HomeRedirect`** -- the `/` route checks `user.role`: admins go to `/admin`, operators stay on `/`.
3. **Conditional rendering** -- UI elements like "Delete", "Approve/Deny" are only rendered when `user.role === 'admin'`. This is purely cosmetic -- the backend is the true enforcement layer.

4. **`ProtectedAdminRoute`** -- wraps admin-only routes (`/admin`, `/settings/roles`, `/settings/factories`, `/settings/audit`, `/templates/create`, `/checklist/:id/review`). Redirects non-admin users to `/` if they navigate directly to an admin route.

## See also

- [[Authentication]] -- JWT middleware that sets role on every request
- [[Checklist Workflow]] -- what each role does in the checklist lifecycle
- [[Admin Safety]] -- constraints preventing admin lockout
