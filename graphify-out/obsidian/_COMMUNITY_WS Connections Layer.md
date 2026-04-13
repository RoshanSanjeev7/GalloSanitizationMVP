---
type: community
cohesion: 0.29
members: 10
---

# WS Connections Layer

**Cohesion:** 0.29 - loosely connected
**Members:** 10 nodes

## Members
- [[connections.ts]] - code - backend/src/data/connections.ts
- [[deleteConnection()]] - code - backend/src/data/connections.ts
- [[getAllConnections()]] - code - backend/src/data/connections.ts
- [[getConnectionsByChannel()]] - code - backend/src/data/connections.ts
- [[getConnectionsByChecklist()]] - code - backend/src/data/connections.ts
- [[putConnection()]] - code - backend/src/data/connections.ts
- [[touchConnection()]] - code - backend/src/data/connections.ts
- [[ttlFromNow()]] - code - backend/src/data/connections.ts
- [[updateConnectionMachine()]] - code - backend/src/data/connections.ts
- [[updateConnectionSubscription()]] - code - backend/src/data/connections.ts

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/WS_Connections_Layer
SORT file.name ASC
```

## Connections to other communities
- 1 edge to [[_COMMUNITY_DynamoDB Data Layer]]

## Top bridge nodes
- [[connections.ts]] - degree 10, connects to 1 community