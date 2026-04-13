# Graph Report - .  (2026-04-12)

## Corpus Check
- 162 files · ~91,533 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 371 nodes · 376 edges · 96 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_API Service Layer|API Service Layer]]
- [[_COMMUNITY_DynamoDB Data Layer|DynamoDB Data Layer]]
- [[_COMMUNITY_WebSocket Client|WebSocket Client]]
- [[_COMMUNITY_API Gateway Broadcaster|API Gateway Broadcaster]]
- [[_COMMUNITY_Server Config & Routes|Server Config & Routes]]
- [[_COMMUNITY_Template Builder UI|Template Builder UI]]
- [[_COMMUNITY_Backend Tests|Backend Tests]]
- [[_COMMUNITY_Submission Review Page|Submission Review Page]]
- [[_COMMUNITY_Checklist Fill Page|Checklist Fill Page]]
- [[_COMMUNITY_Admin Dashboard|Admin Dashboard]]
- [[_COMMUNITY_Checklist Utilities|Checklist Utilities]]
- [[_COMMUNITY_PDF & S3 Storage|PDF & S3 Storage]]
- [[_COMMUNITY_WS Connections Layer|WS Connections Layer]]
- [[_COMMUNITY_Seed Data|Seed Data]]
- [[_COMMUNITY_Operator Dashboard|Operator Dashboard]]
- [[_COMMUNITY_Role Assignment|Role Assignment]]
- [[_COMMUNITY_Auth Middleware|Auth Middleware]]
- [[_COMMUNITY_Checklist Detail View|Checklist Detail View]]
- [[_COMMUNITY_E2E Test Helpers|E2E Test Helpers]]
- [[_COMMUNITY_Avatar Component|Avatar Component]]
- [[_COMMUNITY_Image URL Hooks|Image URL Hooks]]
- [[_COMMUNITY_Admin Dashboard Tests|Admin Dashboard Tests]]
- [[_COMMUNITY_Operator Dashboard Tests|Operator Dashboard Tests]]
- [[_COMMUNITY_SQS PDF Queue|SQS PDF Queue]]
- [[_COMMUNITY_App Routing|App Routing]]
- [[_COMMUNITY_Offline Banner|Offline Banner]]
- [[_COMMUNITY_Loading Bar|Loading Bar]]
- [[_COMMUNITY_Logout & Footer|Logout & Footer]]
- [[_COMMUNITY_Reconnect Banner|Reconnect Banner]]
- [[_COMMUNITY_Modal Component|Modal Component]]
- [[_COMMUNITY_Spinner Component|Spinner Component]]
- [[_COMMUNITY_Presence Avatars|Presence Avatars]]
- [[_COMMUNITY_Test Render Helpers|Test Render Helpers]]
- [[_COMMUNITY_Checklist Sync Hook|Checklist Sync Hook]]
- [[_COMMUNITY_WebSocket Hook|WebSocket Hook]]
- [[_COMMUNITY_Presence Summary Hook|Presence Summary Hook]]
- [[_COMMUNITY_Checklist Fill Tests|Checklist Fill Tests]]
- [[_COMMUNITY_Login Page|Login Page]]
- [[_COMMUNITY_API Client Tests|API Client Tests]]
- [[_COMMUNITY_Auth Slice & Tests|Auth Slice & Tests]]
- [[_COMMUNITY_User Management E2E|User Management E2E]]
- [[_COMMUNITY_Playwright Config|Playwright Config]]
- [[_COMMUNITY_ESLint Config|ESLint Config]]
- [[_COMMUNITY_Vite Config (Frontend)|Vite Config (Frontend)]]
- [[_COMMUNITY_Vitest Config (Frontend)|Vitest Config (Frontend)]]
- [[_COMMUNITY_App Entry Point|App Entry Point]]
- [[_COMMUNITY_Test Setup|Test Setup]]
- [[_COMMUNITY_CSS Modules Types|CSS Modules Types]]
- [[_COMMUNITY_Vite Env Types|Vite Env Types]]
- [[_COMMUNITY_Offline Banner Tests|Offline Banner Tests]]
- [[_COMMUNITY_Modal Tests|Modal Tests]]
- [[_COMMUNITY_Status Badge|Status Badge]]
- [[_COMMUNITY_Footer Tests|Footer Tests]]
- [[_COMMUNITY_Status Badge Tests|Status Badge Tests]]
- [[_COMMUNITY_Avatar Tests|Avatar Tests]]
- [[_COMMUNITY_API URL Property Tests|API URL Property Tests]]
- [[_COMMUNITY_Settings Page|Settings Page]]
- [[_COMMUNITY_Settings Tests|Settings Tests]]
- [[_COMMUNITY_Checklist Detail Tests|Checklist Detail Tests]]
- [[_COMMUNITY_Submission Review Tests|Submission Review Tests]]
- [[_COMMUNITY_Create Template Tests|Create Template Tests]]
- [[_COMMUNITY_Login Tests|Login Tests]]
- [[_COMMUNITY_Role Assignment Tests|Role Assignment Tests]]
- [[_COMMUNITY_Backend Index Tests|Backend Index Tests]]
- [[_COMMUNITY_Backend Index|Backend Index]]
- [[_COMMUNITY_Seed E2E Tests|Seed E2E Tests]]
- [[_COMMUNITY_Notifications E2E|Notifications E2E]]
- [[_COMMUNITY_Auth E2E Tests|Auth E2E Tests]]
- [[_COMMUNITY_PDF E2E Tests|PDF E2E Tests]]
- [[_COMMUNITY_Checklist Fill E2E|Checklist Fill E2E]]
- [[_COMMUNITY_Admin Dashboard E2E|Admin Dashboard E2E]]
- [[_COMMUNITY_Submission Review E2E|Submission Review E2E]]
- [[_COMMUNITY_Settings E2E|Settings E2E]]
- [[_COMMUNITY_Pagination E2E|Pagination E2E]]
- [[_COMMUNITY_JWT E2E Tests|JWT E2E Tests]]
- [[_COMMUNITY_Code Splitting E2E|Code Splitting E2E]]
- [[_COMMUNITY_Network Resilience E2E|Network Resilience E2E]]
- [[_COMMUNITY_Batch Images E2E|Batch Images E2E]]
- [[_COMMUNITY_Conflict Resolution E2E|Conflict Resolution E2E]]
- [[_COMMUNITY_Create Template E2E|Create Template E2E]]
- [[_COMMUNITY_Checklist Lifecycle E2E|Checklist Lifecycle E2E]]
- [[_COMMUNITY_Checklist Detail E2E|Checklist Detail E2E]]
- [[_COMMUNITY_Operator Dashboard E2E|Operator Dashboard E2E]]
- [[_COMMUNITY_Vitest Config (Backend)|Vitest Config (Backend)]]
- [[_COMMUNITY_Backend Types Index|Backend Types Index]]
- [[_COMMUNITY_Env Config Tests|Env Config Tests]]
- [[_COMMUNITY_DynamoDB Query Tests|DynamoDB Query Tests]]
- [[_COMMUNITY_Checklists Route Tests|Checklists Route Tests]]
- [[_COMMUNITY_Users Route Tests|Users Route Tests]]
- [[_COMMUNITY_Auth Route Tests|Auth Route Tests]]
- [[_COMMUNITY_Images Route Tests|Images Route Tests]]
- [[_COMMUNITY_Templates Route Tests|Templates Route Tests]]
- [[_COMMUNITY_Lines Route Tests|Lines Route Tests]]
- [[_COMMUNITY_Checklist Property Tests|Checklist Property Tests]]
- [[_COMMUNITY_Connections Tests|Connections Tests]]
- [[_COMMUNITY_WebSocket Local Tests|WebSocket Local Tests]]

