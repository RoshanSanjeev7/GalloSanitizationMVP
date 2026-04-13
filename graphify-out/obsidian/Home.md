---
tags:
  - navigation
  - entrypoint
---

# Gallo Sanitization MVP

A bottling facility sanitation checklist management system. Operators fill out deep cleaning checklists on the factory floor, admins review and approve or deny submissions. The system supports multiple operators editing the same checklist simultaneously, with real-time sync, offline resilience, and a full audit trail.

## Architecture

- [[System Architecture]] -- how the pieces fit together
- [[Checklist Workflow]] -- the core domain: create, fill, submit, approve/deny
- [[DynamoDB Tables]] -- all six tables and their design
- [[Authentication]] -- JWT auth, middleware, token refresh
- [[API Endpoints]] -- every backend route
- [[Frontend Pages]] -- every page in the React app

## Subsystems

- [[WebSocket System]] -- real-time sync and presence
- [[Optimistic Concurrency]] -- conditional writes preventing race conditions
- [[Per-Machine Auto-Save]] -- how collaborative editing works at the machine level
- [[Auto-Save and Conflict Resolution]] -- the full save lifecycle on the frontend
- [[Presence Indicators]] -- who's editing what, in real time
- [[Toast Notifications]] -- slide-in alerts for new submissions
- [[Offline Queue]] -- IndexedDB fallback when the network drops
- [[Audit Log]] -- tracking every significant action
- [[Input Validation]] -- structure checks, MIME whitelists, size limits
- [[Rate Limiting]] -- brute force and abuse protection
- [[Image Handling]] -- S3 upload, presigned URLs, atomic DynamoDB updates
- [[PDF Export]] -- synchronous PDFKit streaming and async SQS/Lambda generation
- [[Roles and Permissions]] -- operator vs admin capabilities

## Decisions

- [[Template Publishing]] -- draft/published workflow for templates
- [[Concurrency Scenarios]] -- every race condition and how it's handled
- [[Admin Safety]] -- preventing admin lockout
- [[Email Uniqueness]] -- transactional enforcement in DynamoDB
- [[JWT Design]] -- why 8-hour tokens, proactive refresh
- [[Denied Is Final]] -- why denied checklists can't be reopened
- [[WebSocket Adapter Pattern]] -- local dev vs production WebSocket
- [[Release 1 Bulletproofing]] -- everything shipped in the first hardening pass
- [[Release 2 Real-time]] -- WebSocket, presence, offline queue, audit log
- [[Environment Variables]] -- every config value

## Production Readiness

- [[Known Limitations]] -- all MVP shortcuts that need fixing before production

## Runbooks

- [[Local Dev Setup]] -- get the app running from scratch
- [[Demo Credentials]] -- test accounts
- [[Running Tests]] -- unit and E2E
- [[Troubleshooting]] -- common issues and fixes
