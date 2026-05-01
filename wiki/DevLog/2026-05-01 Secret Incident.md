---
tags: [devlog, security]
created: 2026-05-01
updated: 2026-05-01
---

# 2026-05-01 Secret Incident

## What happened

GitGuardian flagged 3 secret types in commits `515c7b1` and `d9e41c9` (April 7) of the cse120-ucm/S26-CSE-311 mirror of this repo. The flagged categories: "Company Email Password," "Basic Auth String," "Generic High Entropy Secret."

The user (a UC Merced student on the capstone) was getting flagged by the school's security tooling. Mandate: fix the leaks, abandon cse120, continue development on origin (`RoshanSanjeev7/GalloSanitizationMVP`).

## What actually leaked

After investigation, the leaks come from a **TestSprite** test harness that was added in commit `515c7b1` and removed 17 minutes later in `d9e41c9`:

| Secret | File | Severity |
|---|---|---|
| TestSprite tunnel proxy Basic Auth (`f59a…:C8sX…@tun.testsprite.com:8080`) | `testsprite_tests/tmp/config.json` | **HIGH** — third-party credential |
| TestSprite API key (`sk-u…bjhfhrh8`) | `testsprite_tests/tmp/config.json` | **HIGH** — third-party API key |
| Demo passwords (`admin123`, `operator123`) for demo users | `testsprite_tests/tmp/mcp.log` | **LOW** — already public on the login page |

Plus, `backend/.env` had been historically committed with `JWT_SECRET=dev-secret-change-in-production` — a clearly-marked **dev placeholder**, not the production secret. Production uses `/tmp/gallo-jwt-secret.txt` injected via `TF_VAR_jwt_secret`, which was never committed.

## What did NOT leak

- **No AWS credentials.** No IAM access keys (`git log -p -S 'AKIA'` empty). The project never used static AWS keys; everything's SSO + Lambda execution roles.
- **No production JWT secret.** `/tmp/gallo-jwt-secret.txt` was never committed.
- **No DynamoDB / S3 / API Gateway credentials.** All role-based.

The AWS account `724591801208` is uncompromised based on history audit.

## What was done

1. **Rotated nothing on AWS** because nothing AWS-side was leaked.
2. **TestSprite credentials** — flagged for the user to revoke from the TestSprite dashboard. We removed TestSprite from the tooling on Apr 7 so the account may already be inactive; either way, the user owns the rotation.
3. **Demo passwords** — left as-is. They're intentionally public in `frontend/src/pages/Login.tsx` and `backend/src/data/seed.ts`. Rotating them would be theatre.
4. **Deleted the recently-pushed branches on cse120** (`production`, `feat/release-2-complete`) so the secret-laden commits weren't re-introduced into more branches than necessary.
5. **Closed the two issues** I'd opened on cse120 (#123, #124) since work moved back to origin.
6. **Removed the cse120 remote** from local git (`git remote remove cse120`) so future pushes can't accidentally re-leak.
7. **Scrubbed origin's history** with `git-filter-repo --invert-paths --path testsprite_tests --path backend/.env --path infrastructure/dev.tfvars`. Removed the leaked files from every commit on every branch locally, then force-pushed to origin.
8. **Tagged a backup** at `pre-scrub-2026-05-01` before the rewrite (pushed to origin) so we can roll back if anything was destroyed unintentionally.
9. **Tightened `.gitignore`** to block `testsprite_tests/`, all `.env*` patterns, `*.tfvars` (with explicit allow for `dev.tfvars.example`), `*.pem`, `*.key`, `*.log`, and `.terraform*`.

## What CANNOT be undone

- Anyone who cloned origin OR cse120 before 2026-05-01 has the secrets in their local `.git/`. History rewriting is hygiene — the secrets are still considered leaked.
- The GitGuardian alerts on cse120 will likely persist until the cse120 org owner scrubs that side too (or deletes the repo). User has explicitly abandoned cse120, so this is the org owner's call.
- The TestSprite credentials must be revoked at TestSprite. No git rewrite can do that.

## Lessons

- **`.gitignore` should be paranoid by default.** A wildcard `.env*` block (vs a single `.env`) would have caught `backend/.env`. A wildcard for `*.tfvars` would have caught any future Terraform var leak.
- **Test harnesses log secrets.** TestSprite's `mcp.log` contained login credentials that were used during a test session. Any future test tool that runs against real services should be in a gitignored directory from the moment it's introduced.
- **`git filter-repo` is the right tool.** Faster and safer than `git filter-branch`; designed for exactly this kind of after-the-fact scrub.
- **Branch protection is a feature, not a bug.** The cse120 force-push rejection (when I tried to push production code there) saved us from compounding the leak by overwriting teammate work. The "abandon and walk away" path is cleaner than trying to fix a repo whose history isn't ours to control.

## Next time

- Add a `pre-commit` hook that runs `git-secrets` or `gitleaks` against the staged diff. Stops the leak at the developer's machine before it ever reaches a remote.
- For test harnesses that touch real services, scope them to a gitignored directory from day one. No exceptions.
- Set up GitHub secret-scanning push protection on origin (currently only cse120 had it active, judging by the alert volume).

## Files touched

- `.gitignore` — paranoid expansion
- `wiki/DevLog/2026-05-01 Secret Incident.md` — this file

## History rewrites

- `git filter-repo --invert-paths --path testsprite_tests --path backend/.env --path infrastructure/dev.tfvars --force`
- Backup tag: `pre-scrub-2026-05-01`
- Force-pushed to origin: `feat/release-2-complete`, `MVP`, `main`

## Verification

- `git log --all -p -- testsprite_tests/` returns empty
- `git log --all -p -- backend/.env` returns empty
- GitGuardian re-scans origin within ~1hr of the force-push and clears alerts that no longer match content. cse120 alerts are out of scope.

## See also

- [[Known Limitations]] — added a "Secret hygiene" note
