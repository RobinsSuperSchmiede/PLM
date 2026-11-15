'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Hash, Maximize, Minus, Network, Plus, X } from 'lucide-react';

import { DotLoader } from '@/components/dot-loader';
import { useI18n } from '@/components/i18n-provider';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { EmptyState, PageHeader, PageSkeleton, SearchInput } from '@/components/workspace-ui';
import { useWorkspace } from '@/components/workspace-provider';
import { allEntities, contentTypes, entityColors, entityIcons, entityLabelKeys, wikiLinks } from '@/lib/entities';
import type { LayoutRequest, LayoutResponse } from '@/lib/graph-layout.worker';
import type { EntityType } from '@/lib/types';
import { cn } from '@/lib/utils';

type NodeKind = EntityType | 'tag';
type GraphNode = { x?: number; y?: number; id: string; kind: NodeKind; entityId: string; label: string; href: string; projectId: string | null; degree: number };
type EdgeKind = 'link' | 'wiki' | 'project' | 'tag';
type GraphEdge = { id: string; kind: EdgeKind; source: string | GraphNode; target: string | GraphNode };
type View = { x: number; y: number; k: number };

const projectPalette = ['hsl(217 91% 60%)', 'hsl(152 65% 45%)', 'hsl(0 80% 60%)', 'hsl(38 95% 55%)', 'hsl(280 65% 62%)', 'hsl(190 75% 45%)', 'hsl(330 75% 60%)', 'hsl(90 55% 45%)'];

const key = (kind: NodeKind, id: string) => `${kind}:${id}`;
const endpoint = (value: string | GraphNode) => (typeof value === 'string' ? value : value.id);

