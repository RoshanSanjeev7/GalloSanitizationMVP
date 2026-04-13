---
type: community
cohesion: 0.22
members: 11
---

# PDF & S3 Storage

**Cohesion:** 0.22 - loosely connected
**Members:** 11 nodes

## Members
- [[deleteImage()_1]] - code - backend/src/data/s3.ts
- [[generatePdfBuffer()]] - code - backend/src/data/pdf-generator.ts
- [[getImageUrl()_1]] - code - backend/src/data/s3.ts
- [[getImageUrls()_1]] - code - backend/src/data/s3.ts
- [[handler()]] - code - backend/src/lambda-pdf.ts
- [[lambda-pdf.test.ts]] - code - backend/src/lambda-pdf.test.ts
- [[lambda-pdf.ts]] - code - backend/src/lambda-pdf.ts
- [[pdf-generator.ts]] - code - backend/src/data/pdf-generator.ts
- [[s3.test.ts]] - code - backend/src/data/s3.test.ts
- [[s3.ts]] - code - backend/src/data/s3.ts
- [[uploadImage()]] - code - backend/src/data/s3.ts

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/PDF_&_S3_Storage
SORT file.name ASC
```

## Connections to other communities
- 2 edges to [[_COMMUNITY_DynamoDB Data Layer]]
- 1 edge to [[_COMMUNITY_Backend Tests]]

## Top bridge nodes
- [[lambda-pdf.test.ts]] - degree 5, connects to 2 communities
- [[lambda-pdf.ts]] - degree 5, connects to 1 community