## God Nodes (most connected - your core abstractions)
1. `WebSocketClient` - 21 edges
2. `request()` - 19 edges
3. `requestWithRetry()` - 9 edges
4. `LocalWsBroadcaster` - 8 edges
5. `nextId()` - 7 edges
6. `ApiGatewayBroadcaster` - 7 edges
7. `makeChecklist()` - 5 edges
8. `getToken()` - 5 edges
9. `ttlFromNow()` - 5 edges
10. `itemKey()` - 4 edges

## Surprising Connections (you probably didn't know these)
- `makeUserPublic()` --calls--> `nextId()`  [EXTRACTED]
  frontend/src/__tests__/factories.ts → backend/src/__tests__/factories.ts

## Communities

### Community 0 - "API Service Layer"
Cohesion: 0.1
Nodes (30): approveChecklist(), createChecklist(), createLine(), createTemplate(), createUser(), delay(), deleteChecklist(), deleteImage() (+22 more)

### Community 1 - "DynamoDB Data Layer"
Cohesion: 0.07
Nodes (6): getAllChecklists(), getChecklistsByOperator(), getChecklistsByStatus(), queryChecklists(), putSafe(), seedIfEmpty()

### Community 2 - "WebSocket Client"
Cohesion: 0.15
Nodes (1): WebSocketClient

