import { EmptyState, PageHeader } from '@/components/workspace-ui';

export default function MeetingsPage() {
  return (
    <div>
      <PageHeader title="Meetings" description="A place for schedules, agendas, and follow-ups." />
      <EmptyState title="No meetings yet" description="Meeting notes and scheduled sessions will be collected here." />
    </div>
  );
}
