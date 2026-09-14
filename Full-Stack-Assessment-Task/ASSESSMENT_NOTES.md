# ProjectFlow - Architectural Assessment & Codebase Notes

## Part 1: System Architecture

### 1. Overall Structure
ProjectFlow is structured as a **TypeScript monorepo** managed with `pnpm workspaces` and `Turborepo`:

- **`apps/api` (Backend)**: NestJS 11 application with Mongoose 8 (MongoDB). Organized in domain-centric feature modules (`auth`, `users`, `organizations`, `organization-members`, `projects`, `project-members`, `tasks`, `comments`).
- **`apps/web` (Frontend)**: Next.js 16 (App Router) with React 19 and Tailwind CSS 4. Uses feature-driven modular structure inside `src/features/` (`auth`, `projects`, `tasks`, `comments`, `organizations`).
- **`packages/shared` (Shared Domain)**: Contains cross-cutting domain types, enums (`TaskStatus`, `TaskPriority`, `OrganizationRole`, `ProjectRole`), interfaces (`TaskDetail`, `TaskSummary`, `AuthSession`), DTO constants, and helper functions shared by both frontend and backend.
- **`packages/tsconfig` & `packages/eslint-config`**: Shared base TypeScript and ESLint configuration across the workspace.

---

### 2. Business Logic Location
- **Controllers (`apps/api/src/**/*.controller.ts`)**: Controllers remain thin. Their responsibilities are limited to routing, parameter extraction (`@Param`, `@Query`), request body validation via class-validator DTOs, and extracting authenticated user context via `@CurrentUser()`.
- **Services (`apps/api/src/**/*.service.ts`)**: Business logic, data transformations, database querying via Mongoose models, and domain constraints live entirely inside NestJS `@Injectable()` services.
- **Authorization Layer (`ProjectAccessService`)**: Centralized access evaluation lives in [`apps/api/src/projects/project-access.service.ts`](file:///f:/Eng-Techno/Full-Stack-Assessment-Task/apps/api/src/projects/project-access.service.ts). Access checks resolve organization-level elevated roles (`OWNER` / `ADMIN`) or project-level explicit roles (`PROJECT_MANAGER` / `MEMBER`).
- **Schemas / Domain Models (`apps/api/src/**/schemas/*.schema.ts`)**: Mongoose schemas define field types, indices (such as unique compound keys on membership tables), and timestamps.

---

### 3. Frontend Server State Management
- **TanStack Query 5 (React Query)**: Used for managing all server state, background refetching, and cache management on the client.
- **Centralized Query Keys**: Defined in [`apps/web/src/lib/query-keys.ts`](file:///f:/Eng-Techno/Full-Stack-Assessment-Task/apps/web/src/lib/query-keys.ts) to guarantee consistent cache keys across components and mutation invalidations (`queryClient.invalidateQueries`).
- **Custom Feature Hooks**: Feature hooks (e.g. `useProjectTasks`, `useTask`, `useCreateTask`, `useUpdateTaskStatus` in [`apps/web/src/features/tasks/hooks.ts`](file:///f:/Eng-Techno/Full-Stack-Assessment-Task/apps/web/src/features/tasks/hooks.ts)) encapsulate `useQuery` and `useMutation` hooks.
- **Centralized API Client**: [`apps/web/src/lib/api-client.ts`](file:///f:/Eng-Techno/Full-Stack-Assessment-Task/apps/web/src/lib/api-client.ts) (`apiRequest`) handles base URL configuration, automatically attaches JWT bearer tokens from `localStorage`, and handles structured `ApiError` throwing.

---

## Part 4: Observations & Architectural Risks

### 1. [Security / Critical] Missing Authorization Check on Task Status Update (Broken Level Access Control)
- **Location**: [`apps/api/src/tasks/tasks.controller.ts:70-76`](file:///f:/Eng-Techno/Full-Stack-Assessment-Task/apps/api/src/tasks/tasks.controller.ts#L70-L76) & [`apps/api/src/tasks/tasks.service.ts:116-123`](file:///f:/Eng-Techno/Full-Stack-Assessment-Task/apps/api/src/tasks/tasks.service.ts#L116-L123)
- **Description**: While `tasksService.update()` verifies `assertCanView` and permission guards (`canManage` or `isCreator`), the `updateStatus` method (`PATCH /tasks/:taskId/status`) accepts `taskId` and `dto` but **does not take or verify `userId`**, and never calls `ProjectAccessService.assertCanView`.
- **Risk**: Any authenticated user can modify the status of any task in the database simply by knowing or guessing its `taskId`, bypassing organization and project authorization boundaries.
- **Action Plan**: **Fix Now (Step 2)**. Inject `@CurrentUser('id')` into `updateStatus` controller method and invoke `this.projectAccessService.assertCanView(task.projectId, userId)` in `TasksService.updateStatus`.

---

### 2. [Concurrency / Data Integrity] Non-Atomic Task Numbering Race Condition
- **Location**: [`apps/api/src/tasks/tasks.service.ts:61-62`](file:///f:/Eng-Techno/Full-Stack-Assessment-Task/apps/api/src/tasks/tasks.service.ts#L61-L62)
- **Description**: Task number generation relies on `const taskCount = await this.taskModel.countDocuments({ projectId }); const number = taskCount + 1;`.
- **Risk**: If two tasks are created concurrently in the same project, `countDocuments` will evaluate to the same value for both executions, resulting in duplicate task numbers and key collisions (e.g. two tasks `ENG-3`). Furthermore, deleting a task reduces `countDocuments`, causing future tasks to reuse existing numbers.
- **Action Plan**: **Fix Later / Refactor**. Implement an atomic sequence counter collection or `$inc` document sequence in MongoDB for project task numbers.

---

### 3. [Security / Authentication] LocalStorage Token Storage Vulnerable to XSS
- **Location**: [`apps/web/src/lib/auth-storage.ts`](file:///f:/Eng-Techno/Full-Stack-Assessment-Task/apps/web/src/lib/auth-storage.ts) & [`apps/web/src/lib/api-client.ts:43-46`](file:///f:/Eng-Techno/Full-Stack-Assessment-Task/apps/web/src/lib/api-client.ts#L43-L46)
- **Description**: JWT access tokens are stored directly in browser `localStorage` and attached via `Authorization: Bearer <token>`.
- **Risk**: Any Cross-Site Scripting (XSS) vulnerability in client-side scripts or third-party dependencies can read `localStorage` and steal user access tokens.
- **Action Plan**: **Fix Later**. Migrate token storage to `HttpOnly`, `SameSite=Strict` cookies with cookie-based session handling.

---

### 4. [Data Consistency] Non-Transactional Multi-Document Operations
- **Location**: [`apps/api/src/tasks/tasks.service.ts:129`](file:///f:/Eng-Techno/Full-Stack-Assessment-Task/apps/api/src/tasks/tasks.service.ts#L129) (`remove`)
- **Description**: Deleting a task executes `Promise.all([this.commentModel.deleteMany({ taskId }), task.deleteOne()])` without an active Mongoose transaction session.
- **Risk**: If `task.deleteOne()` fails after comment deletion, comments are lost while the task remains in the database (partial write failure).
- **Action Plan**: **Fix Later**. Introduce Mongoose transaction sessions (`startSession()`) for multi-document operations.