### Community 3 - "API Gateway Broadcaster"
Cohesion: 0.12
Nodes (2): ApiGatewayBroadcaster, LocalWsBroadcaster

### Community 4 - "Server Config & Routes"
Cohesion: 0.16
Nodes (0): 

### Community 5 - "Template Builder UI"
Cohesion: 0.16
Nodes (6): buildMachines(), emptyMachine(), handleCreateLine(), handleDelete(), handleLineSelect(), handleSave()

### Community 6 - "Backend Tests"
Cohesion: 0.21
Nodes (8): makeChecklist(), makeChecklistItem(), makeLine(), makeSubmittedChecklist(), makeTemplate(), makeUser(), makeUserPublic(), nextId()

### Community 7 - "Submission Review Page"
Cohesion: 0.21
Nodes (6): buildMachines(), handlePhotoUpload(), handleSaveEdits(), itemKey(), setCommentText(), toggleComment()

### Community 8 - "Checklist Fill Page"
Cohesion: 0.24
Nodes (8): buildMachines(), collapseKey(), confirmSubmit(), handlePhotoUpload(), itemKey(), setCommentText(), toggleCollapse(), toggleComment()

### Community 9 - "Admin Dashboard"
Cohesion: 0.17
Nodes (0): 

### Community 10 - "Checklist Utilities"
Cohesion: 0.22
Nodes (3): formatDateTime(), formatStamp(), formatTime()

### Community 11 - "PDF & S3 Storage"
Cohesion: 0.22
Nodes (0): 

### Community 12 - "WS Connections Layer"
Cohesion: 0.29
Nodes (5): putConnection(), touchConnection(), ttlFromNow(), updateConnectionMachine(), updateConnectionSubscription()

### Community 13 - "Seed Data"
Cohesion: 0.28
Nodes (4): seedIfEmpty(), toChecklistMachines(), save(), setStore()

### Community 14 - "Operator Dashboard"
Cohesion: 0.29
Nodes (0): 

### Community 15 - "Role Assignment"
Cohesion: 0.53
Nodes (4): confirmRoleChange(), handleAdd(), handleDelete(), loadUsers()

### Community 16 - "Auth Middleware"
Cohesion: 0.33
Nodes (0): 

### Community 17 - "Checklist Detail View"
Cohesion: 0.67
Nodes (2): collapseKey(), toggleCollapse()

### Community 18 - "E2E Test Helpers"
Cohesion: 0.5
Nodes (0): 

### Community 19 - "Avatar Component"
Cohesion: 0.67
Nodes (0): 

### Community 20 - "Image URL Hooks"
Cohesion: 1.0
Nodes (2): useImageUrls(), useImageUrlsForMachines()

### Community 21 - "Admin Dashboard Tests"
Cohesion: 0.67
Nodes (0): 

### Community 22 - "Operator Dashboard Tests"
Cohesion: 0.67
Nodes (0): 

### Community 23 - "SQS PDF Queue"
Cohesion: 0.67
Nodes (0): 

