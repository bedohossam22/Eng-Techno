# Security Bug Report: Unauthorized Task Status Modification

## 1. Executive Summary
- **Bug Identifier**: SEC-001 (Broken Object-Level Authorization / BLA)
- **Severity**: High
- **Affected Endpoints**: `PATCH /tasks/:taskId/status` (and related task edit operations)
- **Status**: Fixed & Verified with Automated E2E Tests

---

## 2. Root Cause
In [`apps/api/src/tasks/tasks.controller.ts`](file:///f:/Eng-Techno/Full-Stack-Assessment-Task/apps/api/src/tasks/tasks.controller.ts#L70-L76), the route handler `updateStatus` (`PATCH /tasks/:taskId/status`) failed to extract the authenticated user identity via the `@CurrentUser('id')` decorator.

Consequently, [`TasksService.updateStatus`](file:///f:/Eng-Techno/Full-Stack-Assessment-Task/apps/api/src/tasks/tasks.service.ts#L116-L123) did not receive a `userId` argument and bypassed all project-level authorization checks (`ProjectAccessService.assertCanView`). The service executed `task.status = dto.status; await task.save();` unconditionally for any request providing a valid task ID.

---

## 3. Impact
- **Authorization Bypass**: Any authenticated user—or an external user without membership in the project or organization—could modify task statuses across any project in the database simply by knowing or guessing a task's `ObjectId`.
- **Data Integrity & Workflow Disruption**: Unauthorized status transitions (e.g. marking pending work as `DONE` or `BACKLOG`) could disrupt team workflows and compromise project status tracking without audit checks.

---

## 4. Reproduction Steps
1. Authenticate as **User A** who belongs to **Organization A / Project A**.
2. Authenticate as **User B** (**Outsider**) who has no membership in **Project A**.
3. As User A, create a task in Project A (e.g., Task ID `650000000000000000000001`, status `TODO`).
4. As User B, issue an HTTP PATCH request to update the task status:
   ```http
   PATCH /tasks/650000000000000000000001/status HTTP/1.1
   Host: localhost:4000
   Authorization: Bearer <User_B_JWT_Token>
   Content-Type: application/json

   {
     "status": "DONE"
   }
   ```
5. **Observed Behavior (Before Fix)**: The server returned `200 OK` and updated the task status to `DONE` despite User B lacking project access.
6. **Expected Behavior**: The server must reject the request with `403 Forbidden`.

---

## 5. Fix Applied

### Backend Controller Modification
Updated [`TasksController.updateStatus`](file:///f:/Eng-Techno/Full-Stack-Assessment-Task/apps/api/src/tasks/tasks.controller.ts) to extract `@CurrentUser('id') userId: string` and forward it to `TasksService`:

```ts
@Patch('tasks/:taskId/status')
updateStatus(
  @Param('taskId') taskId: string,
  @CurrentUser('id') userId: string,
  @Body() dto: UpdateTaskStatusDto,
): Promise<TaskDetail> {
  return this.tasksService.updateStatus(
    toObjectId(taskId, 'task id'),
    toObjectId(userId, 'user id'),
    dto,
  );
}
```

### Backend Service Modification
Updated [`TasksService.updateStatus`](file:///f:/Eng-Techno/Full-Stack-Assessment-Task/apps/api/src/tasks/tasks.service.ts) to enforce `assertCanView` and permission validation (`canManage(access) || isCreator`):

```ts
async updateStatus(
  taskId: Types.ObjectId,
  userId: Types.ObjectId,
  dto: UpdateTaskStatusDto,
): Promise<TaskDetail> {
  const task = await this.findTaskOrFail(taskId);
  const access = await this.projectAccessService.assertCanView(task.projectId, userId);

  const isCreator = task.createdBy.equals(userId);
  if (!canManage(access) && !isCreator) {
    throw new ForbiddenException('You do not have permission to edit this task');
  }

  task.status = dto.status;
  await task.save();

  return this.toDetail(task, access.project);
}
```

---

## 6. Regression Prevention & Verification

### Automated E2E Test Suite
Added automated regression test cases in [`apps/api/test/tasks.e2e.spec.ts`](file:///f:/Eng-Techno/Full-Stack-Assessment-Task/apps/api/test/tasks.e2e.spec.ts):

1. **`refuses to update task status for someone outside the project`**: Asserts that `PATCH /tasks/:taskId/status` with an outsider token returns `403 Forbidden`.
2. **`refuses to edit task details for someone outside the project`**: Asserts that `PATCH /tasks/:taskId` with an outsider token returns `403 Forbidden`.
3. **`allows a project member to update task status`**: Verifies that authorized project members can update task statuses (`200 OK`).

### Test Execution Results
Executed `pnpm --filter @projectflow/api test`:
```
PASS test/tasks.e2e.spec.ts
PASS test/comments.e2e.spec.ts
PASS test/projects.e2e.spec.ts
PASS test/auth.e2e.spec.ts

Test Suites: 4 passed, 4 total
Tests:       23 passed, 23 total
```
