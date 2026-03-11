# Visual Blueprints: Front-End

## Overview

This document describes the high-fidelity wireframes and user interface design for the Checklist Management System. The application supports two user roles: **Operators** (who complete checklists) and **Admins** (who manage templates and approve submissions).

---

## Critical Path: Main User Flow

### Operator Flow
```
Login → Dashboard → Select Template → Fill Checklist → Submit → View Status
```

### Admin Flow
```
Login → Dashboard → Review Pending → Approve/Deny → Manage Templates
```

---

## Wireframes

### 1. Login Page

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                    CHECKLIST SYSTEM                         │
│                                                             │
│              ┌─────────────────────────────┐                │
│              │  Email                      │                │
│              └─────────────────────────────┘                │
│              ┌─────────────────────────────┐                │
│              │  Password                   │                │
│              └─────────────────────────────┘                │
│                                                             │
│              ┌─────────────────────────────┐                │
│              │         LOGIN               │                │
│              └─────────────────────────────┘                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**States:**
- **Loading:** Button shows spinner, inputs disabled
- **Error:** Red border on invalid fields, error message below form
- **Success:** Redirect to Dashboard

---

### 2. Dashboard (Operator View)

```
┌─────────────────────────────────────────────────────────────┐
│  [Logo]  Dashboard                    [User Name] [Logout]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ My Checklists│  │  Templates   │  │   History    │      │
│  │     12       │  │      5       │  │     48       │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                             │
│  Recent Checklists                                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Line A - Daily Check    │ In Progress │ [Continue]  │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ Line B - Safety Audit   │ Pending     │ [View]      │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ Line A - Weekly Review  │ Approved    │ [View]      │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌────────────────────────────┐                            │
│  │  + Start New Checklist    │                            │
│  └────────────────────────────┘                            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**States:**
- **Loading:** Skeleton cards animate while data loads
- **Empty:** "No checklists yet. Start your first one!" with CTA
- **Error:** "Failed to load checklists. [Retry]"

---

### 3. Dashboard (Admin View)

```
┌─────────────────────────────────────────────────────────────┐
│  [Logo]  Admin Dashboard              [Admin Name] [Logout] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Pending    │  │  Templates   │  │    Users     │      │
│  │      3       │  │      5       │  │     12       │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                             │
│  Pending Approvals                                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ John Doe - Line A Check │ 2h ago │[Approve][Deny]  │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ Jane Smith - Safety     │ 5h ago │[Approve][Deny]  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Quick Actions                                              │
│  [+ New Template]  [Manage Users]  [View Reports]          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

### 4. Checklist Form

```
┌───���─────────────────────────────────────────────────────────┐
│  [← Back]  Daily Safety Checklist              [Save Draft] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Line: Line A - Assembly                                    │
│  Template: Daily Safety Check                               │
│  Progress: ████████░░░░░░░░ 50%                            │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ □ Emergency exits are clear and accessible          │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ ☑ Fire extinguishers are in place                  │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ ☑ Safety signage is visible                        │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ □ First aid kit is stocked                          │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ □ PPE is available for all workers                  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Notes:                                                     │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Optional comments...                                │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              SUBMIT FOR APPROVAL                    │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**States:**
- **Loading:** Skeleton list while items load
- **Saving:** "Saving..." indicator with disabled submit
- **Error:** Red banner "Failed to save. Check connection."
- **Success:** Green toast "Checklist submitted successfully!"

---

### 5. Template Management (Admin)

```
┌─────────────────────────────────────────────────────────────┐
│  [← Back]  Template Management                 [+ Create]   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Search: [________________________] [Filter by Line ▼]      │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Daily Safety Check                                   │   │
│  │ Line A • 10 items • Used 48 times                   │   │
│  │                              [Edit] [Duplicate] [×] │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ Weekly Equipment Review                              │   │
│  │ All Lines • 25 items • Used 12 times                │   │
│  │                              [Edit] [Duplicate] [×] │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

### 6. User Management (Admin)

```
┌─────────────────────────────────────────────────────────────┐
│  [← Back]  User Management                     [+ Add User] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Search: [________________________]                         │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ John Doe        │ john@example.com │ Operator │ [×] │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ Jane Smith      │ jane@example.com │ Admin    │ [×] │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ Bob Johnson     │ bob@example.com  │ Operator │ [×] │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## State Handling Summary

| Component | Loading State | Error State | Success State |
|-----------|--------------|-------------|---------------|
| Login | Button spinner, disabled inputs | Red borders, error message | Redirect to dashboard |
| Dashboard | Skeleton cards | "Failed to load" + Retry button | Display data |
| Checklist Form | Skeleton list | Red banner with message | Green toast notification |
| Submit Action | "Submitting..." overlay | Modal with error details | Success modal + redirect |
| API Calls | Loading spinner in UI | Toast notification | Silent or toast confirmation |

---

## Responsive Breakpoints

- **Desktop:** 1024px+ (Full sidebar navigation)
- **Tablet:** 768px - 1023px (Collapsed sidebar)
- **Mobile:** < 768px (Bottom navigation)

---

## Color Scheme

| Element | Color | Usage |
|---------|-------|-------|
| Primary | #2563EB | Buttons, links, active states |
| Success | #16A34A | Approved status, success messages |
| Warning | #F59E0B | Pending status |
| Error | #DC2626 | Denied status, error messages |
| Neutral | #6B7280 | Secondary text, borders |
