'use client';

import { useMemo, useState } from 'react';
import { Database, FileText, Plus, Search, Table2, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState, PageHeader, PageSkeleton, SearchInput } from '@/components/workspace-ui';
import { useWorkspace } from '@/components/workspace-provider';

export default function DatabasePage() {
  const { data, updateData, loading } = useWorkspace();
  const [query, setQuery] = useState('');
  const filteredRecords = useMemo(() => data.records.filter((row) =>
    `${row.name} ${row.status} ${row.id}`.toLowerCase().includes(query.toLowerCase()),
  ), [data.records, query]);

  function addRecord() {
    const id = `row-${Date.now()}`;
    updateData((current) => ({ ...current, records: [{ id, name: 'New record', status: 'Draft', updated: 'Just now' }, ...current.records] }));
  }

  if (loading) return <PageSkeleton />;

  return (
    <div>
      <PageHeader title="Database" description="Browse local workspace tables. CRUD actions are ready for future data adapters." action={<Button size="sm" className="h-8 gap-1.5 text-xs" onClick={addRecord}><Plus className="h-3.5 w-3.5" />New record</Button>} />

      <section className="mb-5">
        <h2 className="mb-2 text-[11px] font-medium text-muted-foreground">Tables</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { title: 'Records', count: data.records.length, icon: Database, active: true },
            { title: 'Tasks', count: data.tasks.length, icon: Table2, active: false },
            { title: 'Notes', count: data.notes.length, icon: FileText, active: false },
            { title: 'Events', count: data.events.length, icon: Table2, active: false },
          ].map(({ title, count, icon: Icon, active }) => (
            <div key={title} className={`flex items-center gap-3 rounded-lg border p-3 ${active ? 'border-foreground/30 bg-accent/60' : 'border-border bg-card'}`}>
              <Icon className="h-4 w-4 text-muted-foreground" />
              <div className="min-w-0 flex-1"><p className="text-xs font-medium">{title}</p><p className="mt-0.5 text-[10px] text-muted-foreground">Local table</p></div>
              <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex flex-col gap-2 border-b border-border px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-4">
          <div className="flex items-center gap-2"><Table2 className="h-3.5 w-3.5 text-muted-foreground" /><h2 className="text-xs font-medium">Records</h2><span className="rounded bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">{filteredRecords.length} rows</span></div>
          <div className="relative"><Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" /><SearchInput value={query} onChange={setQuery} placeholder="Search records" /></div>
        </div>
        {filteredRecords.length ? (
          <Table>
            <TableHeader><TableRow className="hover:bg-transparent"><TableHead className="w-[34%]">Name</TableHead><TableHead className="w-[26%]">Status</TableHead><TableHead className="w-[24%]">Updated</TableHead><TableHead className="w-[16%] text-right">ID / Actions</TableHead></TableRow></TableHeader>
            <TableBody>
              {filteredRecords.map((record) => (
                <TableRow key={record.id}>
                  <TableCell><label className="sr-only" htmlFor={`name-${record.id}`}>Record name</label><input id={`name-${record.id}`} value={record.name} onChange={(event) => updateData((current) => ({ ...current, records: current.records.map((item) => item.id === record.id ? { ...item, name: event.target.value, updated: 'Just now' } : item) }))} className="w-full min-w-24 bg-transparent text-xs outline-none focus-visible:underline" /></TableCell>
                  <TableCell><label className="sr-only" htmlFor={`record-status-${record.id}`}>Record status</label><select id={`record-status-${record.id}`} value={record.status} onChange={(event) => updateData((current) => ({ ...current, records: current.records.map((item) => item.id === record.id ? { ...item, status: event.target.value, updated: 'Just now' } : item) }))} className="h-7 max-w-32 rounded border border-input bg-background px-1.5 text-[10px]"><option>Active</option><option>In progress</option><option>Review</option><option>Draft</option></select></TableCell>
                  <TableCell className="text-[11px] text-muted-foreground">{record.updated}</TableCell>
                  <TableCell><div className="flex items-center justify-end gap-1"><code className="hidden text-[9px] text-muted-foreground md:inline">{record.id}</code><Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" aria-label={`Delete ${record.name}`} onClick={() => updateData((current) => ({ ...current, records: current.records.filter((item) => item.id !== record.id) }))}><Trash2 className="h-3.5 w-3.5" /></Button></div></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : <div className="p-4"><EmptyState title="No records found" description={data.records.length ? 'Try a different search.' : 'Create a record to get started.'} action={!data.records.length && <Button size="sm" variant="outline" onClick={addRecord}>Create a record</Button>} /></div>}
        <div className="border-t border-border px-3 py-2 text-[10px] text-muted-foreground">Edit cells directly · data persists in this browser</div>
      </section>
    </div>
  );
}