export default function GraphPage() {
  const { t } = useI18n();
  const router = useRouter();
  const { data, loading, links, tags, tagAssignments } = useWorkspace();
  const [types, setTypes] = useState<EntityType[]>(['note', 'task', 'event', 'meeting', 'project', 'knowledge']);
  const [showTags, setShowTags] = useState(true);
  const [showOrphans, setShowOrphans] = useState(false);
  const [projectEdges, setProjectEdges] = useState(true);
  const [colorBy, setColorBy] = useState<'type' | 'project'>('type');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const [frame, setFrame] = useState(0);
  // Large graphs are laid out once up front instead of animating every tick (keeps 1000+ nodes fluid).
  const isStatic = useRef(false);
  const [layouting, setLayouting] = useState(false);
  const svg = useRef<SVGSVGElement>(null);
  // The physics run in a web worker; these are the nodes and edges currently drawn, with the positions it reported.
  const worker = useRef<Worker | null>(null);
  const generation = useRef(0);
  const drawn = useRef<{ nodes: GraphNode[]; edges: GraphEdge[] }>({ nodes: [], edges: [] });
  const positions = useRef(new Map<string, { x: number; y: number }>());
  const drag = useRef<{ mode: 'pan' | 'node'; node?: GraphNode; startX: number; startY: number; view: View; moved: boolean } | null>(null);

  const graph = useMemo(() => {
    const nodes = new Map<string, GraphNode>();
    for (const entity of allEntities(data, types)) {
      nodes.set(key(entity.type, entity.id), { id: key(entity.type, entity.id), kind: entity.type, entityId: entity.id, label: entity.title || t('common.untitled'), href: entity.href, projectId: entity.projectId, degree: 0 });
    }
    const edges: GraphEdge[] = [];
    const add = (source: string, target: string, kind: EdgeKind) => {
      if (source !== target && nodes.has(source) && nodes.has(target)) edges.push({ id: `${kind}:${source}>${target}`, source, target, kind });
    };
    for (const link of links) add(key(link.source_type, link.source_id), key(link.target_type, link.target_id), 'link');
    const titles = new Map([...data.notes.map((note) => [note.title.trim().toLowerCase(), key('note', note.id)] as const), ...data.knowledge.map((doc) => [doc.title.trim().toLowerCase(), key('knowledge', doc.id)] as const)]);
    for (const item of [...data.notes.map((note) => ({ node: key('note', note.id), content: note.content })), ...data.knowledge.map((doc) => ({ node: key('knowledge', doc.id), content: doc.content }))]) {
      for (const title of wikiLinks(item.content)) {
        const target = titles.get(title);
        if (target) add(item.node, target, 'wiki');
      }
    }
    if (projectEdges) {
      for (const node of nodes.values()) if (node.projectId && node.kind !== 'project') add(node.id, key('project', node.projectId), 'project');
    }
    if (showTags) {
      for (const tag of tags) {
        const members = tagAssignments.filter((entry) => entry.tag_id === tag.id && nodes.has(key(entry.entity_type, entry.entity_id)));
        if (!members.length) continue;
        nodes.set(key('tag', tag.id), { id: key('tag', tag.id), kind: 'tag', entityId: tag.id, label: `#${tag.name}`, href: `/tags/${encodeURIComponent(tag.name)}`, projectId: null, degree: 0 });
        for (const entry of members) add(key(entry.entity_type, entry.entity_id), key('tag', tag.id), 'tag');
      }
    }
    // Deduplicate (a link and a wiki link between the same pair count once).
    const unique = new Map<string, GraphEdge>();
    for (const edge of edges) {
      const pair = [endpoint(edge.source), endpoint(edge.target)].sort().join('|');
      if (!unique.has(pair)) unique.set(pair, edge);
    }
    for (const edge of unique.values()) {
      nodes.get(endpoint(edge.source))!.degree += 1;
      nodes.get(endpoint(edge.target))!.degree += 1;
    }
    const list = [...nodes.values()].filter((node) => showOrphans || node.degree > 0);
    return { nodes: list, edges: [...unique.values()] };
  }, [data, links, projectEdges, showOrphans, showTags, t, tagAssignments, tags, types]);

  useEffect(() => {
    const instance = new Worker(new URL('../../lib/graph-layout.worker.ts', import.meta.url));
    worker.current = instance;
    return () => {
      instance.terminate();
      worker.current = null;
    };
  }, []);

  // (Re)start the force simulation whenever the graph changes; known nodes keep their positions.
  useEffect(() => {
    const instance = worker.current;
    if (!instance) return;
    const post = (message: LayoutRequest) => instance.postMessage(message);
    const nodes = graph.nodes.map((node) => ({ ...node, ...(positions.current.get(node.id) ?? {}) }));
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const edges = graph.edges.map((edge) => ({ ...edge, source: byId.get(endpoint(edge.source))!, target: byId.get(endpoint(edge.target))! })).filter((edge) => edge.source && edge.target);
    const current = generation.current + 1;
    generation.current = current;
    // Large graphs are laid out once instead of animating every tick.
    const once = nodes.length > 200;
    isStatic.current = once;
    if (once) setLayouting(true);
    if (!nodes.length) drawn.current = { nodes, edges };

    let frame = 0;
    const onMessage = ({ data: message }: MessageEvent<LayoutResponse>) => {
      if (message.generation !== current) return;
      for (let index = 0; index < nodes.length; index += 1) {
        const node = nodes[index];
        node.x = message.positions[index * 2];
        node.y = message.positions[index * 2 + 1];
        positions.current.set(node.id, { x: node.x, y: node.y });
      }
      // The previous graph stays on screen until the new one has positions.
      drawn.current = { nodes, edges };
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setFrame((value) => value + 1));
      if (once && message.settled) {
        // Zoom so the whole graph fits into the view.
        const rect = svg.current?.getBoundingClientRect();
        if (rect && nodes.length) {
          const xs = nodes.map((node) => node.x ?? 0);
          const ys = nodes.map((node) => node.y ?? 0);
          const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
          const k = Math.min(1.2, Math.max(0.2, Math.min(rect.width / (maxX - minX + 80), rect.height / (maxY - minY + 80))));
          setView({ k, x: rect.width / 2 - ((minX + maxX) / 2) * k, y: rect.height / 2 - ((minY + maxY) / 2) * k });
        }
        setLayouting(false);
      }
    };
    instance.addEventListener('message', onMessage);
    post({
      type: 'init',
      generation: current,
      once,
      nodes: nodes.map((node) => ({ id: node.id, radius: radius(node), x: node.x, y: node.y })),
      edges: edges.map((edge) => ({ source: edge.source.id, target: edge.target.id, distance: edge.kind === 'tag' ? 70 : edge.kind === 'project' ? 90 : 60 })),
    });
    return () => {
      instance.removeEventListener('message', onMessage);
      post({ type: 'stop' });
      cancelAnimationFrame(frame);
      setLayouting(false);
    };
  }, [graph]);

  // Center the view in the SVG.
  useEffect(() => {
    const element = svg.current;
    if (!element) return;
    const { width, height } = element.getBoundingClientRect();
    setView((current) => (current.x === 0 && current.y === 0 ? { ...current, x: width / 2, y: height / 2 } : current));
  }, [loading]);

  useEffect(() => {
    const element = svg.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      setView((current) => {
        const k = Math.min(4, Math.max(0.2, current.k * Math.exp(-event.deltaY * 0.0015)));
        return { k, x: px - ((px - current.x) / current.k) * k, y: py - ((py - current.y) / current.k) * k };
      });
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [loading]);

  const { nodes, edges } = drawn.current;
  const neighbors = useMemo(() => {
    if (!selected) return null;
    const set = new Set([selected]);
    for (const edge of graph.edges) {
      if (endpoint(edge.source) === selected) set.add(endpoint(edge.target));
      if (endpoint(edge.target) === selected) set.add(endpoint(edge.source));
    }
    return set;
  }, [graph.edges, selected]);
  const term = query.trim().toLowerCase();
  const matches = useMemo(() => (term ? new Set(graph.nodes.filter((node) => node.label.toLowerCase().includes(term)).map((node) => node.id)) : null), [graph.nodes, term]);
  const projectColors = useMemo(() => new Map(data.projects.map((project, index) => [project.id, projectPalette[index % projectPalette.length]])), [data.projects]);

  function color(node: GraphNode) {
    if (colorBy === 'project' && node.kind !== 'tag') {
      const project = node.kind === 'project' ? node.entityId : node.projectId;
      return project ? projectColors.get(project) ?? entityColors.folder : 'hsl(var(--muted-foreground) / 0.6)';
    }
    return entityColors[node.kind];
  }

  const layer = useMemo(() => (
    <>
              {edges.map((edge) => {
        const source = edge.source as GraphNode;
        const target = edge.target as GraphNode;
        const active = neighbors ? neighbors.has(source.id) && neighbors.has(target.id) && (source.id === selected || target.id === selected) : false;
        return (
          <line key={edge.id} x1={source.x} y1={source.y} x2={target.x} y2={target.y}
            stroke={active ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground) / var(--muted-foreground-a))'}
            strokeOpacity={neighbors ? (active ? 0.8 : 0.06) : edge.kind === 'tag' ? 0.18 : 0.32}
            strokeWidth={(active ? 1.6 : 1) / Math.sqrt(view.k)}
            strokeDasharray={edge.kind === 'project' ? '3 3' : edge.kind === 'wiki' ? '1 2' : undefined} />
        );
      })}
      {nodes.map((node) => {
        const dimmed = (neighbors && !neighbors.has(node.id)) || (matches && !matches.has(node.id));
        const dense = nodes.length > 200;
        const showLabel = view.k > (dense ? 2.2 : 1.1) || node.degree >= (dense ? 14 : 4) || node.kind === 'project' || neighbors?.has(node.id) || matches?.has(node.id);
        const r = radius(node);
        return (
          <g key={node.id} data-node={node.id} transform={`translate(${node.x ?? 0},${node.y ?? 0})`} className="cursor-pointer" opacity={dimmed ? 0.15 : 1} style={{ transition: 'opacity 200ms' }}>
            {node.kind === 'tag' ? (
              <rect x={-r} y={-r} width={r * 2} height={r * 2} rx={2} transform="rotate(45)" fill="hsl(var(--background))" stroke={color(node)} strokeWidth={1.5} />
            ) : (
              <circle r={r} fill={color(node)} stroke="hsl(var(--background))" strokeWidth={node.id === selected ? 3 : 1.5} />
            )}
            {node.id === selected && <circle r={r + 5} fill="none" stroke={color(node)} strokeOpacity={0.5} strokeWidth={1.5} />}
            {showLabel && (
              <text y={r + 12} textAnchor="middle" fontSize={11 / Math.sqrt(view.k)} fill="hsl(var(--foreground))" fillOpacity={0.85} className="pointer-events-none" style={{ paintOrder: 'stroke', stroke: 'hsl(var(--background))', strokeWidth: 3 }}>
                {node.label.length > 28 ? `${node.label.slice(0, 27)}…` : node.label}
              </text>
            )}
          </g>
        );
      })}
    </>
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [frame, neighbors, matches, selected, colorBy, projectColors, view.k]);

  function send(message: LayoutRequest) {
    worker.current?.postMessage(message);
  }

  function focusOn(node: GraphNode | undefined) {
    const element = svg.current;
    if (!node || !element) return;
    const { width, height } = element.getBoundingClientRect();
    setView((current) => ({ ...current, x: width / 2 - (node.x ?? 0) * current.k, y: height / 2 - (node.y ?? 0) * current.k }));
    setSelected(node.id);
  }

  function toWorld(clientX: number, clientY: number) {
    const rect = svg.current!.getBoundingClientRect();
    return { x: (clientX - rect.left - view.x) / view.k, y: (clientY - rect.top - view.y) / view.k };
  }

  if (loading) return <PageSkeleton />;

  const selectedNode = nodes.find((node) => node.id === selected);
  const selectedNeighbors = selectedNode ? nodes.filter((node) => neighbors?.has(node.id) && node.id !== selectedNode.id) : [];

  return (
    <div>
      <PageHeader title={t('graph.title')} description={t('graph.stats', { nodes: graph.nodes.length, edges: graph.edges.length })}
        action={<SearchInput value={query} onChange={(value) => { setQuery(value); }} placeholder={t('graph.search')} className="sm:w-72" />} />

      <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="space-y-5 rounded-xl bg-card shadow-sm p-4 text-sm">
          <div className="space-y-2">
            <p className="ds-label">{t('graph.show')}</p>
            <div className="flex flex-wrap gap-1.5 xl:flex-col xl:gap-1">
              {contentTypes.map((type) => {
                const Icon = entityIcons[type];
                const active = types.includes(type);
                return (
                  <button key={type} type="button" aria-pressed={active} onClick={() => setTypes(active ? types.filter((entry) => entry !== type) : [...types, type])}
                    className={cn('flex h-[26px] items-center gap-2 rounded-full px-2.5 text-left text-[13px] transition-[background-color,box-shadow,color,opacity] duration-300 ease-ds', active ? 'ds-glass text-foreground' : 'text-muted-foreground opacity-60 hover:opacity-100')}>
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: entityColors[type] }} />
                    <Icon className="h-3.5 w-3.5" />
                    <span className="flex-1">{t(entityLabelKeys[type])}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="space-y-3">
            <ToggleRow label={t('graph.tagsAsNodes')} checked={showTags} onChange={setShowTags} />
            <ToggleRow label={t('graph.projectEdges')} checked={projectEdges} onChange={setProjectEdges} />
            <ToggleRow label={t('graph.orphans')} checked={showOrphans} onChange={setShowOrphans} />
          </div>
          <div className="space-y-2">
            <p className="ds-label">{t('graph.groupBy')}</p>
            <div className="grid grid-cols-2 gap-0.5 rounded-full ds-glass p-[3px]">
              {(['type', 'project'] as const).map((value) => (
                <button key={value} type="button" aria-pressed={colorBy === value} onClick={() => setColorBy(value)}
                  className={cn('h-[22px] rounded-full px-2 text-xs font-book transition-[background-color,box-shadow,color] duration-600 ease-ds', colorBy === value ? 'bg-seg text-foreground shadow-sm' : 'text-muted-foreground')}>
                  {value === 'type' ? t('graph.groupType') : t('graph.groupProject')}
                </button>
              ))}
            </div>
            {colorBy === 'project' && (
              <ul className="space-y-1 pt-1 text-xs text-muted-foreground">
                {data.projects.map((project) => <li key={project.id} className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: projectColors.get(project.id) }} /><span className="truncate">{project.name}</span></li>)}
                <li className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-muted-foreground/60" />{t('graph.noProject')}</li>
              </ul>
            )}
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">{t('graph.hint')}</p>
        </aside>

        <div className="relative h-[calc(100vh-13rem)] min-h-[520px] overflow-hidden rounded-xl bg-card shadow-sm">
          {layouting && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-card/60 backdrop-blur-[1px]"><DotLoader size={40} className="text-muted-foreground" label={t('common.loading')} /></div>
          )}
          {graph.nodes.length === 0 ? (
            <EmptyState icon={Network} title={t('graph.empty')} description={t('graph.emptyDesc')} className="h-full rounded-none border-0" />
          ) : null}
          <svg
            ref={svg}
            className={cn('h-full w-full touch-none select-none', graph.nodes.length === 0 && 'hidden', drag.current?.mode === 'pan' ? 'cursor-grabbing' : 'cursor-grab')}
            role="img"
            aria-label={t('graph.title')}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              const id = (event.target as Element).closest('[data-node]')?.getAttribute('data-node');
              const node = id ? nodes.find((entry) => entry.id === id) : undefined;
              drag.current = { mode: node ? 'node' : 'pan', node, startX: event.clientX, startY: event.clientY, view, moved: false };
              if (node && !isStatic.current) send({ type: 'drag', id: node.id, x: node.x ?? 0, y: node.y ?? 0 });
            }}
            onPointerMove={(event) => {
              const state = drag.current;
              if (!state) return;
              if (Math.abs(event.clientX - state.startX) + Math.abs(event.clientY - state.startY) > 3) state.moved = true;
              if (state.mode === 'pan') {
                setView({ ...state.view, x: state.view.x + event.clientX - state.startX, y: state.view.y + event.clientY - state.startY });
              } else if (state.node) {
                const point = toWorld(event.clientX, event.clientY);
                // Moved here at once so the node follows the pointer; in animated graphs the worker pulls its neighbours along.
                state.node.x = point.x;
                state.node.y = point.y;
                positions.current.set(state.node.id, point);
                setFrame((value) => value + 1);
                if (!isStatic.current) send({ type: 'drag', id: state.node.id, x: point.x, y: point.y });
              }
            }}
            onPointerCancel={() => {
              if (drag.current?.node) send({ type: 'release', id: drag.current.node.id });
              drag.current = null;
            }}
            onPointerUp={() => {
              const state = drag.current;
              drag.current = null;
              if (state?.node) {
                send({ type: 'release', id: state.node.id });
                if (!state.moved) setSelected(state.node.id === selected ? null : state.node.id);
              } else if (state && !state.moved) {
                setSelected(null);
              }
            }}
            onDoubleClick={(event) => {
              const id = (event.target as Element).closest('[data-node]')?.getAttribute('data-node');
              const node = nodes.find((entry) => entry.id === id);
              if (node) router.push(node.href);
            }}
          >
            <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
              {layer}
            </g>
          </svg>

          <div className="ds-glass ds-float absolute bottom-3 left-3 flex gap-0.5 rounded-full p-[3px]">
            <Button variant="ghost" size="icon-sm" onClick={() => setView((current) => ({ ...current, k: Math.min(4, current.k * 1.25) }))} aria-label={t('graph.zoomIn')}><Plus /></Button>
            <Button variant="ghost" size="icon-sm" onClick={() => setView((current) => ({ ...current, k: Math.max(0.2, current.k / 1.25) }))} aria-label={t('graph.zoomOut')}><Minus /></Button>
            <Button variant="ghost" size="icon-sm" aria-label={t('graph.reset')} onClick={() => {
              const rect = svg.current?.getBoundingClientRect();
              setView({ k: 1, x: (rect?.width ?? 0) / 2, y: (rect?.height ?? 0) / 2 });
              setSelected(null);
            }}><Maximize /></Button>
          </div>

          {matches && matches.size > 0 && !selected && (
            <div className="ds-menu absolute left-3 top-3 max-h-60 w-64 overflow-y-auto rounded-[18px] p-1.5">
              {nodes.filter((node) => matches.has(node.id)).slice(0, 12).map((node) => (
                <button key={node.id} type="button" onClick={() => focusOn(node)} className="flex w-full items-center gap-2 rounded-full px-2.5 py-1.5 text-left text-[13px] hover:bg-accent">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color(node) }} /><span className="truncate">{node.label}</span>
                </button>
              ))}
            </div>
          )}

          {selectedNode && (
            <div className="absolute right-3 top-3 w-72 rounded-xl ds-menu p-4 duration-200 animate-in fade-in slide-in-from-right-2">
              <div className="flex items-start gap-2">
                <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color(selectedNode) }} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">{selectedNode.kind === 'tag' ? t('entities.tag') : t(entityLabelKeys[selectedNode.kind])}</p>
                  <p className="truncate font-semibold">{selectedNode.label}</p>
                </div>
                <Button variant="ghost" size="icon-sm" className="-mr-2 -mt-2 text-muted-foreground" onClick={() => setSelected(null)} aria-label={t('notes.close')}><X /></Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{t('graph.connections', { count: selectedNeighbors.length })}</p>
              <ul className="mt-2 max-h-48 space-y-0.5 overflow-y-auto">
                {selectedNeighbors.map((node) => (
                  <li key={node.id}>
                    <button type="button" onClick={() => focusOn(node)} className="flex w-full items-center gap-2 rounded-full px-2 py-1 text-left text-[13px] hover:bg-accent">
                      {node.kind === 'tag' ? <Hash className="h-3 w-3 text-muted-foreground" /> : <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color(node) }} />}
                      <span className="truncate">{node.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <Button size="sm" className="mt-3 w-full" asChild><Link href={selectedNode.href}>{t('graph.open')}</Link></Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function radius(node: GraphNode) {
  const base = node.kind === 'project' ? 9 : node.kind === 'tag' ? 4.5 : 5.5;
  return base + Math.min(8, Math.sqrt(node.degree) * 1.6);
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3">
      <span>{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}
