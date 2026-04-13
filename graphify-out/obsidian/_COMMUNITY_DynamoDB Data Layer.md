---
type: community
cohesion: 0.07
members: 34
---

# DynamoDB Data Layer

**Cohesion:** 0.07 - loosely connected
**Members:** 34 nodes

## Members
- [[appendChecklistImages()]] - code - backend/src/data/dynamo.ts
- [[conditionalDeleteChecklist()]] - code - backend/src/data/dynamo.ts
- [[conditionalPutChecklist()]] - code - backend/src/data/dynamo.ts
- [[conditionalStatusTransition()]] - code - backend/src/data/dynamo.ts
- [[createUserWithEmailLock()]] - code - backend/src/data/dynamo.ts
- [[deleteChecklist()_1]] - code - backend/src/data/dynamo.ts
- [[deleteTemplate()_1]] - code - backend/src/data/dynamo.ts
- [[deleteUser()_1]] - code - backend/src/data/dynamo.ts
- [[deleteUserWithEmailLock()]] - code - backend/src/data/dynamo.ts
- [[dynamo.ts]] - code - backend/src/data/dynamo.ts
- [[getAllChecklists()]] - code - backend/src/data/dynamo.ts
- [[getAllLines()]] - code - backend/src/data/dynamo.ts
- [[getAllTemplates()]] - code - backend/src/data/dynamo.ts
- [[getAllUsers()]] - code - backend/src/data/dynamo.ts
- [[getChecklist()_1]] - code - backend/src/data/dynamo.ts
- [[getChecklistsByOperator()]] - code - backend/src/data/dynamo.ts
- [[getChecklistsByStatus()]] - code - backend/src/data/dynamo.ts
- [[getLine()]] - code - backend/src/data/dynamo.ts
- [[getTemplate()_1]] - code - backend/src/data/dynamo.ts
- [[getTemplatesByLineId()]] - code - backend/src/data/dynamo.ts
- [[getUser()]] - code - backend/src/data/dynamo.ts
- [[getUserByEmail()]] - code - backend/src/data/dynamo.ts
- [[markChecklistViewed()]] - code - backend/src/data/dynamo.ts
- [[putChecklist()]] - code - backend/src/data/dynamo.ts
- [[putLine()]] - code - backend/src/data/dynamo.ts
- [[putSafe()]] - code - backend/src/data/seed-dynamo.ts
- [[putTemplate()]] - code - backend/src/data/dynamo.ts
- [[putUser()]] - code - backend/src/data/dynamo.ts
- [[queryChecklists()]] - code - backend/src/data/dynamo.ts
- [[removeChecklistImage()]] - code - backend/src/data/dynamo.ts
- [[seed-dynamo.test.ts]] - code - backend/src/data/seed-dynamo.test.ts
- [[seed-dynamo.ts]] - code - backend/src/data/seed-dynamo.ts
- [[seedIfEmpty()_1]] - code - backend/src/data/seed-dynamo.ts
- [[updateChecklistMachine()_1]] - code - backend/src/data/dynamo.ts

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/DynamoDB_Data_Layer
SORT file.name ASC
```

## Connections to other communities
- 2 edges to [[_COMMUNITY_PDF & S3 Storage]]
- 1 edge to [[_COMMUNITY_Server Config & Routes]]
- 1 edge to [[_COMMUNITY_WS Connections Layer]]

## Top bridge nodes
- [[dynamo.ts]] - degree 34, connects to 2 communities
- [[seed-dynamo.ts]] - degree 5, connects to 1 community