'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Database, KeyRound, Link2, Lock, Table2 } from 'lucide-react';

import { useI18n } from '@/components/i18n-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PaneHeader, SidebarItem, SidebarSection, SplitLayout } from '@/components/split-layout';
import { CountUp, EmptyState, PageSkeleton, SearchInput } from '@/components/workspace-ui';
import { api, peek } from '@/lib/api';
import { formatDateTime } from '@/lib/dates';
import type { DbRows, DbSchema, DbTable } from '@/lib/types';
import { cn, formatBytes } from '@/lib/utils';

const PAGE_SIZE = 50;
const NO_FILTER = '__none__';
type Tab = 'data' | 'columns' | 'relations' | 'diagram';

export default function DatabasePage() {
  return <Suspense fallback={<PageSkeleton />}><DatabaseExplorer /></Suspense>;
}

function DatabaseExplorer() {
  const { t, language } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const [schema, setSchema] = useState<DbSchema | null>(() => peek<DbSchema>('/db/schema') ?? null);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<Tab>('data');
  const selectedName = params.get('table');
  const selected = schema?.tables.find((table) => table.name === selectedName) ?? null;

  useEffect(() => {
    api.get<DbSchema>('/db/schema').then(setSchema).catch(() => setSchema({ engine: '?', size: null, tables: [], total_rows: 0 }));
  }, []);

  const select = (name: string | null) => {
    setTab('data');
    router.replace(name ? `/database?table=${encodeURIComponent(name)}` : '/database', { scroll: false });
  };

  if (!schema) return <div className="p-8"><PageSkeleton /></div>;

  const tables = schema.tables.filter((table) => table.name.includes(query.trim().toLowerCase()));
  const relations = schema.tables.flatMap((table) => table.foreign_keys.map((fk) => ({ ...fk, table: table.name })));

  return (
    <SplitLayout mobileLabel={t('dbx.tables')} sidebar={(
      <div className="flex h-full flex-col">
        <div className="p-2"><SearchInput value={query} onChange={setQuery} placeholder={t('dbx.searchTables')} className="sm:w-full" /></div>
        <SidebarSection>
          <SidebarItem active={!selected} onClick={() => select(null)} icon={<Database className="h-4 w-4" />} label={t('dbx.overview')} />
        </SidebarSection>
        <SidebarSection title={t('dbx.tables')}>
          {tables.map((table) => (
            <SidebarItem key={table.name} active={selected?.name === table.name} onClick={() => select(table.name)}
              icon={<Table2 className="h-3.5 w-3.5" />} label={table.name} count={table.rows} />
          ))}
        </SidebarSection>
      </div>
    )}>
      <PaneHeader
        title={selected ? selected.name : t('nav.database')}
        description={selected
          ? `${selected.rows.toLocaleString(language)} ${t('dbx.rows')} · ${selected.columns.length} ${t('dbx.tabColumns')} · ${formatBytes(selected.size, t('dbx.unknown'))}${selected.last_change ? ` · ${t('dbx.lastChange')} ${formatDateTime(selected.last_change, language)}` : ''}`
          : t('dbx.description', { engine: schema.engine, tables: schema.tables.length, rows: schema.total_rows.toLocaleString(language), size: formatBytes(schema.size, t('dbx.unknown')) })}
        actions={(
          <>
            {selected && (
              <div className="flex gap-0.5 rounded-full ds-glass p-[3px]" role="tablist">
                {(['data', 'columns', 'relations', 'diagram'] as const).map((value) => (
                  <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)}
                    className={cn('h-[22px] rounded-full px-3 text-xs font-book transition-[background-color,box-shadow,color] duration-600 ease-ds', tab === value ? 'bg-seg text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                    {t(`dbx.tab${value[0].toUpperCase()}${value.slice(1)}` as 'dbx.tabData')}
                  </button>
                ))}
              </div>
            )}
            <Badge variant="outline" className="gap-1"><Lock className="h-3 w-3" />{t('dbx.readOnly')}</Badge>
          </>
        )}
      />
      <div className="px-5 py-6 sm:px-8">
        {!selected ? (
          <Overview schema={schema} relations={relations} onSelect={select} />
        ) : (
          <div key={`${selected.name}-${tab}`} className="duration-200 animate-in fade-in">
            {tab === 'data' && <RowsView table={selected} />}
            {tab === 'columns' && <ColumnsView table={selected} />}
            {tab === 'relations' && <RelationsView table={selected} schema={schema} onSelect={select} />}
            {tab === 'diagram' && <Card className="overflow-auto p-4"><ErDiagram schema={schema} focus={selected.name} onSelect={select} /></Card>}
          </div>
        )}
      </div>
    </SplitLayout>
  );
}

