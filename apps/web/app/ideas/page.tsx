import { EmptyState, PageHeader } from '@/components/workspace-ui';

export default function IdeasPage() {
  return (
    <div>
      <PageHeader title="Ideas" description="Capture sparks before they become projects." />
      <EmptyState title="No ideas captured" description="New ideas and rough concepts will have a home here." />
    </div>
  );
}
