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

## Obsidian Knowledge Vault

A hand-crafted Obsidian vault lives at `graphify-out/obsidian/` with 32+ pages and 238+ backlinks documenting the architecture, subsystems, decisions, and runbooks.

### WHEN TO READ THE VAULT (MANDATORY)

Before answering questions about the codebase architecture, design decisions, how subsystems work, or why something was built a certain way — **read the relevant vault page first.** The vault contains context that isn't obvious from reading code alone (design rationale, concurrency scenarios, deployment constraints).

- Question about how checklists work → read `graphify-out/obsidian/Checklist Workflow.md`
- Question about race conditions → read `graphify-out/obsidian/Concurrency Scenarios.md` and `graphify-out/obsidian/Optimistic Concurrency.md`
- Question about WebSocket → read `graphify-out/obsidian/WebSocket System.md`
- Question about auth → read `graphify-out/obsidian/Authentication.md`
- Question about why a decision was made → check the relevant decision page (ADR) in `graphify-out/obsidian/`
- Not sure which page → read `graphify-out/obsidian/Home.md` for the index

### WHEN TO UPDATE THE VAULT (MANDATORY)

After completing any of these, you MUST update the vault:

1. **New feature or subsystem** → Create a new page AND update related existing pages with backlinks in both directions
2. **New API endpoint** → Update `API Endpoints.md`
3. **New DynamoDB table or field** → Update `DynamoDB Tables.md`
4. **New architectural decision** → Create a new decision page and link from relevant subsystem pages
5. **Changed behavior** (e.g., dropdown → buttons) → Update `Frontend Pages.md` and any affected subsystem pages
6. **Bug fix that changes how something works** → Update the relevant subsystem page
7. **New environment variable** → Update `Environment Variables.md`

If the change is trivial (typo fix, test-only change, CSS tweak) — skip the vault update.

### Vault Rules (MUST FOLLOW when modifying the vault)

When adding or updating vault pages:

1. **Every `[[backlink]]` must point to a page that exists.** Check the filename matches exactly. No broken links.
2. **Every backlink must connect ideas that genuinely relate.** Ask: "Would clicking this link teach me something useful in this context?" If not, don't add it.
3. **Embed backlinks in prose, not as standalone lists.** Write: "The [[Optimistic Concurrency]] system prevents this via conditional writes." NOT: "- [[Optimistic Concurrency]]"
4. **Add a "See also" section** at the bottom with 2-3 related pages that provide useful next reading.
5. **No page should exist unless a developer would actually read it.** No auto-generated function-level pages. Every page should have real content.
6. **When adding a new feature**, update the relevant existing pages AND create a new page if the feature is substantial enough. Add backlinks in BOTH directions (the new page links to existing ones, and existing pages link back).
7. **Tag pages** in YAML frontmatter: #architecture, #backend, #frontend, #database, #decision, #runbook, #release

### Vault Structure (32 pages)
- **Home.md** — entry point
- **Tier 2 (Core):** System Architecture, Checklist Workflow, DynamoDB Tables, Authentication, API Endpoints, Frontend Pages
- **Tier 3 (Subsystems):** WebSocket System, Optimistic Concurrency, Per-Machine Auto-Save, Auto-Save and Conflict Resolution, Presence Indicators, Toast Notifications, Offline Queue, Audit Log, Input Validation, Rate Limiting, Image Handling, Roles and Permissions
- **Tier 4 (Decisions):** Concurrency Scenarios, Admin Safety, Email Uniqueness, JWT Design, Denied Is Final, WebSocket Adapter Pattern, Release 1 Bulletproofing, Release 2 Real-time, Environment Variables
- **Tier 5 (Runbooks):** Local Dev Setup, Demo Credentials, Running Tests, Troubleshooting

### Graphify Knowledge Graph

The AST-extracted graph data also lives at `graphify-out/`:
- **Graph data:** `graphify-out/graph.json` — 371 nodes, 376 edges
- **Interactive HTML:** `graphify-out/graph.html` — open in browser to visualize
- **Audit report:** `graphify-out/GRAPH_REPORT.md` — community structure, god nodes

To rebuild after code changes: `/graphify . --update`
