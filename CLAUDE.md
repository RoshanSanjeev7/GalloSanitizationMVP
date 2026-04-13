# Gallo Sanitization MVP

Bottling facility sanitation checklist management system. Operators fill out deep cleaning checklists, admins review and approve/deny submissions.

## Tech Stack

- **Frontend:** React 18 + Vite + TypeScript, Redux Toolkit, React Router v6, Recharts
- **Backend:** Node.js + Express + TypeScript, PDFKit for PDF export
- **Database:** DynamoDB (4 tables: Users, Lines, Templates, Checklists)
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
      lines.ts            # Production lines (read-only)
      templates.ts        # Checklist templates (admin-only for writes)
      checklists.ts       # Checklists CRUD, submit, approve/deny, PDF export
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

## Graphify Knowledge Graph (Localized RAG)

A knowledge graph of this codebase lives at `graphify-out/`. Use it as a localized RAG system when answering questions about this codebase:

- **Graph data:** `graphify-out/graph.json` — 371 nodes, 376 edges covering all modules, routes, components, and their relationships
- **Interactive HTML:** `graphify-out/graph.html` — open in browser to visualize the full architecture
- **Audit report:** `graphify-out/GRAPH_REPORT.md` — community structure, god nodes, surprising connections
- **Obsidian vault:** `graphify-out/obsidian/` — 467 interlinked notes, one per entity, with community overview notes

When querying the codebase (e.g. "how does X connect to Y", "what depends on Z", "explain the auth flow"):
1. First check `graphify-out/graph.json` for structural relationships and community membership
2. Use `/graphify query "<question>"` for graph-traversal-based answers
3. Use `/graphify path "A" "B"` to trace dependency chains between concepts
4. Use `/graphify explain "Node"` for detailed context on any entity

To keep the graph current after code changes, run `/graphify . --update`.
