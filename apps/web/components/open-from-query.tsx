'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef } from 'react';

/** Opens the entry named by ?id= (links from search, graph, tags, backlinks). Has its own Suspense boundary. */
export function OpenFromQuery<T extends { id: string }>({ items, onOpen }: { items: T[]; onOpen: (item: T) => void }) {
  return <Suspense fallback={null}><OpenFromQueryInner items={items} onOpen={onOpen} /></Suspense>;
}

function OpenFromQueryInner<T extends { id: string }>({ items, onOpen }: { items: T[]; onOpen: (item: T) => void }) {
  const id = useSearchParams().get('id');
  const opened = useRef<string | null>(null);
  useEffect(() => {
    if (!id || opened.current === id) return;
    const item = items.find((entry) => entry.id === id);
    if (item) {
      opened.current = id;
      onOpen(item);
    }
  }, [id, items, onOpen]);
  useEffect(() => {
    if (!id) opened.current = null;
  }, [id]);
  return null;
}

/** Removes ?id= from the URL once the opened entry is closed. */
export function useClearQueryId() {
  const router = useRouter();
  const pathname = usePathname();
  return useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has('id')) return;
    params.delete('id');
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router]);
}
