---
type: community
cohesion: 0.12
members: 20
---

# API Gateway Broadcaster

**Cohesion:** 0.12 - loosely connected
**Members:** 20 nodes

## Members
- [[.broadcastPresence()]] - code - backend/src/ws/apigw-ws.ts
- [[.broadcastPresence()_1]] - code - backend/src/ws/local-ws.ts
- [[.broadcastPresenceSummary()]] - code - backend/src/ws/apigw-ws.ts
- [[.broadcastPresenceSummary()_1]] - code - backend/src/ws/local-ws.ts
- [[.broadcastToChecklist()]] - code - backend/src/ws/apigw-ws.ts
- [[.broadcastToChecklist()_1]] - code - backend/src/ws/local-ws.ts
- [[.getChecklistPresence()]] - code - backend/src/ws/apigw-ws.ts
- [[.getChecklistPresence()_1]] - code - backend/src/ws/local-ws.ts
- [[.handleConnection()]] - code - backend/src/ws/local-ws.ts
- [[.handleMessage()]] - code - backend/src/ws/local-ws.ts
- [[.init()]] - code - backend/src/ws/apigw-ws.ts
- [[.init()_1]] - code - backend/src/ws/local-ws.ts
- [[.sendToConnection()]] - code - backend/src/ws/apigw-ws.ts
- [[ApiGatewayBroadcaster]] - code - backend/src/ws/apigw-ws.ts
- [[LocalWsBroadcaster]] - code - backend/src/ws/local-ws.ts
- [[apigw-ws.ts]] - code - backend/src/ws/apigw-ws.ts
- [[broadcaster.ts]] - code - backend/src/ws/broadcaster.ts
- [[createBroadcaster()]] - code - backend/src/ws/broadcaster.ts
- [[local-ws.ts]] - code - backend/src/ws/local-ws.ts
- [[messages.ts]] - code - backend/src/ws/messages.ts

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/API_Gateway_Broadcaster
SORT file.name ASC
```

## Connections to other communities
- 1 edge to [[_COMMUNITY_Server Config & Routes]]

## Top bridge nodes
- [[broadcaster.ts]] - degree 5, connects to 1 community