### Community 24 - "App Routing"
Cohesion: 1.0
Nodes (0): 

### Community 25 - "Offline Banner"
Cohesion: 1.0
Nodes (0): 

### Community 26 - "Loading Bar"
Cohesion: 1.0
Nodes (0): 

### Community 27 - "Logout & Footer"
Cohesion: 1.0
Nodes (0): 

### Community 28 - "Reconnect Banner"
Cohesion: 1.0
Nodes (0): 

### Community 29 - "Modal Component"
Cohesion: 1.0
Nodes (0): 

### Community 30 - "Spinner Component"
Cohesion: 1.0
Nodes (0): 

### Community 31 - "Presence Avatars"
Cohesion: 1.0
Nodes (0): 

### Community 32 - "Test Render Helpers"
Cohesion: 1.0
Nodes (0): 

### Community 33 - "Checklist Sync Hook"
Cohesion: 1.0
Nodes (0): 

### Community 34 - "WebSocket Hook"
Cohesion: 1.0
Nodes (0): 

### Community 35 - "Presence Summary Hook"
Cohesion: 1.0
Nodes (0): 

### Community 36 - "Checklist Fill Tests"
Cohesion: 1.0
Nodes (0): 

### Community 37 - "Login Page"
Cohesion: 1.0
Nodes (0): 

### Community 38 - "API Client Tests"
Cohesion: 1.0
Nodes (0): 

### Community 39 - "Auth Slice & Tests"
Cohesion: 1.0
Nodes (0): 

### Community 40 - "User Management E2E"
Cohesion: 1.0
Nodes (0): 

### Community 41 - "Playwright Config"
Cohesion: 1.0
Nodes (0): 

### Community 42 - "ESLint Config"
Cohesion: 1.0
Nodes (0): 

### Community 43 - "Vite Config (Frontend)"
Cohesion: 1.0
Nodes (0): 

### Community 44 - "Vitest Config (Frontend)"
Cohesion: 1.0
Nodes (0): 

### Community 45 - "App Entry Point"
Cohesion: 1.0
Nodes (0): 

### Community 46 - "Test Setup"
Cohesion: 1.0
Nodes (0): 

### Community 47 - "CSS Modules Types"
Cohesion: 1.0
Nodes (0): 

### Community 48 - "Vite Env Types"
Cohesion: 1.0
Nodes (0): 

### Community 49 - "Offline Banner Tests"
Cohesion: 1.0
Nodes (0): 

### Community 50 - "Modal Tests"
Cohesion: 1.0
Nodes (0): 

### Community 51 - "Status Badge"
Cohesion: 1.0
Nodes (0): 

### Community 52 - "Footer Tests"
Cohesion: 1.0
Nodes (0): 

### Community 53 - "Status Badge Tests"
Cohesion: 1.0
Nodes (0): 

### Community 54 - "Avatar Tests"
Cohesion: 1.0
Nodes (0): 

### Community 55 - "API URL Property Tests"
Cohesion: 1.0
Nodes (0): 

### Community 56 - "Settings Page"
Cohesion: 1.0
Nodes (0): 

### Community 57 - "Settings Tests"
Cohesion: 1.0
Nodes (0): 

### Community 58 - "Checklist Detail Tests"
Cohesion: 1.0
Nodes (0): 

### Community 59 - "Submission Review Tests"
Cohesion: 1.0
Nodes (0): 

### Community 60 - "Create Template Tests"
Cohesion: 1.0
Nodes (0): 

### Community 61 - "Login Tests"
Cohesion: 1.0
Nodes (0): 

### Community 62 - "Role Assignment Tests"
Cohesion: 1.0
Nodes (0): 

### Community 63 - "Backend Index Tests"
Cohesion: 1.0
Nodes (0): 

### Community 64 - "Backend Index"
Cohesion: 1.0
Nodes (0): 

### Community 65 - "Seed E2E Tests"
Cohesion: 1.0
Nodes (0): 

### Community 66 - "Notifications E2E"
Cohesion: 1.0
Nodes (0): 

