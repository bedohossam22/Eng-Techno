'use client';

import { toast } from 'sonner';
import type { UserSummary } from '@projectflow/shared';
import { Avatar } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useProjectMembers } from '@/features/projects/hooks';
import { useUpdateTaskAssignee } from '../hooks';

interface TaskAssigneeSelectProps {
  taskId: string;
  projectId: string;
  assignee: UserSummary | null;
}

const UNASSIGNED_VALUE = 'unassigned';

export function TaskAssigneeSelect({ taskId, projectId, assignee }: TaskAssigneeSelectProps) {
  const { data: members = [] } = useProjectMembers(projectId);
  const updateAssignee = useUpdateTaskAssignee(taskId, projectId);

  const currentValue = assignee?.id ?? UNASSIGNED_VALUE;

  const handleValueChange = (val: string) => {
    const newAssigneeId = val === UNASSIGNED_VALUE ? null : val;
    updateAssignee.mutate(newAssigneeId, {
      onError: (error) => toast.error(error.message),
    });
  };

  return (
    <Select
      value={currentValue}
      disabled={updateAssignee.isPending}
      onValueChange={handleValueChange}
    >
      <SelectTrigger aria-label="Task assignee">
        <SelectValue>
          {assignee ? (
            <div className="flex items-center gap-2">
              <Avatar user={assignee} size="sm" />
              <span className="truncate">{assignee.name}</span>
            </div>
          ) : (
            <span className="text-subtle-foreground italic">Unassigned</span>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={UNASSIGNED_VALUE}>
          <span className="text-subtle-foreground italic">Unassigned</span>
        </SelectItem>
        {members.map((member) => (
          <SelectItem key={member.user.id} value={member.user.id}>
            <div className="flex items-center gap-2">
              <Avatar user={member.user} size="sm" />
              <span>{member.user.name}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
