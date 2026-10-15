import { EmptyState, PageHeader } from '@/components/workspace-ui';

export default function DeveloperCenterPage() {
  return (
    <div>
      <PageHeader title="Developer Center" description="Tools, API references, and automation workflows." />
      <EmptyState title="No developer tools configured" description="Local integrations and API tooling can be added to this space." />
    </div>
  );
}
