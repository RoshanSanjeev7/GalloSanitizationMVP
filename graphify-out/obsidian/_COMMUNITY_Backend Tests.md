---
type: community
cohesion: 0.21
members: 16
---

# Backend Tests

**Cohesion:** 0.21 - loosely connected
**Members:** 16 nodes

## Members
- [[auth-flow.integration.test.ts]] - code - backend/src/__tests__/auth-flow.integration.test.ts
- [[bulletproof.test.ts]] - code - backend/src/__tests__/bulletproof.test.ts
- [[checklist-workflow.integration.test.ts]] - code - backend/src/__tests__/checklist-workflow.integration.test.ts
- [[factories.ts_1]] - code - backend/src/__tests__/factories.ts
- [[factories.ts]] - code - frontend/src/__tests__/factories.ts
- [[makeAdminToken()]] - code - backend/src/__tests__/factories.ts
- [[makeChecklist()]] - code - backend/src/__tests__/factories.ts
- [[makeChecklistItem()]] - code - backend/src/__tests__/factories.ts
- [[makeConditionalCheckFailedError()]] - code - backend/src/__tests__/bulletproof.test.ts
- [[makeLine()]] - code - backend/src/__tests__/factories.ts
- [[makeOperatorToken()]] - code - backend/src/__tests__/factories.ts
- [[makeSubmittedChecklist()]] - code - backend/src/__tests__/factories.ts
- [[makeTemplate()]] - code - backend/src/__tests__/factories.ts
- [[makeUser()]] - code - backend/src/__tests__/factories.ts
- [[makeUserPublic()]] - code - frontend/src/__tests__/factories.ts
- [[nextId()]] - code - backend/src/__tests__/factories.ts

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Backend_Tests
SORT file.name ASC
```

## Connections to other communities
- 1 edge to [[_COMMUNITY_PDF & S3 Storage]]

## Top bridge nodes
- [[factories.ts_1]] - degree 13, connects to 1 community