'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { Fragment } from 'react';

import { useI18n } from '@/components/i18n-provider';
import { useWorkspace } from '@/components/workspace-provider';
import { entityLabelKeys, resourceOf } from '@/lib/entities';
import type { TranslationKey } from '@/lib/i18n';
import type { Collections, EntityType, Folder } from '@/lib/types';

type Crumb = { label: string; href?: string };

/** Pages that open a single entry via ?id=, with the section they belong to. */
const detailPages: Record<string, { type: EntityType; section: TranslationKey; projectTab: string }> = {
  '/tasks': { type: 'task', section: 'nav.tasks', projectTab: 'tasks' },
  '/meetings': { type: 'meeting', section: 'nav.meetings', projectTab: 'schedule' },
  '/calendar': { type: 'event', section: 'nav.calendar', projectTab: 'schedule' },
  '/ideas': { type: 'idea', section: 'nav.ideas', projectTab: 'overview' },
};

const sections: Record<string, TranslationKey> = {
  '/today': 'nav.today', '/focus': 'nav.focus',
  '/projects': 'nav.projects', '/tasks': 'nav.tasks', '/calendar': 'nav.calendar', '/reminders': 'nav.reminders',
  '/meetings': 'nav.meetings', '/lists': 'nav.lists', '/ideas': 'nav.ideas',
  '/graph': 'nav.graph', '/tags': 'nav.tags', '/archive': 'nav.archive',
  '/database': 'nav.database', '/telegram': 'nav.telegram', '/ai-assistant': 'nav.assistant',
  '/developer-center': 'nav.developer', '/settings': 'nav.settings', '/docs': 'nav.docs',
};

const explorerViews: Record<string, TranslationKey> = { notes: 'nav.notes', docs: 'nav.knowledge', files: 'nav.files', images: 'nav.images' };

const projectTabs: Record<string, TranslationKey> = {
  tasks: 'projectHub.tasks', notes: 'projectHub.notes', schedule: 'projectHub.schedule', documents: 'projectHub.documents',
  telegram: 'projectHub.telegram', archive: 'projectHub.archive',
};

function folderPath(folders: Folder[], id: string | null | undefined): Folder[] {
  const path: Folder[] = [];
  const seen = new Set<string>();
  let current = folders.find((folder) => folder.id === id);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current);
    current = folders.find((folder) => folder.id === current?.parent_id);
  }
  return path;
}

function projectCrumbs(data: Collections, projectId: string | null | undefined, label: (key: TranslationKey) => string): Crumb[] {
  const project = data.projects.find((item) => item.id === projectId);
  return project ? [{ label: label('nav.projects'), href: '/projects' }, { label: project.name, href: `/projects/${project.id}` }] : [];
}

export function Breadcrumbs() {
  const pathname = usePathname();
  const params = useSearchParams();
  const { t } = useI18n();
  const { data } = useWorkspace();
  const untitled = t('common.untitled');

  const crumbs: Crumb[] = [{ label: t('ui.home'), href: '/' }];
  const base = `/${pathname.split('/')[1] ?? ''}`;
  const id = params.get('id');

  if (base === '/projects' && pathname !== '/projects') {
    const projectId = decodeURIComponent(pathname.split('/')[2] ?? '');
    const project = data.projects.find((item) => item.id === projectId);
    crumbs.push({ label: t('nav.projects'), href: '/projects' }, { label: project?.name ?? '…', href: pathname });
    const tab = params.get('tab');
    if (tab && projectTabs[tab]) crumbs.push({ label: t(projectTabs[tab]) });
  } else if (base === '/explorer') {
    crumbs.push({ label: t('nav.explorer'), href: '/explorer' });
    const note = id ? data.notes.find((item) => item.id === id) : undefined;
    const folderId = note ? note.folder_id : params.get('folder');
    const view = params.get('view');
    if (note || folderId) {
      crumbs.push({ label: t('nav.notes'), href: '/explorer?view=notes' });
      for (const folder of folderPath(data.folders, folderId)) crumbs.push({ label: folder.name, href: `/explorer?folder=${folder.id}` });
      if (note) crumbs.push({ label: note.title || untitled });
    } else if (view && explorerViews[view]) {
      crumbs.push({ label: t(explorerViews[view]), href: `/explorer?view=${view}` });
      const entry = id ? (view === 'docs' ? data.knowledge.find((item) => item.id === id)?.title : data.files.find((item) => item.id === id)?.name) : undefined;
      if (entry) crumbs.push({ label: entry });
    }
  } else if (base === '/tags') {
    crumbs.push({ label: t('nav.tags'), href: '/tags' });
    const name = pathname.split('/')[2];
    if (name) crumbs.push({ label: `#${decodeURIComponent(name)}` });
  } else if (base === '/database') {
    crumbs.push({ label: t('nav.database'), href: '/database' });
    const table = params.get('table');
    if (table) crumbs.push({ label: table });
  } else if (detailPages[base] && id) {
    const page = detailPages[base];
    const entry = (data[resourceOf(page.type)] as { id: string; title: string; project_id?: string | null }[]).find((item) => item.id === id);
    const viaProject = projectCrumbs(data, entry?.project_id, t);
    if (viaProject.length) {
      crumbs.push(...viaProject, { label: t(page.section), href: `/projects/${entry?.project_id}?tab=${page.projectTab}` });
    } else {
      crumbs.push({ label: t(page.section), href: base });
    }
    crumbs.push({ label: entry?.title || t(entityLabelKeys[page.type]) });
  } else if (sections[base]) {
    crumbs.push({ label: t(sections[base]) });
  }

  if (crumbs.length === 1) return <p className="truncate text-sm font-medium">{t('ui.home')}</p>;

  return (
    <nav aria-label={t('ui.breadcrumbs')} className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5">
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          const pill = 'block max-w-full truncate text-[13px] transition-colors duration-500 ease-ds';
          return (
            <Fragment key={`${index}-${crumb.label}`}>
              {index > 0 && <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" strokeWidth={1.6} aria-hidden="true" />}
              <li className={last ? 'min-w-0 duration-300 animate-in fade-in slide-in-from-left-1' : index === 0 ? 'shrink-0' : 'hidden min-w-0 max-w-[12rem] lg:block'}>
                {crumb.href && !last ? (
                  <Link href={crumb.href} className={`${pill} text-muted-foreground hover:text-foreground focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring`}>{crumb.label}</Link>
                ) : (
                  <span aria-current={last ? 'page' : undefined} className={`${pill} font-medium`}>{crumb.label}</span>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
