---
type: community
cohesion: 0.67
members: 3
---

# SQS PDF Queue

**Cohesion:** 0.67 - moderately connected
**Members:** 3 nodes

## Members
- [[sendPdfGenerationMessage()]] - code - backend/src/data/sqs.ts
- [[sqs.test.ts]] - code - backend/src/data/sqs.test.ts
- [[sqs.ts]] - code - backend/src/data/sqs.ts

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/SQS_PDF_Queue
SORT file.name ASC
```