### Community 67 - "Auth E2E Tests"
Cohesion: 1.0
Nodes (0): 

### Community 68 - "PDF E2E Tests"
Cohesion: 1.0
Nodes (0): 

### Community 69 - "Checklist Fill E2E"
Cohesion: 1.0
Nodes (0): 

### Community 70 - "Admin Dashboard E2E"
Cohesion: 1.0
Nodes (0): 

### Community 71 - "Submission Review E2E"
Cohesion: 1.0
Nodes (0): 

### Community 72 - "Settings E2E"
Cohesion: 1.0
Nodes (0): 

### Community 73 - "Pagination E2E"
Cohesion: 1.0
Nodes (0): 

### Community 74 - "JWT E2E Tests"
Cohesion: 1.0
Nodes (0): 

### Community 75 - "Code Splitting E2E"
Cohesion: 1.0
Nodes (0): 

### Community 76 - "Network Resilience E2E"
Cohesion: 1.0
Nodes (0): 

### Community 77 - "Batch Images E2E"
Cohesion: 1.0
Nodes (0): 

### Community 78 - "Conflict Resolution E2E"
Cohesion: 1.0
Nodes (0): 

### Community 79 - "Create Template E2E"
Cohesion: 1.0
Nodes (0): 

### Community 80 - "Checklist Lifecycle E2E"
Cohesion: 1.0
Nodes (0): 

### Community 81 - "Checklist Detail E2E"
Cohesion: 1.0
Nodes (0): 

### Community 82 - "Operator Dashboard E2E"
Cohesion: 1.0
Nodes (0): 

### Community 83 - "Vitest Config (Backend)"
Cohesion: 1.0
Nodes (0): 

### Community 84 - "Backend Types Index"
Cohesion: 1.0
Nodes (0): 

### Community 85 - "Env Config Tests"
Cohesion: 1.0
Nodes (0): 

### Community 86 - "DynamoDB Query Tests"
Cohesion: 1.0
Nodes (0): 

### Community 87 - "Checklists Route Tests"
Cohesion: 1.0
Nodes (0): 

### Community 88 - "Users Route Tests"
Cohesion: 1.0
Nodes (0): 

### Community 89 - "Auth Route Tests"
Cohesion: 1.0
Nodes (0): 

### Community 90 - "Images Route Tests"
Cohesion: 1.0
Nodes (0): 

### Community 91 - "Templates Route Tests"
Cohesion: 1.0
Nodes (0): 

### Community 92 - "Lines Route Tests"
Cohesion: 1.0
Nodes (0): 

### Community 93 - "Checklist Property Tests"
Cohesion: 1.0
Nodes (0): 

### Community 94 - "Connections Tests"
Cohesion: 1.0
Nodes (0): 

