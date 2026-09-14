# AI Usage Log — ProjectFlow Assessment

## Tools Used

| Tool | Purpose |
|------|---------|
| **Antigravity (AI Coding Assistant)** | Primary AI pair-programmer throughout the assessment |
| **VS Code** | Editor / workspace navigation |
| **PowerShell** | Running pnpm commands, git |

---

## How I Used AI

### 1. Architectural Planning & Implementation Roadmap with Gemini
Collaborated with Gemini / AI to establish a structured, phased execution plan before touching code:
- **Phase 1: Environment & Tooling Alignment** — Diagnosed monorepo build order requirements and Windows PowerShell compatibility (`dev` script port evaluation).
- **Phase 2: Security & Authorization Audit** — Mapped out RBAC/ABAC boundaries, identifying the BOLA vulnerability in task status modification and designing the least-privilege fix.
- **Phase 3: Data Modeling & Schema Design** — Planned the `Activity` collection schema, compound indexing strategy (`{ taskId: 1, createdAt: -1 }`), and task `assigneeId` relation to ensure $N+1$ query prevention and scalability.
- **Phase 4: Full-Stack Feature Flow** — Designed end-to-end contract definitions in `@projectflow/shared`, backend service methods with role-based assignment guards, TanStack Query cache invalidation strategy, and UI components (`TaskAssigneeSelect` & `TaskActivityTimeline`).
- **Phase 5: Automated & Manual Verification** — Structured E2E test suites with in-memory database isolation and regression testing before final documentation.

### 2. Codebase Familiarization
Directed the AI to inspect the full project structure before making any changes:
- Read `README.md`, `package.json`, `.env.example`, Mongoose schemas, NestJS controllers and services, and frontend feature hooks.
- AI was used to produce the initial architecture summary in `ASSESSMENT_NOTES.md` and identify the module boundaries.

### 3. Bug Discovery (Part 5)
Asked the AI to run the backend and capture the startup logs to verify the server was functioning. Then directed it to:
- Read `tasks.controller.ts` and `tasks.service.ts` line by line.
- Compare the `updateStatus` handler against the `update` and `remove` handlers to spot the missing `@CurrentUser('id')` parameter.

### 4. Bug Fix (Part 5)
Directed the AI to apply the two-line controller fix and the service-level `assertCanView` + permission guard addition. Reviewed the diff before confirming.

### 5. E2E Test Authoring (Part 5)
AI drafted 3 regression test cases. Reviewed and approved with one modification — see "Rejected/Modified Suggestion" below.

### 6. Task Assignment Feature (Part 2)
Designed the data model and business rules myself, then directed AI to implement:
- `Activity` Mongoose schema and index.
- Assignment validation logic inside `TasksService.update`.
- `findActivity` batch user resolution (explicitly asked for N+1 prevention).
- `GET /tasks/:taskId/activity` controller route.

### 7. Frontend Components (Part 3)
Directed AI to build `TaskAssigneeSelect` and `TaskActivityTimeline` following the same pattern as the existing `TaskStatusSelect` component. Reviewed JSX output for consistency.

### 8. Documentation
AI drafted `ASSESSMENT_NOTES.md`, `BUG_REPORT.md`, and the updated `README.md` based on explicit prompts. All content was reviewed and edited for accuracy before saving.

---

## One Rejected Suggestion

**Context**: When authoring the `useUpdateTaskAssignee` hook, the AI initially suggested using `onSettled` with a blanket `refetchQueries` call:

```ts
// AI's first suggestion (rejected)
onSettled: async () => {
  await queryClient.refetchQueries({ queryKey: queryKeys.task(taskId) });
  await queryClient.refetchQueries({ queryKey: queryKeys.taskActivity(taskId) });
},
```

**Why I rejected it**: `refetchQueries` causes a network request regardless of success or failure. On error, this would refetch stale data unnecessarily. The correct pattern is:
- On **success**: update the task cache via `setQueryData` (optimistic-style) and invalidate the activity list so it refetches.
- On **error**: do nothing — the existing data stays intact and the user sees the error toast.

**What was used instead**:

```ts
// What I directed instead
onSuccess: async (task) => {
  queryClient.setQueryData(queryKeys.task(taskId), task);
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.projectTasks(projectId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.taskActivity(taskId) }),
  ]);
},
```

---

## Modified Generated Code

### `task-activity-timeline.tsx` — `renderActivityText` function

**AI-generated version** used a simple string map:

```ts
if (item.type === ActivityType.TASK_ASSIGNEE_CHANGED) {
  return `assigned ${item.metadata.to?.name ?? 'someone'}`;
}
```

**Problem**: Did not handle the self-assignment case ("assigned themselves"), the unassign case ("unassigned X"), or the missing user edge case gracefully.

**Modified version**:

```ts
function renderActivityText(item: ActivityEntry): string {
  if (item.type === ActivityType.TASK_ASSIGNEE_CHANGED) {
    const { from, to } = item.metadata;
    if (to) {
      return to.id === item.actor.id ? 'assigned themselves' : `assigned ${to.name}`;
    }
    if (from) return `unassigned ${from.name}`;
    return 'unassigned this task';
  }
  return 'updated this task';
}
```

This handles all four cases: assign-self, assign-other, unassign-specific, and fallback.
