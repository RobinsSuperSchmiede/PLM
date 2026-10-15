import { EmptyState, PageHeader } from '@/components/workspace-ui';

export default function KnowledgePage() {
  return (
    <div>
      <PageHeader title="Knowledge" description="Research and reusable insights, kept close at hand." />
      <EmptyState title="Your knowledge base is empty" description="Research and useful references can be collected here." />
    </div>
  );
}
