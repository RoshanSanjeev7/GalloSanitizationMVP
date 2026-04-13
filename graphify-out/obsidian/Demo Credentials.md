---
tags:
  - runbook
---

# Demo Credentials

These accounts are created by the seed script during [[Local Dev Setup]]. Passwords are stored in plaintext (development only).

## Accounts

| Role | Name | Email | Password |
|------|------|-------|----------|
| Admin | Y. Martinez | ymartinez@gallo.com | admin123 |
| Operator | G. Sanchez | gsanchez@gallo.com | operator123 |
| Operator | M. Rivera | mrivera@gallo.com | operator123 |

## Using Them

**Admin account (ymartinez):** Has full access. Can view all checklists, approve/deny submissions, manage users, create templates, view audit log, export PDFs. Lands on `/admin` after login.

**Operator accounts (gsanchez, mrivera):** Can create and fill checklists, upload images, and submit for review. Can only see their own checklists. Land on `/` (OperatorDashboard) after login.

For testing multi-operator scenarios (e.g., two operators editing the same checklist), open two browser windows and log in as gsanchez in one and mrivera in the other.

## After E2E Tests

E2E tests may modify the seed data (create users, create/submit/approve checklists). If the demo accounts seem wrong or are missing, reseed:

```bash
docker compose down && docker compose up -d && sleep 10 && npm run localstack:seed
```

See [[Troubleshooting]] for more details on reseed scenarios.

## What Each Role Can Do

See [[Roles and Permissions]] for the complete capability matrix.

## See also

- [[Roles and Permissions]] -- what each role can access
- [[Local Dev Setup]] -- how to get the app running
