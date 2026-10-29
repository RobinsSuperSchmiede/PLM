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
  '/knowledge': { type: 'knowledge', section: 'nav.knowledge', projectTab: 'documents' },
  '/ideas': { type: 'idea', section: 'nav.ideas', projectTab: 'overview' },
};

const sections: Record<string, TranslationKey> = {
  '/projects': 'nav.projects', '/tasks': 'nav.tasks', '/calendar': 'nav.calendar', '/reminders': 'nav.reminders',
  '/meetings': 'nav.meetings', '/notes': 'nav.notes', '/lists': 'nav.lists', '/ideas': 'nav.ideas',
  '/knowledge': 'nav.knowledge', '/graph': 'nav.graph', '/tags': 'nav.tags', '/archive': 'nav.archive',
  '/database': 'nav.database', '/telegram': 'nav.telegram', '/ai-assistant': 'nav.assistant',
  '/developer-center': 'nav.developer', '/settings': 'nav.settings', '/files': 'nav.files', '/images': 'nav.images', '/docs': 'nav.docs',
};

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
  } else if (base === '/notes') {
    crumbs.push({ label: t('nav.notes'), href: '/notes' });
    const note = id ? data.notes.find((item) => item.id === id) : undefined;
    const folderId = note ? note.folder_id : params.get('folder');
    for (const folder of folderPath(data.folders, folderId)) crumbs.push({ label: folder.name, href: `/notes?folder=${folder.id}` });
    if (note) crumbs.push({ label: note.title || untitled });
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
      <ol className="flex min-w-0 items-center gap-1 text-sm">
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          return (
            <Fragment key={`${index}-${crumb.label}`}>
              {index > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" aria-hidden="true" />}
              <li className={last ? 'min-w-0 truncate font-medium duration-300 animate-in fade-in slide-in-from-left-1' : index === 0 ? 'shrink-0' : 'hidden min-w-0 max-w-[14rem] truncate md:block'}>
                {crumb.href && !last ? (
                  <Link href={crumb.href} className="text-muted-foreground transition-colors hover:text-foreground">{crumb.label}</Link>
                ) : (
                  <span aria-current={last ? 'page' : undefined}>{crumb.label}</span>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
