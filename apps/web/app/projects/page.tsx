import { EmptyState, PageHeader } from '@/components/workspace-ui';

export default function ProjectsPage() {
  return (
    <div>
      <PageHeader title="Projects" description="Keep longer-running work organized." />
      <EmptyState title="No projects yet" description="Projects will appear here when you create or connect them to your workspace." />
    </div>
  );
}
