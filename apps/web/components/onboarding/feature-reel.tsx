'use client';

import { type CSSProperties, type ReactNode, useEffect, useState } from 'react';
import {
  BellRing, Bot, CalendarDays, Check, CheckSquare2, ChevronLeft, ChevronRight, FileText, Folder, FolderTree, Network, Pause, Play, RotateCcw, Send, Sparkles,
} from 'lucide-react';

import { useI18n } from '@/components/i18n-provider';
import { Button } from '@/components/ui/button';
import type { Language } from '@/lib/types';
import { cn } from '@/lib/utils';

const SCENE_MS = 4800;
const scenes = ['explorer', 'tasks', 'calendar', 'graph', 'telegram', 'mcp'] as const;
type Scene = typeof scenes[number];
const sceneIcons: Record<Scene, typeof FolderTree> = { explorer: FolderTree, tasks: CheckSquare2, calendar: CalendarDays, graph: Network, telegram: Send, mcp: Bot };

/** Delay for one animated element. */
const d = (ms: number) => ({ '--d': `${ms}ms` }) as CSSProperties;

/** Sample content shown in the little mock-ups. */
const samples: Record<Language, {
  folders: string[]; note: string; lines: string[]; tasks: string[]; project: string; events: [number, string][];
  nodes: string[]; chat: [string, string, string]; prompt: string; tool: string; result: string;
}> = {
  de: {
    folders: ['Arbeit', 'Projekte', 'Privat', 'Rezepte'], note: 'Kickoff Website', lines: ['Ziele und Scope klären', 'Budget prüfen · [[Angebot]]', 'Nächster Termin: Freitag'],
    tasks: ['Angebot schreiben', 'Design-Review', 'Rechnung bezahlen', 'Release vorbereiten'], project: 'Website-Relaunch',
    events: [[1, '09:00 Standup'], [2, '14:00 Review'], [4, 'Zahnarzt'], [5, '18:00 Sport']],
    nodes: ['Projekt', 'Notiz', 'Aufgabe', 'Meeting', 'Dokument', '#kunde'],
    chat: ['/aufgabe Milch kaufen morgen', '✓ Aufgabe „Milch kaufen“ für morgen angelegt', '⏰ Erinnerung: Meeting in 15 Minuten'],
    prompt: 'Fasse mein Meeting zusammen und lege die Aufgaben an', tool: 'create_task · create_note', result: '3 Aufgaben und 1 Notiz angelegt',
  },
  en: {
    folders: ['Work', 'Projects', 'Personal', 'Recipes'], note: 'Website kickoff', lines: ['Clarify goals and scope', 'Check budget · [[Offer]]', 'Next meeting: Friday'],
    tasks: ['Write offer', 'Design review', 'Pay invoice', 'Prepare release'], project: 'Website relaunch',
    events: [[1, '09:00 Standup'], [2, '14:00 Review'], [4, 'Dentist'], [5, '18:00 Gym']],
    nodes: ['Project', 'Note', 'Task', 'Meeting', 'Document', '#client'],
    chat: ['/task Buy milk tomorrow', '✓ Task “Buy milk” added for tomorrow', '⏰ Reminder: meeting in 15 minutes'],
    prompt: 'Summarize my meeting and create the tasks', tool: 'create_task · create_note', result: '3 tasks and 1 note created',
  },
  es: {
    folders: ['Trabajo', 'Proyectos', 'Personal', 'Recetas'], note: 'Inicio del sitio web', lines: ['Aclarar objetivos y alcance', 'Revisar presupuesto · [[Oferta]]', 'Próxima reunión: viernes'],
    tasks: ['Redactar oferta', 'Revisión de diseño', 'Pagar factura', 'Preparar lanzamiento'], project: 'Renovación del sitio web',
    events: [[1, '09:00 Standup'], [2, '14:00 Revisión'], [4, 'Dentista'], [5, '18:00 Gimnasio']],
    nodes: ['Proyecto', 'Nota', 'Tarea', 'Reunión', 'Documento', '#cliente'],
    chat: ['/task Comprar leche mañana', '✓ Tarea «Comprar leche» creada para mañana', '⏰ Recordatorio: reunión en 15 minutos'],
    prompt: 'Resume mi reunión y crea las tareas', tool: 'create_task · create_note', result: '3 tareas y 1 nota creadas',
  },
  pt: {
    folders: ['Trabalho', 'Projetos', 'Pessoal', 'Receitas'], note: 'Kickoff do site', lines: ['Definir objetivos e escopo', 'Verificar orçamento · [[Proposta]]', 'Próxima reunião: sexta-feira'],
    tasks: ['Escrever proposta', 'Revisão de design', 'Pagar fatura', 'Preparar lançamento'], project: 'Relançamento do site',
    events: [[1, '09:00 Standup'], [2, '14:00 Revisão'], [4, 'Dentista'], [5, '18:00 Academia']],
    nodes: ['Projeto', 'Nota', 'Tarefa', 'Reunião', 'Documento', '#cliente'],
    chat: ['/task Comprar leite amanhã', '✓ Tarefa “Comprar leite” criada para amanhã', '⏰ Lembrete: reunião em 15 minutos'],
    prompt: 'Resuma minha reunião e crie as tarefas', tool: 'create_task · create_note', result: '3 tarefas e 1 nota criadas',
  },
  zh: {
    folders: ['工作', '项目', '个人', '食谱'], note: '网站启动会', lines: ['明确目标和范围', '核对预算 · [[报价]]', '下次会议：周五'],
    tasks: ['撰写报价', '设计评审', '支付账单', '准备发布'], project: '网站改版',
    events: [[1, '09:00 站会'], [2, '14:00 评审'], [4, '看牙医'], [5, '18:00 健身']],
    nodes: ['项目', '笔记', '任务', '会议', '文档', '#客户'],
    chat: ['/task 明天买牛奶', '✓ 已为明天创建任务“买牛奶”', '⏰ 提醒：15 分钟后开会'],
    prompt: '总结我的会议并创建任务', tool: 'create_task · create_note', result: '已创建 3 个任务和 1 条笔记',
  },
  ja: {
    folders: ['仕事', 'プロジェクト', 'プライベート', 'レシピ'], note: 'Webサイト キックオフ', lines: ['目標と範囲を明確にする', '予算を確認 · [[見積もり]]', '次回ミーティング：金曜日'],
    tasks: ['見積もりを作成', 'デザインレビュー', '請求書を支払う', 'リリース準備'], project: 'Webサイト リニューアル',
    events: [[1, '09:00 朝会'], [2, '14:00 レビュー'], [4, '歯医者'], [5, '18:00 ジム']],
    nodes: ['プロジェクト', 'メモ', 'タスク', 'ミーティング', 'ドキュメント', '#顧客'],
    chat: ['/task 明日 牛乳を買う', '✓ タスク「牛乳を買う」を明日に追加しました', '⏰ リマインダー：15分後にミーティング'],
    prompt: 'ミーティングを要約してタスクを作成して', tool: 'create_task · create_note', result: 'タスク3件とメモ1件を作成しました',
  },
};

