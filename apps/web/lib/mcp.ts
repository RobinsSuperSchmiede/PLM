import type { AppSettings } from '@/lib/types';

export type McpClient = 'claudeCode' | 'desktop' | 'generic';

/** Connection snippets for the MCP server, shown on the "MCP & AI" page and in the walkthrough. */
export function mcpSnippets(settings: AppSettings): Record<McpClient, string> {
  const token = settings.mcp_require_token ? settings.mcp_token ?? '' : '';
  const authHeader = token ? { Authorization: `Bearer ${token}` } : undefined;
  return {
    claudeCode: `claude mcp add --transport http anamnesies ${settings.mcp_url}${token ? ` \\\n  --header "Authorization: Bearer ${token}"` : ''}`,
    desktop: JSON.stringify({
      mcpServers: {
        anamnesies: {
          command: 'npx',
          args: ['-y', 'mcp-remote', settings.mcp_url, ...(token ? ['--header', `Authorization: Bearer ${token}`] : [])],
        },
      },
    }, null, 2),
    generic: JSON.stringify({ type: 'http', url: settings.mcp_url, ...(authHeader ? { headers: authHeader } : {}) }, null, 2),
  };
}
