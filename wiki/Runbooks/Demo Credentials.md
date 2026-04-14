---
tags: [runbook]
created: 2026-04-09
updated: 2026-04-14
---

# Demo Credentials

These accounts are created by the seed script during [[Local Dev Setup]]. Passwords are stored in plaintext (development only -- see [[Known Limitations]]).

## Accounts

| Role | Name | Email | Password | Factory Assignments |
|------|------|-------|----------|---------------------|
| Admin | Y. Martinez | ymartinez@gallo.com | admin123 | None in seed (sees all factories) |
| Operator | G. Sanchez | gsanchez@gallo.com | operator123 | Modesto Plant, Livingston Winery |
| Operator | M. Rivera | mrivera@gallo.com | operator123 | Modesto Plant, Fresno Facility |

## Using Them

**Admin account (ymartinez):** Full access. The seed data does not assign `factoryIds` to this user, so the backend factory filter is bypassed and the admin sees all factories. Can view all checklists, approve/deny submissions, manage users, create templates, view audit log, export PDFs. Lands on `/admin` after login.

**Operator accounts (gsanchez, mrivera):** Can create and fill checklists, upload images, and submit for review. Can only see their own checklists. Scoped to their assigned factories: gsanchez sees Modesto + Livingston lines; mrivera sees Modesto + Fresno lines. Land on `/` (OperatorDashboard) after login.

For testing multi-operator scenarios (e.g., two operators editing the same checklist with [[Per-Machine Auto-Save]]), open two browser windows and log in as gsanchez in one and mrivera in the other.

## After E2E Tests

E2E tests may modify the seed data. If the demo accounts seem wrong or are missing, reseed:

```bash
docker compose down && docker compose up -d && sleep 10 && npm run localstack:seed
```

See [[Troubleshooting]] for more details on reseed scenarios.

## See also

- [[Roles and Permissions]] -- what each role can access
- [[Local Dev Setup]] -- how to get the app running
- [[Troubleshooting]] -- fixing seed data after test runs
