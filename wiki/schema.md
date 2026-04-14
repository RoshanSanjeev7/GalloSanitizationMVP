---
tags: [meta]
created: 2026-04-09
updated: 2026-04-13
---

# Wiki Schema

This document defines how the wiki is structured and maintained. Every LLM session that modifies this project should follow these rules.

## Structure

```
wiki/
  index.md          # Content catalog -- every page with link + summary
  log.md            # Chronological record of all changes
  schema.md         # This file -- conventions and workflows
  Architecture/     # System architecture, data models, API
  Subsystems/       # WebSocket, concurrency, auto-save, etc.
  Decisions/        # ADRs and design choices
  Runbooks/         # Setup, testing, troubleshooting
  DevLog/           # Session notes, bugs found, patterns learned
```

## Page Format

Every page starts with YAML frontmatter:

```yaml
---
tags: [architecture]  # One of: architecture, subsystem, decision, devlog, runbook
created: 2026-04-09
updated: 2026-04-13
---
```

## Backlink Rules

1. Every `[[backlink]]` must point to a page that exists
2. Links must connect genuinely related ideas
3. Embed links in prose: "The [[Optimistic Concurrency]] system prevents this"
4. Every page has a "See also" section with 2-3 related pages
5. When creating a new page, add backlinks in BOTH directions

## Workflows

### After a code change

1. Update affected pages (architecture, subsystem, API)
2. If the change represents a decision, create/update a Decision page
3. Update `index.md` if new pages were created
4. Append to `log.md`

### After answering a question

If the answer produced useful analysis or synthesis, file it as a page:
- Comparison -> Decision page
- Architecture question -> update the relevant architecture page
- Bug investigation -> DevLog entry

### Lint pass

Periodically check:
- Orphan pages (no inbound links)
- Missing pages (referenced but don't exist)
- Stale content (contradicted by recent changes)
- Missing cross-references

## See also

- [[index]] -- the content catalog this schema governs
- [[log]] -- the chronological record of all changes