function Overview({ schema, relations, onSelect }: { schema: DbSchema; relations: (DbTable['foreign_keys'][number] & { table: string })[]; onSelect: (name: string) => void }) {
  const { t, language } = useI18n();
  const changes = schema.tables.reduce((sum, table) => sum + table.changes_7d, 0);
  const biggest = [...schema.tables].sort((a, b) => (b.size ?? b.rows) - (a.size ?? a.rows)).slice(0, 6);
  const changed = [...schema.tables].filter((table) => table.changes_7d).sort((a, b) => b.changes_7d - a.changes_7d).slice(0, 6);
  const maxSize = Math.max(1, ...biggest.map((table) => table.size ?? table.rows));
  const maxChanges = Math.max(1, ...changed.map((table) => table.changes_7d));
  const stats = [
    { label: t('dbx.tables'), value: schema.tables.length },
    { label: t('dbx.rows'), value: schema.total_rows },
    { label: t('dbx.changes7d'), value: changes },
    { label: t('dbx.relationsCount', { count: '' }).trim(), value: relations.length },
  ];

  return (
    <div className="space-y-6">
      <div className="stagger grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {stats.map((stat) => (
          <Card key={stat.label} className="p-4">
            <p className="text-xs font-medium text-muted-foreground">{stat.label}</p>
            <p className="mt-2 text-2xl font-medium tabular-nums"><CountUp value={stat.value} /></p>
          </Card>
        ))}
        <Card className="p-4">
          <p className="text-xs font-medium text-muted-foreground">{t('dbx.size')}</p>
          <p className="mt-2 text-2xl font-medium tabular-nums">{formatBytes(schema.size, t('dbx.unknown'))}</p>
        </Card>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <BarList title={t('dbx.biggest')} items={biggest.map((table) => ({ name: table.name, value: table.size ?? table.rows, label: table.size !== null ? formatBytes(table.size) : `${table.rows.toLocaleString(language)} ${t('dbx.rows')}` }))} max={maxSize} onSelect={onSelect} tone="bg-info" />
        <BarList title={t('dbx.mostChanged')} items={changed.map((table) => ({ name: table.name, value: table.changes_7d, label: String(table.changes_7d) }))} max={maxChanges} onSelect={onSelect} tone="bg-success" />
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('dbx.tabDiagram')}</CardTitle>
          <CardDescription>{t('dbx.logical')}</CardDescription>
        </CardHeader>
        <CardContent className="overflow-auto"><ErDiagram schema={schema} onSelect={onSelect} /></CardContent>
      </Card>
    </div>
  );
}

function BarList({ title, items, max, onSelect, tone }: { title: string; items: { name: string; value: number; label: string }[]; max: number; onSelect: (name: string) => void; tone: string }) {
  const { t } = useI18n();
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">{t('dbx.noRows')}</p>}
        {items.map((item) => (
          <button key={item.name} type="button" onClick={() => onSelect(item.name)} className="group block w-full text-left">
            <span className="flex justify-between text-xs"><span className="font-mono group-hover:underline">{item.name}</span><span className="tabular-nums text-muted-foreground">{item.label}</span></span>
            <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted">
              <span className={cn('block h-full rounded-full transition-[width] duration-700 ease-ds', tone)} style={{ width: `${Math.max(3, (item.value / max) * 100)}%` }} />
            </span>
          </button>
        ))}
      </CardContent>
    </Card>
  );
}