function prefersReducedMotion() {
  return document.documentElement.dataset.motion === 'reduced' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** A short "motion video": animated scenes that show what the workspace can do, played one after another. */
export function FeatureReel() {
  const { t } = useI18n();
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  // Bumped to replay the current scene from the start.
  const [run, setRun] = useState(0);

  // With reduced motion the scenes would race by, so they only change on demand.
  useEffect(() => { if (prefersReducedMotion()) setPlaying(false); }, []);

  const scene = scenes[index];
  const last = index === scenes.length - 1;
  const go = (next: number) => { setIndex(Math.max(0, Math.min(scenes.length - 1, next))); setRun((value) => value + 1); };
  const Icon = sceneIcons[scene];

  return (
    <div className="overflow-hidden rounded-2xl bg-muted/60 ring-1 ring-border">
      {/* Story-style progress: one segment per scene; the active one fills up and then moves on. */}
      <div className="flex gap-1 px-4 pt-3" role="tablist" aria-label={t('onboarding.reelLabel')}>
        {scenes.map((entry, position) => (
          <button key={entry} type="button" role="tab" aria-selected={position === index} aria-label={t(`onboarding.scene_${entry}`)} onClick={() => go(position)}
            className="h-1 flex-1 overflow-hidden rounded-full bg-foreground/15">
            {position < index && <span className="block h-full w-full rounded-full bg-foreground/70" />}
            {position === index && (
              <span key={run} className="intro-progress block h-full w-full rounded-full bg-foreground/70" data-paused={!playing}
                style={{ '--duration': `${SCENE_MS}ms` } as CSSProperties}
                onAnimationEnd={() => { if (!last) go(index + 1); else setPlaying(false); }} />
            )}
          </button>
        ))}
      </div>

      <div key={`${scene}-${run}`} className="grid min-h-[300px] gap-6 p-5 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] sm:items-center sm:p-7">
        <div className="space-y-3">
          <span className="intro-pop ds-glass flex h-10 w-10 items-center justify-center rounded-full" style={d(50)}><Icon className="h-[18px] w-[18px]" strokeWidth={1.6} /></span>
          <h3 className="intro-rise text-xl font-semibold tracking-[-0.01em]" style={d(120)}>{t(`onboarding.scene_${scene}`)}</h3>
          <p className="intro-rise text-sm leading-relaxed text-muted-foreground" style={d(240)}>{t(`onboarding.scene_${scene}Desc`)}</p>
        </div>
        <div className="relative flex min-h-[220px] items-center justify-center" aria-hidden="true">
          <span className="intro-glow absolute inset-6 rounded-full bg-brand/20 blur-3xl" />
          <div className="relative w-full max-w-[340px]"><SceneVisual scene={scene} /></div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 px-4 pb-3">
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{index + 1} / {scenes.length}</span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" onClick={() => go(index - 1)} disabled={index === 0} aria-label={t('onboarding.previous')}><ChevronLeft /></Button>
          {last && !playing ? (
            <Button variant="ghost" size="icon-sm" onClick={() => { go(0); setPlaying(true); }} aria-label={t('onboarding.replay')}><RotateCcw /></Button>
          ) : (
            <Button variant="ghost" size="icon-sm" onClick={() => setPlaying((value) => !value)} aria-label={playing ? t('onboarding.pause') : t('onboarding.play')}>
              {playing ? <Pause /> : <Play />}
            </Button>
          )}
          <Button variant="ghost" size="icon-sm" onClick={() => go(index + 1)} disabled={last} aria-label={t('onboarding.nextScene')}><ChevronRight /></Button>
        </div>
      </div>
    </div>
  );
}

function Panel({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return <div className={cn('intro-rise rounded-2xl bg-card p-3.5 shadow-md ring-1 ring-border/60', className)} style={d(delay)}>{children}</div>;
}

function SceneVisual({ scene }: { scene: Scene }) {
  const { language } = useI18n();
  const sample = samples[language];

  switch (scene) {
    case 'explorer':
      return (
        <div className="grid grid-cols-[0.8fr_1.2fr] gap-2.5">
          <Panel className="space-y-1.5 p-3">
            {sample.folders.map((name, position) => (
              <p key={name} className="intro-slide flex items-center gap-1.5 text-[11px]" style={d(300 + position * 140)}>
                <Folder className="h-3 w-3 shrink-0 text-muted-foreground" />{name}
              </p>
            ))}
            <p className="intro-slide flex items-center gap-1.5 pl-3 text-[11px] font-medium" style={d(900)}><FileText className="h-3 w-3 shrink-0" />{sample.note}</p>
          </Panel>
          <Panel delay={500} className="space-y-2">
            <p className="intro-type text-[13px] font-semibold" style={d(1000)}>{sample.note}</p>
            {sample.lines.map((line, position) => (
              <p key={line} className="intro-type text-[11px] text-muted-foreground" style={d(1700 + position * 650)}>{line}</p>
            ))}
          </Panel>
        </div>
      );
    case 'tasks':
      return (
        <Panel className="space-y-2">
          <p className="flex items-center justify-between text-[12px] font-medium"><span>{sample.project}</span><span className="font-mono text-[10px] text-muted-foreground">75%</span></p>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="intro-grow h-full w-3/4 rounded-full bg-success" style={d(2600)} /></div>
          {sample.tasks.map((task, position) => (
            <div key={task} className="intro-slide flex items-center gap-2 text-[12px]" style={d(250 + position * 160)}>
              <span className="relative flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] ring-1 ring-foreground/30">
                {position < 3 && <span className="intro-pop absolute inset-0 flex items-center justify-center rounded-[5px] bg-success text-white" style={d(1300 + position * 450)}><Check className="h-3 w-3" /></span>}
              </span>
              <span className={cn(position < 3 && 'text-muted-foreground')}>{task}</span>
            </div>
          ))}
        </Panel>
      );
    case 'calendar':
      return (
        <div className="space-y-2.5">
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 7 }, (_, day) => {
              const event = sample.events.find(([at]) => at === day);
              return (
                <div key={day} className={cn('intro-rise flex h-20 flex-col gap-1 rounded-xl bg-card p-1.5 shadow-sm ring-1 ring-border/60', day === 0 && 'ring-2 ring-foreground/60')} style={d(150 + day * 90)}>
                  <span className="text-[10px] font-medium">{day + 14}</span>
                  {event && <span className="intro-pop rounded-md bg-brand/15 px-1 py-0.5 text-[8px] leading-tight" style={d(1000 + day * 220)}>{event[1]}</span>}
                </div>
              );
            })}
          </div>
          <Panel delay={2300} className="flex items-center gap-2.5 py-2.5">
            <BellRing className="intro-ring h-4 w-4 shrink-0 text-warning" style={d(2700)} />
            <span className="text-[12px]">{sample.chat[2]}</span>
          </Panel>
        </div>
      );
    case 'graph': {
      const points: [number, number][] = [[170, 90], [70, 45], [275, 45], [55, 150], [285, 150], [170, 170]];
      const edges: [number, number][] = [[0, 1], [0, 2], [0, 3], [0, 4], [1, 5], [2, 4], [3, 5]];
      return (
        <svg viewBox="0 0 340 210" className="w-full overflow-visible">
          {edges.map(([from, to], position) => (
            <line key={`${from}-${to}`} x1={points[from][0]} y1={points[from][1]} x2={points[to][0]} y2={points[to][1]} pathLength={1}
              className="intro-draw stroke-foreground/30" strokeWidth={1.5} style={d(900 + position * 200)} />
          ))}
          {points.map(([x, y], position) => (
            <g key={sample.nodes[position]} className="intro-pop" style={{ ...d(200 + position * 140), transformOrigin: `${x}px ${y}px` }}>
              <circle cx={x} cy={y} r={position === 0 ? 11 : 7} className={position === 0 ? 'fill-brand' : 'fill-card stroke-foreground/50'} strokeWidth={1.5} />
              <text x={x} y={y + (position === 0 ? 26 : 21)} textAnchor="middle" className="fill-foreground text-[11px]">{sample.nodes[position]}</text>
            </g>
          ))}
        </svg>
      );
    }
    case 'telegram':
      return (
        <div className="mx-auto w-[240px] rounded-[26px] bg-card p-3 shadow-lg ring-1 ring-border/60 intro-rise">
          <p className="mb-3 flex items-center gap-2 border-b pb-2 text-[11px] font-medium"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#2AABEE] text-white"><Send className="h-3 w-3" /></span>Anamnesies Bot</p>
          <div className="space-y-2 text-[11px] leading-snug">
            <p className="intro-pop ml-auto w-fit max-w-[85%] origin-bottom-right rounded-2xl rounded-br-md bg-[#2AABEE] px-2.5 py-1.5 text-white" style={d(500)}>{sample.chat[0]}</p>
            <p className="intro-pop w-fit max-w-[85%] origin-bottom-left rounded-2xl rounded-bl-md bg-muted px-2.5 py-1.5" style={d(1500)}>{sample.chat[1]}</p>
            <p className="intro-pop w-fit max-w-[85%] origin-bottom-left rounded-2xl rounded-bl-md bg-muted px-2.5 py-1.5" style={d(2700)}>{sample.chat[2]}</p>
          </div>
        </div>
      );
    case 'mcp':
      return (
        <div className="space-y-2.5">
          <div className="intro-rise rounded-2xl bg-[#0b0b0f] p-3.5 font-mono text-[11px] leading-relaxed text-white/90 shadow-lg">
            <p className="text-white/40">claude</p>
            <p className="intro-type" style={d(400)}><span className="text-[#7dd3fc]">&gt;</span> {sample.prompt}</p>
            <p className="intro-slide flex items-center gap-1.5 text-white/60" style={d(1600)}><Sparkles className="h-3 w-3 text-[#c4b5fd]" />anamnesies · {sample.tool}</p>
          </div>
          <Panel delay={2400} className="flex items-center gap-2.5 py-2.5">
            <span className="intro-pop flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success text-white" style={d(2700)}><Check className="h-3.5 w-3.5" /></span>
            <span className="text-[12px] font-medium">{sample.result}</span>
          </Panel>
        </div>
      );
  }
}
