---
tags:
  - frontend
---

# Frontend Pages

The app has nine pages, all defined in `frontend/src/App.tsx`. Admin-only pages are lazy-loaded with `React.lazy()` for code splitting. Every page except Login is wrapped in `ProtectedRoute`.

## Login (`/login`)

Simple email + password form. Calls `api.login()`, stores the JWT and user in localStorage, dispatches to Redux `authSlice`, and navigates to `/` (which `HomeRedirect` resolves to the role-appropriate dashboard).

## OperatorDashboard (`/`)

Three tabs: **In Progress**, **Pending Review** (submitted), and **Completed** (approved + denied). Lists the operator's own checklists, fetched with `operatorId` filter. Each row shows line name, status badge, and timestamps. A "New Checklist" button creates a checklist for a selected line and navigates to the fill page.

Polls for updated data with a 30-second interval. Uses `AbortController` to cancel stale fetches when filters change quickly.

## AdminDashboard (`/admin`)

Four tabs: **Pending** (submitted), **In Progress**, **Approved**, and **All**. Shows checklists from all operators. Features a notification bell that queries the `/checklists/notifications` endpoint and shows unviewed count. Each row displays [[Presence Indicators]] -- overlapping avatar circles showing who's currently editing that checklist.

When operators submit checklists, the admin sees [[Toast Notifications]] slide in from the top-right. These are driven by `new_submission` events from the [[WebSocket System]].

Search and date filters are applied with `AbortController` to cancel in-flight requests when the user types quickly. Pagination uses the standard `limit`/`offset` pattern.

## ChecklistFill (`/checklist/:id/fill`)

The most complex page. This is where operators actually fill out the checklist, task by task.

**Key state:**
- `machines` / `activeMachine` -- the checklist data and which machine tab is selected
- `version` -- tracks the current version for [[Optimistic Concurrency]]
- `saveStatus` -- `idle | saving | saved | error | conflict`
- `savingRef` / `savePromiseRef` -- prevent concurrent saves and enable submit to await in-flight saves

**Hooks used:**
- `useChecklistSync` -- subscribes to the [[WebSocket System]] for real-time item/comment/image/status deltas
- `useOfflineQueue` -- queues saves to IndexedDB when the network is down (see [[Offline Queue]])
- `useImageUrlsForMachines` -- batch-fetches presigned S3 URLs for the active machine's images

**Auto-save flow:** Every change to `machines` state triggers a 500ms debounced save via [[Auto-Save and Conflict Resolution]]. The `remoteUpdateRef` flag prevents WebSocket-received updates from triggering a save loop.

**Presence:** `PresenceAvatars` component in the header shows who else is editing, using data from the WebSocket `presence` message.

## ChecklistDetail (`/checklist/:id`)

Read-only view of a completed (approved/denied) checklist. Shows all machines, categories, items with their completion status, comments, and images. No editing capability.

## SubmissionReview (`/checklist/:id/review`)

Admin view for reviewing submitted checklists. Displays all tasks across machines with their status, comments, and images. The admin can toggle into edit mode to modify items on a submitted checklist (the backend allows admin writes on `submitted` status).

**Approve/Deny guards:** Both buttons disable during the API call and show confirmation modals. If the checklist was already reviewed by another admin (409 response), a conflict message appears. This scenario is covered in [[Concurrency Scenarios]].

A sidebar shows presence information -- "Currently Viewing" with avatar(s) of other admins also looking at this checklist.

## CreateTemplate (`/templates/create`)

Admin-only. A form for defining checklist templates: title, line assignment, and a dynamic machine/category/task builder. Also used for editing existing templates (loads template data if an `id` query param is present).

Template validation ensures at least one machine with at least one category with at least one task before allowing save.

## Settings (`/settings`)

User profile page. Shows name, email, and role. Admins see links to Role Assignment and Audit Log.

## RoleAssignment (`/settings/roles`)

Admin-only. Table of all users with role toggles (operator/admin). Includes "Create User" with name, email, password, and role fields. Delete button with confirmation modal. Enforces [[Admin Safety]] -- cannot delete self, cannot delete or demote the last admin.

## AuditLog (`/settings/audit`)

Admin-only. Filterable table of all [[Audit Log]] entries. Filters by user, action type, and date range. Action badges are color-coded: green for creates, blue for role changes, red for deletes, yellow for denials. Paginated with the standard `limit`/`offset` pattern.

## See also

- [[Checklist Workflow]] -- the business flow these pages implement
- [[Auto-Save and Conflict Resolution]] -- the save lifecycle on ChecklistFill
- [[WebSocket System]] -- presence and real-time sync powering dashboard and fill pages