### Community 95 - "WebSocket Local Tests"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **Thin community `App Routing`** (2 nodes): `ProtectedRoute()`, `App.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Offline Banner`** (2 nodes): `OfflineBanner.tsx`, `OfflineBanner()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Loading Bar`** (2 nodes): `LoadingBar.tsx`, `LoadingBar()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Logout & Footer`** (2 nodes): `handleLogout()`, `Footer.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Reconnect Banner`** (2 nodes): `ReconnectBanner.tsx`, `ReconnectBanner()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Modal Component`** (2 nodes): `Modal.tsx`, `Modal()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Spinner Component`** (2 nodes): `Spinner.tsx`, `Spinner()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Presence Avatars`** (2 nodes): `PresenceAvatars.tsx`, `getInitials()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Test Render Helpers`** (2 nodes): `render-helpers.tsx`, `renderWithProviders()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Checklist Sync Hook`** (2 nodes): `useChecklistSync.ts`, `useChecklistSync()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `WebSocket Hook`** (2 nodes): `useWebSocket.ts`, `useWebSocket()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Presence Summary Hook`** (2 nodes): `usePresenceSummary.ts`, `usePresenceSummary()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Checklist Fill Tests`** (2 nodes): `buildChecklist()`, `ChecklistFill.test.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Login Page`** (2 nodes): `Login.tsx`, `handleSubmit()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `API Client Tests`** (2 nodes): `mockFetchResponse()`, `api.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Auth Slice & Tests`** (2 nodes): `authSlice.test.ts`, `authSlice.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `User Management E2E`** (2 nodes): `user-management.spec.ts`, `uid()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Playwright Config`** (1 nodes): `playwright.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `ESLint Config`** (1 nodes): `eslint.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Vite Config (Frontend)`** (1 nodes): `vite.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Vitest Config (Frontend)`** (1 nodes): `vitest.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `App Entry Point`** (1 nodes): `main.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Test Setup`** (1 nodes): `test-setup.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `CSS Modules Types`** (1 nodes): `css-modules.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Vite Env Types`** (1 nodes): `vite-env.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Offline Banner Tests`** (1 nodes): `OfflineBanner.test.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Modal Tests`** (1 nodes): `Modal.test.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Status Badge`** (1 nodes): `StatusBadge.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Footer Tests`** (1 nodes): `Footer.test.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Status Badge Tests`** (1 nodes): `StatusBadge.test.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Avatar Tests`** (1 nodes): `Avatar.test.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `API URL Property Tests`** (1 nodes): `api-url.property.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Settings Page`** (1 nodes): `Settings.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Settings Tests`** (1 nodes): `Settings.test.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Checklist Detail Tests`** (1 nodes): `ChecklistDetail.test.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Submission Review Tests`** (1 nodes): `SubmissionReview.test.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Create Template Tests`** (1 nodes): `CreateTemplate.test.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Login Tests`** (1 nodes): `Login.test.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Role Assignment Tests`** (1 nodes): `RoleAssignment.test.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Backend Index Tests`** (1 nodes): `index.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Backend Index`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Seed E2E Tests`** (1 nodes): `scalability-seed.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Notifications E2E`** (1 nodes): `notifications.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Auth E2E Tests`** (1 nodes): `auth.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `PDF E2E Tests`** (1 nodes): `scalability-pdf.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Checklist Fill E2E`** (1 nodes): `checklist-fill.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Admin Dashboard E2E`** (1 nodes): `admin-dashboard.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Submission Review E2E`** (1 nodes): `submission-review.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Settings E2E`** (1 nodes): `settings.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Pagination E2E`** (1 nodes): `scalability-pagination.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `JWT E2E Tests`** (1 nodes): `scalability-jwt.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Code Splitting E2E`** (1 nodes): `scalability-code-splitting.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Network Resilience E2E`** (1 nodes): `scalability-network.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Batch Images E2E`** (1 nodes): `scalability-batch-images.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Conflict Resolution E2E`** (1 nodes): `scalability-conflict.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Create Template E2E`** (1 nodes): `create-template.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Checklist Lifecycle E2E`** (1 nodes): `checklist-lifecycle.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Checklist Detail E2E`** (1 nodes): `checklist-detail.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Operator Dashboard E2E`** (1 nodes): `operator-dashboard.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Vitest Config (Backend)`** (1 nodes): `vitest.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Backend Types Index`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Env Config Tests`** (1 nodes): `env.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `DynamoDB Query Tests`** (1 nodes): `dynamo.query.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Checklists Route Tests`** (1 nodes): `checklists.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Users Route Tests`** (1 nodes): `users.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Auth Route Tests`** (1 nodes): `auth.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Images Route Tests`** (1 nodes): `images.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Templates Route Tests`** (1 nodes): `templates.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Lines Route Tests`** (1 nodes): `lines.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Checklist Property Tests`** (1 nodes): `checklist-lifecycle.property.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Connections Tests`** (1 nodes): `connections.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `WebSocket Local Tests`** (1 nodes): `local-ws.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Should `API Service Layer` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._
- **Should `DynamoDB Data Layer` be split into smaller, more focused modules?**
  _Cohesion score 0.07 - nodes in this community are weakly interconnected._
- **Should `API Gateway Broadcaster` be split into smaller, more focused modules?**
  _Cohesion score 0.12 - nodes in this community are weakly interconnected._