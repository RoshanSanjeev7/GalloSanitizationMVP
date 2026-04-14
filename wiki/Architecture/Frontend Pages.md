---
tags: [architecture]
created: 2026-04-09
updated: 2026-04-13
---

# Frontend Pages

The app has multiple pages, all defined in `frontend/src/App.tsx`. Admin-only pages are lazy-loaded with `React.lazy()` for code splitting. Every page except Login is wrapped in `ProtectedRoute`.

## Login (`/login`)

Simple email + password form. Calls `api.login()`, stores the JWT and user in localStorage, dispatches to Redux `authSlice`, and navigates to `/` (which `HomeRedirect` resolves to the role-appropriate dashboard).

## OperatorDashboard (`/`)

Three tabs: **In Progress**, **Pending Review** (submitted), and **Completed** (approved + denied). Lists the operator's own checklists, fetched with `operatorId` filter. A "New Checklist" button creates a checklist for a selected line -- but only one in-progress checklist is allowed per line. Polls for updated data with a 30-second interval. Uses `AbortController` to cancel stale fetches.

## AdminDashboard (`/admin`)

Four tabs: **Pending** (submitted), **In Progress**, **Approved**, and **All**. Shows checklists from all operators. Features a notification bell querying `/checklists/notifications` and showing unviewed count. Each row displays [[Presence Indicators]] -- overlapping avatar circles showing who is currently editing that checklist.

When operators submit checklists, the admin sees [[Toast Notifications]] slide in from the top-right, driven by `new_submission` events from the [[WebSocket System]].

## ChecklistFill (`/checklist/:id/fill`)

The most complex page. This is where operators actually fill out the checklist, task by task. Key state includes `machines`, `activeMachine`, `version` for [[Optimistic Concurrency]], and `saveStatus`. Uses `useChecklistSync` for real-time WebSocket deltas, `useOfflineQueue` for [[Offline Queue]] persistence, and `useImageUrlsForMachines` for batch presigned URL fetching.

Auto-save fires after a 500ms debounce via [[Auto-Save and Conflict Resolution]]. The `remoteUpdateRef` flag prevents WebSocket-received updates from triggering a save loop. [[Presence Indicators]] in the header show who else is editing.

## ChecklistDetail (`/checklist/:id`)

Read-only view of a completed (approved/denied) checklist. Shows all machines, categories, items with their completion status, comments, and images. No editing capability.

## SubmissionReview (`/checklist/:id/review`)

Admin view for reviewing submitted checklists. Displays all tasks with their status, comments, and images. The admin can toggle into edit mode to modify items on a submitted checklist. Approve/Deny guards disable buttons during API calls and show confirmation modals. A sidebar shows [[Presence Indicators]] -- "Currently Viewing" with avatars of other admins. Conflict handling for 409 responses is covered in [[Concurrency Scenarios]].

## CreateTemplate (`/templates/create`)

Admin-only. A form for defining checklist templates: title, line assignment, and a dynamic machine/category/task builder. Also used for editing existing templates. Template validation ensures at least one machine with at least one category with at least one task before allowing save. See [[Template Publishing]] for the draft/published workflow.

## Settings (`/settings`)

User profile page. Shows name, email, and role. Admins see links to Role Assignment, Manage Factories, and Audit Log.

## ManageFactories (`/settings/factories`)

Admin-only. Create and delete [[Factories]]. Shows a form with name and location fields, and a list of existing factories with delete buttons.

## RoleAssignment (`/settings/roles`)

Admin-only. Table of all users with role toggles (operator/admin). Includes "Create User" with name, email, password, and role fields. Delete button with confirmation modal. Enforces [[Admin Safety]] -- cannot delete self, cannot delete or demote the last admin.

## AuditLog (`/settings/audit`)

Admin-only. Filterable table of all [[Audit Log]] entries. Filters by user, action type, and date range. Action badges are color-coded. Paginated with the standard `limit`/`offset` pattern.

## See also

- [[Checklist Workflow]] -- the business flow these pages implement
- [[Auto-Save and Conflict Resolution]] -- the save lifecycle on ChecklistFill
- [[WebSocket System]] -- presence and real-time sync powering dashboard and fill pages
- [[Frontend Hooks]] -- the 6 custom hooks used across these pages
