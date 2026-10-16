<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## BookKeep project

- **Read `PLAN.md` before doing any work** — it is the master implementation plan (phases P0–P11, task IDs, API contracts, binding conventions). Update its checkboxes as you complete tasks.
- Full product spec: `BookKeep Full Project Specification.md`.
- Key conventions: Route Handlers only; every query scoped by session `businessId`; errors shaped `{ "error": { "code", "message" } }`; store UTC / display in business timezone; prices are integers in smallest unit.
- Implementation plan: `PLAN.md` is the working checklist; keep it updated as tasks progress.
