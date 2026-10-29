'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BookMarked, Lightbulb } from 'lucide-react';

import { useI18n } from '@/components/i18n-provider';
import { SidebarItem, SidebarSection, SplitLayout } from '@/components/split-layout';
import { Button } from '@/components/ui/button';
import { SearchInput } from '@/components/workspace-ui';
import { type DocBlock, type DocSection, docs } from '@/lib/docs';
import { cn } from '@/lib/utils';

function blockText(block: DocBlock): string {
  if ('p' in block) return block.p;
  if ('h' in block) return block.h;
  if ('tip' in block) return block.tip;
  if ('code' in block) return block.code;
  if ('list' in block) return block.list.join(' ');
  if ('steps' in block) return block.steps.join(' ');
  return block.table.flat().join(' ');
}

export default function DocsPage() {
  const { t, language } = useI18n();
  const sections = docs[language];
  const [active, setActive] = useState(sections[0].id);
  const [query, setQuery] = useState('');
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash && sections.some((section) => section.id === hash)) setActive(hash);
  }, [sections]);

  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return null;
    return sections.filter((section) => `${section.title} ${section.summary} ${section.blocks.map(blockText).join(' ')}`.toLowerCase().includes(term));
  }, [query, sections]);

  const index = sections.findIndex((section) => section.id === active);
  const section = sections[index] ?? sections[0];

  function open(id: string) {
    setActive(id);
    window.history.replaceState(null, '', `#${id}`);
    scroller.current?.closest('.overflow-y-auto')?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <SplitLayout mobileLabel={t('nav.docs')} sidebar={(
      <>
        <div className="p-2 pt-3"><SearchInput value={query} onChange={setQuery} placeholder={t('search.trigger')} className="sm:w-full" /></div>
        <SidebarSection title={t('nav.docs')}>
          {(matches ?? sections).map((entry) => (
            <SidebarItem key={entry.id} active={entry.id === section.id} onClick={() => open(entry.id)} label={entry.title} />
          ))}
        </SidebarSection>
      </>
    )}>
      <article ref={scroller} key={section.id} className="mx-auto max-w-3xl px-6 pb-24 pt-10 duration-300 animate-in fade-in slide-in-from-bottom-1 sm:px-10">
        <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-brand"><BookMarked className="h-3.5 w-3.5" />{t('nav.docs')} · {index + 1}/{sections.length}</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{section.title}</h1>
        <p className="mt-2 text-lg text-muted-foreground">{section.summary}</p>
        <div className="mt-8 space-y-5 text-[15px] leading-7">
          {section.blocks.map((block, position) => <Block key={position} block={block} />)}
        </div>
        <DocPager sections={sections} index={index} onOpen={open} />
      </article>
    </SplitLayout>
  );
}

function Block({ block }: { block: DocBlock }) {
  if ('h' in block) return <h2 className="pt-4 text-xl font-semibold tracking-tight">{block.h}</h2>;
  if ('p' in block) return <p className="text-foreground/90">{block.p}</p>;
  if ('tip' in block) {
    return (
      <div className="flex gap-3 rounded-xl border border-brand/30 bg-brand/5 p-4 text-sm">
        <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-brand" /><p>{block.tip}</p>
      </div>
    );
  }
  if ('code' in block) return <pre className="overflow-x-auto rounded-xl border bg-muted/50 p-4 font-mono text-[13px] leading-6">{block.code}</pre>;
  if ('list' in block) return <ul className="list-disc space-y-1.5 pl-5 marker:text-brand">{block.list.map((item) => <li key={item}>{item}</li>)}</ul>;
  if ('steps' in block) {
    return (
      <ol className="space-y-3">
        {block.steps.map((item, position) => (
          <li key={item} className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/15 text-xs font-semibold text-brand">{position + 1}</span>
            <span className="pt-0.5">{item}</span>
          </li>
        ))}
      </ol>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border">
      <table className="w-full text-sm">
        <tbody className="divide-y">
          {block.table.map(([key, value]) => (
            <tr key={key} className="align-top">
              <td className="w-2/5 bg-muted/40 px-4 py-2.5 font-mono text-[13px]">{key}</td>
              <td className="px-4 py-2.5 text-muted-foreground">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DocPager({ sections, index, onOpen }: { sections: readonly DocSection[]; index: number; onOpen: (id: string) => void }) {
  const previous = sections[index - 1];
  const next = sections[index + 1];
  return (
    <div className={cn('mt-16 flex gap-3 border-t pt-6', !previous && 'justify-end')}>
      {previous && <Button variant="outline" className="h-auto flex-1 justify-start py-3" onClick={() => onOpen(previous.id)}><ArrowLeft />{previous.title}</Button>}
      {next && <Button variant="outline" className="h-auto flex-1 justify-end py-3" onClick={() => onOpen(next.id)}>{next.title}<ArrowRight /></Button>}
    </div>
  );
}
