'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Bot, Settings, Wrench } from 'lucide-react';

import { useI18n } from '@/components/i18n-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CopyButton, PageHeader, PageSkeleton, TokenField, UrlRow } from '@/components/workspace-ui';
import { useWorkspace } from '@/components/workspace-provider';
import { api } from '@/lib/api';

type Tool = { name: string; description: string | null };

export default function AssistantPage() {
  const { t } = useI18n();
  const { settings, loading } = useWorkspace();
  const [tools, setTools] = useState<Tool[]>([]);

  useEffect(() => {
    api.get<Tool[]>('/mcp/tools').then(setTools).catch(() => setTools([]));
  }, []);

  if (loading || !settings) return <PageSkeleton />;

  const token = settings.mcp_require_token ? settings.mcp_token ?? '' : '';
  const authHeader = token ? { Authorization: `Bearer ${token}` } : undefined;
  const snippets = {
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

  return (
    <div>
      <PageHeader
        title={t('assistant.title')}
        description={t('assistant.description')}
        action={<Button variant="outline" asChild><Link href="/settings"><Settings />{t('assistant.configure')}</Link></Button>}
      />

      {!settings.mcp_enabled && (
        <div role="alert" className="mb-6 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm">{t('assistant.disabled')}</div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <div className="space-y-1.5">
              <CardTitle className="flex items-center gap-2 text-base"><Bot className="h-4 w-4" />MCP</CardTitle>
              <CardDescription>Streamable HTTP</CardDescription>
            </div>
            <Badge variant={settings.mcp_enabled ? 'success' : 'secondary'}>{settings.mcp_enabled ? t('assistant.statusOnline') : t('assistant.statusOffline')}</Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <UrlRow label={t('assistant.endpoint')} value={settings.mcp_url} />
            <UrlRow label={t('assistant.localEndpoint')} value={settings.mcp_local_url} />
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">{t('assistant.token')}</p>
              {settings.mcp_require_token ? <TokenField value={settings.mcp_token ?? ''} /> : <p className="text-sm text-muted-foreground">{t('assistant.noTokenRequired')}</p>}
              <p className="text-xs text-muted-foreground">{t('assistant.tokenHint')}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('assistant.setup')}</CardTitle>
            <CardDescription>{t('assistant.setupDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="claudeCode">
              <TabsList>
                <TabsTrigger value="claudeCode">Claude Code</TabsTrigger>
                <TabsTrigger value="desktop">Claude Desktop</TabsTrigger>
                <TabsTrigger value="generic">JSON</TabsTrigger>
              </TabsList>
              {(Object.keys(snippets) as (keyof typeof snippets)[]).map((key) => (
                <TabsContent key={key} value={key} className="relative">
                  <pre className="max-h-64 overflow-auto rounded-lg border bg-muted/50 p-4 pr-12 font-mono text-xs leading-relaxed">{snippets[key]}</pre>
                  <CopyButton value={snippets[key]} className="absolute right-2 top-2" />
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Wrench className="h-4 w-4" />{t('assistant.tools')} <Badge variant="secondary">{tools.length}</Badge></CardTitle>
          <CardDescription>{t('assistant.toolsDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="stagger grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {tools.map((tool) => (
            <div key={tool.name} className="rounded-lg border p-3 transition-colors hover:border-foreground/15 hover:bg-muted/40">
              <p className="font-mono text-xs font-medium">{tool.name}</p>
              {tool.description && <p className="mt-1 text-xs text-muted-foreground">{tool.description}</p>}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
