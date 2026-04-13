---
type: community
cohesion: 0.16
members: 17
---

# Server Config & Routes

**Cohesion:** 0.16 - loosely connected
**Members:** 17 nodes

## Members
- [[auth.ts_1]] - code - backend/src/routes/auth.ts
- [[checklists.ts]] - code - backend/src/routes/checklists.ts
- [[drawLine()]] - code - backend/src/routes/checklists.ts
- [[drawStatus()]] - code - backend/src/routes/checklists.ts
- [[env.ts]] - code - backend/src/config/env.ts
- [[formatDate()_3]] - code - backend/src/routes/checklists.ts
- [[formatTime()_3]] - code - backend/src/routes/checklists.ts
- [[getBroadcaster()_1]] - code - backend/src/routes/checklists.ts
- [[getBroadcaster()]] - code - backend/src/routes/images.ts
- [[images.ts]] - code - backend/src/routes/images.ts
- [[index.ts_1]] - code - backend/src/index.ts
- [[lambda.ts]] - code - backend/src/lambda.ts
- [[lines.ts]] - code - backend/src/routes/lines.ts
- [[startServer()]] - code - backend/src/index.ts
- [[templates.ts]] - code - backend/src/routes/templates.ts
- [[users.ts]] - code - backend/src/routes/users.ts
- [[validateMachines()]] - code - backend/src/routes/checklists.ts

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Server_Config_&_Routes
SORT file.name ASC
```

## Connections to other communities
- 1 edge to [[_COMMUNITY_DynamoDB Data Layer]]
- 1 edge to [[_COMMUNITY_API Gateway Broadcaster]]

## Top bridge nodes
- [[index.ts_1]] - degree 10, connects to 2 communities