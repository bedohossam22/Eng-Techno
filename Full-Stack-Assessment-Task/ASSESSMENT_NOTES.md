# ProjectFlow — Architectural Assessment & Codebase Notes

## Part 1: Architecture Overview

### Monorepo Structure

ProjectFlow is a **TypeScript monorepo** managed with `pnpm workspaces` and Turborepo:

| Workspace | Technology | Purpose |
|-----------|-----------|---------|
| `apps/api` | NestJS 11 + Mongoose 8 | REST API server |
| `apps/web` | Next.js 16 (App Router) + React 19 + Tailwind CSS 4 | Browser frontend |
| `packages/shared` | TypeScript library | Shared enums, constants, API response types |
| `packages/tsconfig` | TypeScript | Shared `tsconfig.json` base configs |
| `packages/eslint-config` | ESLint | Shared flat ESLint configs |

### Backend (apps/api) — NestJS

Business logic is organized in domain-centric feature modules:

- **Controllers** stay thin: routing, DTO validation via `class-validator`, user identity extraction via `@CurrentUser()`.
- **Services** own all business rules, authorization enforcement, and Mongoose queries.
- **`ProjectAccessService`** is a single centralized access evaluator — answers "may this user touch this project?" by checking organization-level elevated roles (`OWNER`/`ADMIN`) or explicit project membership rows (`PROJECT_MANAGER`/`MEMBER`).
- **Mongoose Schemas** define field types, defaults, and indexes (compound indexes on membership tables).
- **`JwtAuthGuard`** is registered globally; routes opt out via `@Public()` decorator.

### Frontend (apps/web) — Next.js App Router

- **Feature-driven structure** under `src/features/` (`auth`, `projects`, `tasks`, `comments`).
- **TanStack Query v5** owns all server state, background refetching, and invalidation.
- **Centralized query keys** in `lib/query-keys.ts` keep invalidation predictable.
- **Custom feature hooks** (`useTask`, `useProjectTasks`, `useUpdateTaskAssignee`, etc.) encapsulate `useQuery` and `useMutation`.
- **Centralized API client** in `lib/api-client.ts` handles base URL, JWT bearer token attachment, and structured `ApiError` throwing.
- React server components by default; `"use client"` only where hooks or interactivity require it.

---

## Part 2: Identified Risks

### Risk 1 — [Security / Critical] Missing Authorization on Task Status Updates (Now Fixed)
- **Location**: `apps/api/src/tasks/tasks.controller.ts` · `PATCH /tasks/:taskId/status`
- **Description**: The `updateStatus` endpoint did not extract `@CurrentUser('id')` and therefore never called `ProjectAccessService.assertCanView`. Any authenticated user could modify any task's status by knowing or guessing its ObjectId.
- **Impact**: Broken Object-Level Authorization (BOLA/IDOR) — full cross-project data manipulation.
- **Action**: **Fixed** — see `BUG_REPORT.md` for full details and regression tests.

### Risk 2 — [Concurrency] Non-Atomic Task Numbering Race Condition
- **Location**: `apps/api/src/tasks/tasks.service.ts::create`
- **Description**: `const number = (await countDocuments({ projectId })) + 1` is a non-atomic read-then-write. Two concurrent task creations on the same project can resolve the same count value, producing duplicate task numbers and keys (`ENG-3` twice). Likewise, deleting tasks makes future tasks reuse previous numbers.
- **Impact**: Duplicate keys break lookups, user-facing references (e.g. `ENG-3`), and unique-ness guarantees.
- **Action**: Fix Later — implement an atomic `$inc` sequence counter per project document.

### Risk 3 — [Security] JWT Stored in localStorage Vulnerable to XSS
- **Location**: `apps/web/src/lib/auth-storage.ts`
- **Description**: JWT access tokens are stored in `window.localStorage` and attached as `Authorization: Bearer` headers. Any XSS vulnerability — in the app or third-party scripts — can read and exfiltrate these tokens.
- **Impact**: Full account takeover if XSS is introduced.
- **Action**: Fix Later — migrate to `HttpOnly`, `SameSite=Strict` cookies for token storage.

