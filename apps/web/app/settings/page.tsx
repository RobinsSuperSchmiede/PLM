import { EmptyState, PageHeader } from '@/components/workspace-ui';

export default function SettingsPage() {
  return (
    <div>
      <PageHeader title="Settings" description="Workspace preferences and local configuration." />
      <EmptyState title="Default settings" description="Your workspace currently uses local browser storage and a dark monochrome theme." />
    </div>
  );
}
