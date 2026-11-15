'use client';

import { useState } from 'react';
import { Lightbulb, Pencil, Plus } from 'lucide-react';

import { useI18n } from '@/components/i18n-provider';
import { IdeaDialog, ideaStatusKeys as statusKeys, ideaStatuses as statuses } from '@/components/idea-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DeleteButton, EmptyState, PageHeader, PageSkeleton } from '@/components/workspace-ui';
import { OpenFromQuery, useClearQueryId } from '@/components/open-from-query';
import { useWorkspace } from '@/components/workspace-provider';
import type { Idea, IdeaStatus } from '@/lib/types';

const statusVariant = { new: 'default', exploring: 'warning', planned: 'success', archived: 'secondary' } as const;

export default function IdeasPage() {
  const { t } = useI18n();
  const { data, loading, update, remove } = useWorkspace();
  const [filter, setFilter] = useState<'all' | IdeaStatus>('all');
  const [editing, setEditing] = useState<Idea | 'new' | null>(null);
  const clearQuery = useClearQueryId();

  if (loading) return <PageSkeleton />;

  const ideas = data.ideas.filter((idea) => (filter === 'all' ? idea.status !== 'archived' : idea.status === filter));

  return (
    <div>
      <PageHeader title={t('ideas.title')} description={t('ideas.description')} action={<Button onClick={() => setEditing('new')}><Plus />{t('ideas.new')}</Button>} />
      <Tabs value={filter} onValueChange={(value) => setFilter(value as typeof filter)} className="mb-4">
        <TabsList>
          <TabsTrigger value="all">{t('common.all')}</TabsTrigger>
          {statuses.map((status) => <TabsTrigger key={status} value={status}>{t(statusKeys[status])}</TabsTrigger>)}
        </TabsList>
      </Tabs>

      {ideas.length ? (
        <div className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {ideas.map((idea) => (
            <Card key={idea.id} className="card-hover flex flex-col">
              <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-3">
                <CardTitle className="text-base leading-snug">{idea.title}</CardTitle>
                <div className="-mr-2 -mt-1 flex shrink-0">
                  <Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label={`${t('common.edit')}: ${idea.title}`} onClick={() => setEditing(idea)}><Pencil /></Button>
                  <DeleteButton name={idea.title} onConfirm={() => void remove('ideas', idea.id)} />
                </div>
              </CardHeader>
              <CardContent className="flex-1 space-y-3">
                {idea.description && <CardDescription className="line-clamp-4 whitespace-pre-line">{idea.description}</CardDescription>}
                {idea.tags && <div className="flex flex-wrap gap-1">{idea.tags.split(',').map((tag) => tag.trim()).filter(Boolean).map((tag) => <Badge key={tag} variant="outline">#{tag}</Badge>)}</div>}
              </CardContent>
              <CardFooter>
                <Select value={idea.status} onValueChange={(value) => void update('ideas', idea.id, { status: value as IdeaStatus })}>
                  <SelectTrigger className="h-8 w-auto gap-2 border-0 bg-transparent px-0 shadow-none focus:ring-0" aria-label={t('common.status')}>
                    <Badge variant={statusVariant[idea.status]}>{t(statusKeys[idea.status])}</Badge>
                  </SelectTrigger>
                  <SelectContent>{statuses.map((status) => <SelectItem key={status} value={status}>{t(statusKeys[status])}</SelectItem>)}</SelectContent>
                </Select>
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState icon={Lightbulb} title={t('ideas.empty')} description={t('ideas.emptyDesc')} action={<Button variant="outline" onClick={() => setEditing('new')}><Plus />{t('ideas.new')}</Button>} />
      )}

      <OpenFromQuery items={data.ideas} onOpen={setEditing} />
      <IdeaDialog idea={editing} onClose={() => { setEditing(null); clearQuery(); }} />
    </div>
  );
}