### Risk 4 — [Data Integrity] Non-Transactional Multi-Document Operations
- **Location**: `apps/api/src/tasks/tasks.service.ts::remove`
- **Description**: Deleting a task runs `commentModel.deleteMany` and `task.deleteOne()` inside `Promise.all` without a Mongoose session/transaction. If `task.deleteOne()` fails after comments are already deleted, comments are orphaned or lost.
- **Impact**: Inconsistent database state on partial write failures.
- **Action**: Fix Later — wrap multi-document writes in `startSession()` transactions.

---

## Code Review

### What I Reviewed
Focused on the task modification and authorization layers, specifically:
- `PATCH /tasks/:taskId` — `TasksController.update` + `TasksService.update`
- `PATCH /tasks/:taskId/status` — `TasksController.updateStatus` + `TasksService.updateStatus`
- `TasksService.create` for assignment validation
- `TasksService.findActivity` for N+1 prevention

### Key Observations

| File | Observation |
|------|-------------|
| `tasks.controller.ts` | Controllers are pleasantly thin — no logic leaks into them beyond parameter extraction. |
| `tasks.service.ts` | Services are well-structured but `updateStatus` was missing authorization (fixed). The `toSummaries` helper uses batch aggregation for comment counts — good N+1 avoidance. |
| `project-access.service.ts` | Single-responsibility, well-named (`assertCanView`, `assertCanManage`). Good separation. |
| `tasks.service.ts::create` | `countDocuments + 1` for task numbering is the most acute production risk in the codebase. |
| `jwt-auth.guard.ts` | Guard implementation is correct and global-by-default with `@Public()` opt-out — a secure default. |

---

## Scaling the Activity System

The current `Activity` collection with `{ taskId: 1, createdAt: -1 }` compound index is appropriate for the access pattern `GET /tasks/:taskId/activity`.

**If volume grows significantly:**

1. **Indexing is already correct** — the compound index supports efficient range scans per task sorted by time. No change needed for typical traffic.
2. **Pagination is already in place** — the endpoint uses `skip` + `limit` with `countDocuments`, which is fine up to ~10M activities. Beyond that, use cursor-based pagination (keyset pagination on `_id` or `createdAt`).
3. **Write throughput** — MongoDB handles high-frequency inserts to capped or time-series collections much better. For very high activity write volumes, consider converting the `activities` collection to a **MongoDB Time Series Collection** (`timeseries: { timeField: 'createdAt', metaField: 'taskId' }`).
4. **Fan-out reads** — if activity feeds need to power org-level audit logs or dashboards, a separate aggregation pipeline or a dedicated read replica should be used.
5. **User resolution N+1** — already prevented: `findActivity` collects all unique actor/assignee IDs first, then fetches them in a single `findManyByIds` call.

---

## If I Had Two More Days

Priority order:

1. **Fix atomic task numbering** — the duplicate-key race condition is the highest-impact production bug still outstanding. Replace `countDocuments + 1` with an atomic per-project sequence counter using `$inc` on a `ProjectCounters` collection.
2. **Migrate JWT to HttpOnly cookies** — eliminates the XSS token-theft risk entirely. Requires adding a `/auth/refresh` endpoint and cookie-based token rotation.
3. **Add Mongoose transactions** to task deletion (comments + activities + task) and any future multi-document writes.
4. **Expand test coverage** — add E2E tests for the activity pagination endpoint, unassign flows, and OWNER/ADMIN assignment permissions explicitly.
5. **Add task assignee filter** to `GET /projects/:projectId/tasks` — allows the board to show "tasks assigned to me" view.
6. **Real-time activity feed** — replace polling with WebSocket or SSE so the activity timeline updates without manual refresh.
