import { EmptyState, PageHeader } from '@/components/workspace-ui';

export default function AIAssistantPage() {
  return (
    <div>
      <PageHeader title="AI Assistant" description="A local-first home for future agent workflows." />
      <EmptyState title="Agent runtime is not connected" description="The assistant interface is ready for a future local agent and MCP integration." />
    </div>
  );
}
