# Gallo Sanitization MVP

Bottling facility sanitation checklist management system. Operators fill out deep cleaning checklists, admins review and approve/deny submissions.

## Tech Stack

- **Frontend:** React 18 + Vite + TypeScript, Redux Toolkit, React Router v6, Recharts
- **Backend:** Node.js + Express + TypeScript, PDFKit for PDF export
- **Database:** DynamoDB (6 tables: Users, Lines, Templates, Checklists, Connections, AuditLog)
- **Storage:** S3 for checklist images
- **Local infra:** LocalStack (Docker) emulates AWS services
- **Testing:** Playwright (E2E), Vitest (unit)

## Project Structure

```
backend/src/
    config/env.ts         # Environment config (AWS, JWT, ports)
    middleware/auth.ts     # JWT auth + adminOnly middleware
    routes/
      auth.ts             # Login, get current user
      users.ts            # User CRUD (admin-only for writes)
      lines.ts            # Production lines CRUD
      templates.ts        # Checklist templates (admin-only for writes)
      checklists.ts       # Checklists CRUD, submit, approve/deny, PDF export
      images.ts           # Image upload, presigned URLs, deletion
      audit.ts            # Audit log queries
    data/
      dynamo.ts           # All DynamoDB operations
      s3.ts               # S3 image upload/retrieval
      seed.ts             # Seed data definitions
      seed-dynamo.ts      # Seed script
    types/index.ts        # TypeScript interfaces
  frontend/src/
    pages/
      Login.tsx            # Auth entry point
      OperatorDashboard.tsx # Operator home (In Progress, Pending, Completed tabs)
      AdminDashboard.tsx    # Admin home (Pending, In Progress, Approved, All tabs)
      ChecklistFill.tsx     # Operator fills out checklist items
      ChecklistDetail.tsx   # View completed checklist details
      SubmissionReview.tsx  # Admin reviews/approves/denies
      CreateTemplate.tsx    # Admin creates templates
      Settings.tsx          # User profile
      RoleAssignment.tsx    # Admin manages users/roles
    components/             # Avatar, StatusBadge, Modal, Footer
    store/slices/authSlice.ts # Redux auth state
    services/api.ts         # API client with auto-auth headers
localstack/init-aws.sh      # Creates DynamoDB tables + S3 bucket on container start
docker-compose.yml           # LocalStack container config
```

## Running Locally

Prerequisites: Docker, Node.js 22+

```bash
# 1. Install dependencies
npm install

# 2. Start everything (LocalStack + seed + dev servers)
npm run dev:local

# Or step by step:
docker compose up -d          # Start LocalStack
npm run localstack:seed       # Seed DynamoDB tables with demo data
npm run dev                   # Start backend (port 4000) + frontend (port 3000)
```

The backend requires `backend/.env`:
```
LOCALSTACK_ENDPOINT=http://localhost:4566
AWS_REGION=us-west-2
JWT_SECRET=dev-secret-change-in-production
PORT=4000
FRONTEND_ORIGIN=http://localhost:3000
S3_BUCKET=checklist-images
```

## Demo Credentials

| Role     | Email                  | Password    |
|----------|------------------------|-------------|
| Admin    | ymartinez@gallo.com    | admin123    |
| Operator | gsanchez@gallo.com     | operator123 |
| Operator | mrivera@gallo.com      | operator123 |

## Roles & Permissions

**Operator:** Create/fill/submit checklists, upload images, view own checklists.

**Admin:** Everything operators can do, plus: review/approve/deny submissions, create/delete templates, manage users and roles, export checklists to PDF, delete checklists.

### Backend Authorization

- All routes use `authMiddleware` (JWT verification, sets `req.userId` and `req.userRole`)
- Admin-only routes additionally use `adminOnly` middleware (returns 403 if not admin)
- Admin-only endpoints: user CRUD, template create/delete, checklist approve/deny/delete, PDF export

### Frontend Authorization

- `ProtectedRoute` wrapper redirects unauthenticated users to `/login`
- `HomeRedirect` routes admins to `/admin`, operators to `/`
- UI elements conditionally rendered based on `user.role` from Redux store

## Checklist Workflow

```
in_progress → submitted → approved
                        → denied
```

Operators create and fill checklists, then submit. Admins review submitted checklists and approve or deny.

## DynamoDB Tables

| Table                   | Primary Key | GSIs                                    |
|-------------------------|-------------|-----------------------------------------|
| SanitizationUsers       | id          | email-index                             |
| SanitizationLines       | id          | —                                       |
| SanitizationTemplates   | id          | lineId-index                            |
| SanitizationChecklists  | id          | operatorId-index, status-index, lineId-status-index |

## Testing

```bash
npm test              # Unit tests (Vitest)
npm run test:e2e      # E2E tests (Playwright) — requires app running
npm run test:e2e:ui   # Playwright UI mode
```

E2E tests are in `/tests/` with helpers in `tests/helpers.ts`.

## Key Patterns

- Backend PDF generation uses PDFKit (server-side streaming)
- Images stored in S3 with presigned URLs for retrieval
- Frontend uses CSS Modules for component styling
- API client (`services/api.ts`) auto-injects JWT and handles 401 logout

## Wiki (LLM-Maintained Knowledge Base)

A persistent, compounding wiki lives at `wiki/`. It documents the codebase architecture, subsystems, decisions, and dev knowledge. The LLM maintains it — you read it.

**Read `wiki/schema.md` for the full maintenance protocol.** Key points below.

### WHEN TO READ (MANDATORY)

Before answering questions about architecture, decisions, or how subsystems work — **read `wiki/index.md` first to find the relevant page, then read that page.** The wiki contains context not obvious from code alone.

### WHEN TO UPDATE (MANDATORY)

After ANY of these, update the wiki:
1. **Code change** → Update affected pages, append to `wiki/log.md`
2. **New feature/subsystem** → Create page in appropriate subdirectory, update `wiki/index.md`
3. **Question that produced useful analysis** → File it as a page (DevLog or Decision)
4. **Bug investigation** → Add to DevLog

If trivial (typo, CSS tweak) — skip.

### Structure
```
wiki/
  index.md           # Content catalog — read this first
  log.md             # Chronological record of all changes
  schema.md          # Full conventions and workflows
  Architecture/      # 8 pages: System, DynamoDB, API, Auth, Factories, Workflow, Pages, Roles
  Subsystems/        # 12 pages: WebSocket, Concurrency, AutoSave, Presence, Toast, Offline, Audit, etc.
  Decisions/         # 8 pages: Concurrency Scenarios, Admin Safety, JWT, Known Limitations, etc.
  Runbooks/          # 5 pages: Setup, Credentials, Tests, Troubleshooting, Env Vars
  DevLog/            # Session notes: what was built, decisions made, patterns learned
```

### Graphify AST Graph

The code-level AST graph lives at `graphify-out/`:
- `graphify-out/graph.json` — 371 nodes, 376 edges
- `graphify-out/graph.html` — interactive visualization
- Rebuild: `/graphify . --update`
