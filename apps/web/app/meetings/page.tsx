'use client';

import { type FormEvent, useState } from 'react';
import { Clock3, Pencil, Plus, Users } from 'lucide-react';

import { MeetingDialog } from '@/components/meeting-dialog';
import { useI18n } from '@/components/i18n-provider';
import { ArchiveButton, ProjectSelect, RelationsPanel, TagInput, useEntityTags } from '@/components/knowledge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { DeleteButton, EmptyState, Field, PageHeader, PageSkeleton } from '@/components/workspace-ui';
import { OpenFromQuery, useClearQueryId } from '@/components/open-from-query';
import { useWorkspace } from '@/components/workspace-provider';
import { formatDate, todayKey } from '@/lib/dates';
import type { Meeting, MeetingStatus } from '@/lib/types';

const statuses: MeetingStatus[] = ['planned', 'done', 'cancelled'];
const statusVariant = { planned: 'outline', done: 'success', cancelled: 'secondary' } as const;

export default function MeetingsPage() {
  const { t, language } = useI18n();
  const { data, loading, remove } = useWorkspace();
  const [editing, setEditing] = useState<Meeting | 'new' | null>(null);
  const clearQuery = useClearQueryId();

  if (loading) return <PageSkeleton />;

  const today = todayKey();
  const upcoming = data.meetings.filter((meeting) => meeting.date >= today).sort((a, b) => `${a.date}${a.time ?? ''}`.localeCompare(`${b.date}${b.time ?? ''}`));
  const past = data.meetings.filter((meeting) => meeting.date < today).sort((a, b) => b.date.localeCompare(a.date));

  const renderList = (meetings: Meeting[]) => meetings.length ? (
    <div className="stagger grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
      {meetings.map((meeting) => (
        <Card key={meeting.id} className="card-hover">
          <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
            <div className="min-w-0 space-y-1.5">
              <CardTitle className="text-base">{meeting.title}</CardTitle>
              <CardDescription className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />{formatDate(meeting.date, language, { weekday: 'short', day: 'numeric', month: 'short' })}{meeting.time ? ` · ${meeting.time}` : ''}</span>
                <Badge variant={statusVariant[meeting.status]}>{t(`meetings.${meeting.status}`)}</Badge>
              </CardDescription>
            </div>
            <div className="flex shrink-0">
              <Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label={`${t('common.edit')}: ${meeting.title}`} onClick={() => setEditing(meeting)}><Pencil /></Button>
              <DeleteButton name={meeting.title} onConfirm={() => void remove('meetings', meeting.id)} />
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {meeting.attendees && (
              <div className="flex flex-wrap items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                {meeting.attendees.split(',').map((name) => name.trim()).filter(Boolean).map((name) => <Badge key={name} variant="secondary">{name}</Badge>)}
              </div>
            )}
            {meeting.agenda && <div><p className="text-xs font-medium text-muted-foreground">{t('meetings.agenda')}</p><p className="mt-1 whitespace-pre-line">{meeting.agenda}</p></div>}
            {meeting.notes && <div><p className="text-xs font-medium text-muted-foreground">{t('meetings.notes')}</p><p className="mt-1 whitespace-pre-line text-muted-foreground">{meeting.notes}</p></div>}
          </CardContent>
        </Card>
      ))}
    </div>
  ) : (
    <EmptyState icon={Users} title={t('meetings.empty')} description={t('meetings.emptyDesc')} action={<Button variant="outline" onClick={() => setEditing('new')}><Plus />{t('meetings.new')}</Button>} />
  );

  return (
    <div>
      <PageHeader title={t('meetings.title')} description={t('meetings.description')} action={<Button onClick={() => setEditing('new')}><Plus />{t('meetings.new')}</Button>} />
      <Tabs defaultValue="upcoming">
        <TabsList>
          <TabsTrigger value="upcoming">{t('meetings.upcoming')} <span className="text-xs text-muted-foreground">{upcoming.length}</span></TabsTrigger>
          <TabsTrigger value="past">{t('meetings.past')} <span className="text-xs text-muted-foreground">{past.length}</span></TabsTrigger>
        </TabsList>
        <TabsContent value="upcoming">{renderList(upcoming)}</TabsContent>
        <TabsContent value="past">{renderList(past)}</TabsContent>
      </Tabs>
      <OpenFromQuery items={data.meetings} onOpen={setEditing} />
      <MeetingDialog meeting={editing} onClose={() => { setEditing(null); clearQuery(); }} />
    </div>
  );
}
