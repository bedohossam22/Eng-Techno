'use client';

import { ActivityType, type ActivityEntry } from '@projectflow/shared';
import { Avatar } from '@/components/ui/avatar';
import { formatDate } from '@/lib/format';
import { useTaskActivity } from '../hooks';

interface TaskActivityTimelineProps {
  taskId: string;
}

export function TaskActivityTimeline({ taskId }: TaskActivityTimelineProps) {
  const { data: activityData, isPending, isError } = useTaskActivity(taskId);

  if (isPending) {
    return <p className="text-[13px] text-muted-foreground">Loading activity history...</p>;
  }

  if (isError || !activityData || activityData.items.length === 0) {
    return (
      <p className="text-[13px] italic text-subtle-foreground">
        No activity recorded yet.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-foreground">Activity History</h2>
      <div className="relative border-l border-border pl-4 space-y-4">
        {activityData.items.map((item) => (
          <ActivityItem key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}

function ActivityItem({ item }: { item: ActivityEntry }) {
  return (
    <div className="relative flex items-start gap-3 text-[13px]">
      <div className="absolute -left-[21px] top-0.5 h-2 w-2 rounded-full bg-border" />
      <Avatar user={item.actor} size="sm" />
      <div className="flex-1 space-y-0.5">
        <p className="text-foreground">
          <span className="font-medium">{item.actor.name}</span>{' '}
          <span className="text-muted-foreground">{renderActivityText(item)}</span>
        </p>
        <p className="text-[11px] text-subtle-foreground">{formatDate(item.createdAt)}</p>
      </div>
    </div>
  );
}

function renderActivityText(item: ActivityEntry): string {
  if (item.type === ActivityType.TASK_ASSIGNEE_CHANGED) {
    const from = item.metadata.from;
    const to = item.metadata.to;

    if (to) {
      if (to.id === item.actor.id) {
        return 'assigned themselves';
      }
      return `assigned ${to.name}`;
    }

    if (from) {
      return `unassigned ${from.name}`;
    }

    return 'unassigned this task';
  }

  return 'updated this task';
}