function RowsView({ table }: { table: DbTable }) {
  const { t, language } = useI18n();
  const [rows, setRows] = useState<DbRows | null>(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ column: string; direction: 'asc' | 'desc' } | null>(null);
  const [filterColumn, setFilterColumn] = useState(NO_FILTER);
  const [filterValue, setFilterValue] = useState('');
  const [page, setPage] = useState(0);

  const load = useCallback(() => {
    const query = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) });
    if (search.trim()) query.set('search', search.trim());
    if (sort) {
      query.set('sort', sort.column);
      query.set('direction', sort.direction);
    }
    if (filterColumn !== NO_FILTER) {
      query.set('filter_column', filterColumn);
      query.set('filter_value', filterValue);
    }
    api.get<DbRows>(`/db/tables/${encodeURIComponent(table.name)}/rows?${query}`).then(setRows).catch(() => setRows({ columns: [], rows: [], total: 0 }));
  }, [filterColumn, filterValue, page, search, sort, table.name]);

  useEffect(() => {
    const timeout = window.setTimeout(load, 200);
    return () => window.clearTimeout(timeout);
  }, [load]);

  const columns = rows?.columns ?? table.columns.map((column) => column.name);
  const from = rows?.total ? page * PAGE_SIZE + 1 : 0;
  const to = Math.min((page + 1) * PAGE_SIZE, rows?.total ?? 0);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-2 border-b p-3 md:flex-row md:items-center">
        <SearchInput value={search} onChange={(value) => { setSearch(value); setPage(0); }} placeholder={t('dbx.searchRows')} className="md:w-72" />
        <Select value={filterColumn} onValueChange={(value) => { setFilterColumn(value); setPage(0); }}>
          <SelectTrigger className="md:w-48" aria-label={t('dbx.filterColumn')}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_FILTER}>{t('dbx.noFilter')}</SelectItem>
            {table.columns.map((column) => <SelectItem key={column.name} value={column.name}>{column.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {filterColumn !== NO_FILTER && (
          <Input value={filterValue} onChange={(event) => { setFilterValue(event.target.value); setPage(0); }} placeholder={t('dbx.filterValue')} aria-label={t('dbx.filterValue')} className="md:w-56" />
        )}
        <p className="text-xs text-muted-foreground md:ml-auto">{t('dbx.masked')}</p>
      </div>
      {rows && rows.rows.length === 0 ? (
        <p className="p-10 text-center text-sm text-muted-foreground">{t('dbx.noRows')}</p>
      ) : (
        <div className="max-h-[calc(100vh-20rem)] overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow className="hover:bg-transparent">
                {columns.map((column) => {
                  const active = sort?.column === column;
                  const Icon = active ? (sort?.direction === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
                  return (
                    <TableHead key={column} className="whitespace-nowrap">
                      <button type="button" className={cn('inline-flex items-center gap-1 font-mono text-xs', active && 'text-foreground')}
                        onClick={() => setSort(active && sort?.direction === 'desc' ? null : { column, direction: active ? 'desc' : 'asc' })}>
                        {column}<Icon className="h-3 w-3 opacity-60" />
                      </button>
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows?.rows.map((row, index) => (
                <TableRow key={index}>
                  {columns.map((column) => <TableCell key={column} className="max-w-[22rem] truncate whitespace-nowrap font-mono text-xs"><Cell value={row[column]} language={language} /></TableCell>)}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground">
        <span>{t('dbx.page', { from, to, total: rows?.total ?? 0 })}</span>
        <div className="flex gap-1">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>{t('dbx.previous')}</Button>
          <Button variant="outline" size="sm" disabled={to >= (rows?.total ?? 0)} onClick={() => setPage(page + 1)}>{t('dbx.next')}</Button>
        </div>
      </div>
    </Card>
  );
}

function Cell({ value, language }: { value: unknown; language: 'de' | 'en' }) {
  if (value === null || value === undefined) return <span className="text-muted-foreground/60">NULL</span>;
  if (typeof value === 'boolean') return <span className={value ? 'text-success' : 'text-muted-foreground'}>{String(value)}</span>;
  if (typeof value === 'number') return <span className="tabular-nums text-info">{value.toLocaleString(language)}</span>;
  return <span title={String(value)}>{String(value)}</span>;
}

function ColumnsView({ table }: { table: DbTable }) {
  const { t } = useI18n();
  return (
    <Card className="overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>{t('dbx.column')}</TableHead>
            <TableHead>{t('dbx.type')}</TableHead>
            <TableHead>{t('dbx.default')}</TableHead>
            <TableHead>{t('dbx.constraints')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {table.columns.map((column) => (
            <TableRow key={column.name}>
              <TableCell className="font-mono text-sm">
                <span className="inline-flex items-center gap-1.5">
                  {column.primary_key ? <KeyRound className="h-3.5 w-3.5 text-warning" /> : column.foreign_key ? <Link2 className="h-3.5 w-3.5 text-info" /> : <span className="w-3.5" />}
                  {column.name}
                </span>
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">{column.type}</TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">{column.default ?? '–'}</TableCell>
              <TableCell>
                <span className="flex flex-wrap gap-1">
                  {column.primary_key && <Badge variant="warning">{t('dbx.primaryKey')}</Badge>}
                  {column.foreign_key && <Badge variant="info">{t('dbx.foreignKey')} → {column.foreign_key.references_table}.{column.foreign_key.references_column}</Badge>}
                  {column.unique && !column.primary_key && <Badge variant="secondary">{t('dbx.unique')}</Badge>}
                  {column.indexed && !column.primary_key && <Badge variant="outline">{t('dbx.indexed')}</Badge>}
                  <Badge variant="outline" className={column.nullable ? 'text-muted-foreground' : ''}>{column.nullable ? t('dbx.nullable') : t('dbx.notNull')}</Badge>
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

function RelationsView({ table, schema, onSelect }: { table: DbTable; schema: DbSchema; onSelect: (name: string) => void }) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const incoming = schema.tables.flatMap((other) => other.foreign_keys.filter((fk) => fk.references_table === table.name).map((fk) => ({ ...fk, table: other.name })));
  const term = query.trim().toLowerCase();
  const match = (...values: string[]) => !term || values.some((value) => value.toLowerCase().includes(term));
  const outgoing = table.foreign_keys.filter((fk) => match(fk.column, fk.references_table));
  const referenced = incoming.filter((fk) => match(fk.table, fk.column));

  return (
    <div className="space-y-4">
      <SearchInput value={query} onChange={setQuery} placeholder={t('dbx.searchRelations')} className="sm:w-72" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">{t('dbx.references')}</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {outgoing.length === 0 && <p className="text-sm text-muted-foreground">{t('dbx.noRelations')}</p>}
            {outgoing.map((fk) => (
              <button key={fk.column} type="button" onClick={() => onSelect(fk.references_table)} className="flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left font-mono text-sm transition-colors hover:bg-accent">
                <span>{table.name}.{fk.column}</span><span className="text-muted-foreground">→</span><span className="text-info">{fk.references_table}.{fk.references_column}</span>
              </button>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">{t('dbx.referencedBy')}</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {referenced.length === 0 && <p className="text-sm text-muted-foreground">{t('dbx.noRelations')}</p>}
            {referenced.map((fk) => (
              <button key={`${fk.table}.${fk.column}`} type="button" onClick={() => onSelect(fk.table)} className="flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left font-mono text-sm transition-colors hover:bg-accent">
                <span className="text-info">{fk.table}.{fk.column}</span><span className="text-muted-foreground">→</span><span>{table.name}.{fk.references_column}</span>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>
      {(table.name === 'entity_tags' || table.name === 'entity_links') && <p className="text-sm text-muted-foreground">{t('dbx.logical')}</p>}
    </div>
  );
}

const BOX_WIDTH = 210;
const ROW = 18;
const HEAD = 28;
const MAX_COLUMNS = 9;
const GAP_X = 70;
const GAP_Y = 36;

/** Entity-relationship diagram: tables as boxes, foreign keys as curves. With `focus`, only that table and its neighbours. */
function ErDiagram({ schema, focus, onSelect }: { schema: DbSchema; focus?: string; onSelect: (name: string) => void }) {
  const [hover, setHover] = useState<string | null>(null);
  const layout = useMemo(() => {
    const linked = new Set<string>();
    for (const table of schema.tables) for (const fk of table.foreign_keys) {
      linked.add(table.name);
      linked.add(fk.references_table);
    }
    let tables = schema.tables.filter((table) => linked.has(table.name));
    if (focus) {
      const neighbours = new Set([focus]);
      for (const table of schema.tables) for (const fk of table.foreign_keys) {
        if (table.name === focus) neighbours.add(fk.references_table);
        if (fk.references_table === focus) neighbours.add(table.name);
      }
      tables = schema.tables.filter((table) => neighbours.has(table.name));
    }
    // Referenced tables first (left), referencing tables to the right.
    const depth = new Map<string, number>();
    const depthOf = (name: string, seen = new Set<string>()): number => {
      if (depth.has(name)) return depth.get(name)!;
      if (seen.has(name)) return 0;
      seen.add(name);
      const table = schema.tables.find((entry) => entry.name === name);
      const value = Math.max(0, ...(table?.foreign_keys.filter((fk) => fk.references_table !== name).map((fk) => depthOf(fk.references_table, seen) + 1) ?? [0]));
      depth.set(name, value);
      return value;
    };
    const columns = new Map<number, DbTable[]>();
    for (const table of tables) {
      const level = Math.min(3, depthOf(table.name));
      columns.set(level, [...(columns.get(level) ?? []), table]);
    }
    const boxes = new Map<string, { x: number; y: number; height: number; table: DbTable }>();
    [...columns.keys()].sort().forEach((level, columnIndex) => {
      let y = 0;
      for (const table of columns.get(level)!) {
        const height = HEAD + Math.min(MAX_COLUMNS, table.columns.length) * ROW + (table.columns.length > MAX_COLUMNS ? ROW : 0) + 6;
        boxes.set(table.name, { x: columnIndex * (BOX_WIDTH + GAP_X), y, height, table });
        y += height + GAP_Y;
      }
    });
    const width = Math.max(...[...boxes.values()].map((box) => box.x + BOX_WIDTH), BOX_WIDTH) + 2;
    const height = Math.max(...[...boxes.values()].map((box) => box.y + box.height), 100) + 2;
    return { boxes, width, height };
  }, [focus, schema.tables]);

  const edges = [...layout.boxes.values()].flatMap(({ table }) => table.foreign_keys
    .filter((fk) => layout.boxes.has(fk.references_table))
    .map((fk) => ({ from: table.name, column: fk.column, to: fk.references_table })));

  if (!layout.boxes.size) return <EmptyState icon={Link2} title="—" className="border-0" />;

  const columnY = (box: { y: number; table: DbTable }, column: string) => {
    const index = box.table.columns.findIndex((entry) => entry.name === column);
    return box.y + HEAD + Math.min(index < 0 ? 0 : index, MAX_COLUMNS) * ROW + ROW / 2;
  };

  return (
    <svg width={layout.width} height={layout.height} className="max-w-none" role="img" aria-label="ER">
      {edges.map((edge) => {
        const from = layout.boxes.get(edge.from)!;
        const to = layout.boxes.get(edge.to)!;
        const leftToRight = from.x > to.x;
        const x1 = leftToRight ? from.x : from.x + BOX_WIDTH;
        const x2 = leftToRight ? to.x + BOX_WIDTH : to.x;
        const y1 = columnY(from, edge.column);
        const y2 = to.y + HEAD / 2;
        const self = edge.from === edge.to;
        const bend = self ? 40 : Math.max(30, Math.abs(x2 - x1) / 2);
        const path = self
          ? `M ${from.x + BOX_WIDTH} ${y1} C ${from.x + BOX_WIDTH + bend} ${y1}, ${from.x + BOX_WIDTH + bend} ${y2}, ${from.x + BOX_WIDTH} ${y2}`
          : `M ${x1} ${y1} C ${x1 + (leftToRight ? -bend : bend)} ${y1}, ${x2 + (leftToRight ? bend : -bend)} ${y2}, ${x2} ${y2}`;
        const active = hover === edge.from || hover === edge.to || focus === edge.from || focus === edge.to;
        return <path key={`${edge.from}.${edge.column}`} d={path} fill="none" stroke={active ? 'hsl(var(--info))' : 'hsl(var(--muted-foreground) / var(--muted-foreground-a))'} strokeOpacity={active ? 0.9 : 0.35} strokeWidth={active ? 1.5 : 1} />;
      })}
      {[...layout.boxes.values()].map(({ x, y, height, table }) => (
        <g key={table.name} transform={`translate(${x},${y})`} className="cursor-pointer" onClick={() => onSelect(table.name)}
          onMouseEnter={() => setHover(table.name)} onMouseLeave={() => setHover(null)}>
          <rect width={BOX_WIDTH} height={height} rx={8} fill="hsl(var(--popover) / var(--popover-a))" stroke={focus === table.name || hover === table.name ? 'hsl(var(--info))' : 'hsl(var(--border) / var(--border-a))'} strokeWidth={focus === table.name ? 1.5 : 1} />
          <rect width={BOX_WIDTH} height={HEAD} rx={8} fill="hsl(var(--muted) / var(--muted-a))" />
          <rect y={HEAD - 8} width={BOX_WIDTH} height={8} fill="hsl(var(--muted) / var(--muted-a))" />
          <text x={10} y={18} fontSize={12} fontWeight={600} fill="hsl(var(--foreground))" fontFamily="ui-monospace, monospace">{table.name}</text>
          <text x={BOX_WIDTH - 10} y={18} fontSize={10} textAnchor="end" fill="hsl(var(--muted-foreground) / var(--muted-foreground-a))">{table.rows}</text>
          {table.columns.slice(0, MAX_COLUMNS).map((column, index) => (
            <g key={column.name} transform={`translate(0,${HEAD + index * ROW})`}>
              <text x={10} y={13} fontSize={11} fontFamily="ui-monospace, monospace"
                fill={column.primary_key ? 'hsl(var(--warning))' : column.foreign_key ? 'hsl(var(--info))' : 'hsl(var(--foreground))'} fillOpacity={column.primary_key || column.foreign_key ? 1 : 0.8}>
                {column.primary_key ? '◆ ' : column.foreign_key ? '→ ' : '  '}{column.name}
              </text>
              <text x={BOX_WIDTH - 10} y={13} fontSize={10} textAnchor="end" fill="hsl(var(--muted-foreground) / var(--muted-foreground-a))" fontFamily="ui-monospace, monospace">{column.type.toLowerCase().slice(0, 12)}</text>
            </g>
          ))}
          {table.columns.length > MAX_COLUMNS && <text x={10} y={HEAD + MAX_COLUMNS * ROW + 13} fontSize={10} fill="hsl(var(--muted-foreground) / var(--muted-foreground-a))">+{table.columns.length - MAX_COLUMNS}</text>}
        </g>
      ))}
    </svg>
  );
}
