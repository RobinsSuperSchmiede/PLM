import type { AppSettings, Collections, EntityLink, Tag, TagAssignment } from '@/lib/types';

/**
 * The last loaded workspace, kept in this browser (IndexedDB) so pages render at once on the next
 * visit. `syncedAt` is the server time of that state; the next start only asks for changes since then.
 *
 * IndexedDB stores the object as it is (no JSON string) and works asynchronously, so reading a large
 * workspace does not block the first paint the way localStorage did.
 */
export type Snapshot = {
  data: Collections;
  tags: Tag[];
  tagAssignments: TagAssignment[];
  links: EntityLink[];
  settings: AppSettings | null;
  syncedAt: string;
  /** Fingerprint of tags and links as the server sent them; null after local edits to them. */
  organizationVersion?: string | null;
};

const databaseName = 'anamnesies';
const storeName = 'cache';
const snapshotKey = 'snapshot.v2';
/** Where the snapshot lived before; removed once so the old copy does not keep using storage. */
const legacyLocalStorageKey = 'anamnesies.snapshot.v1';

let opening: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('IndexedDB is blocked'));
  });
  // A failed attempt (private mode, storage disabled) may be retried later.
  opening.catch(() => { opening = null; });
  return opening;
}

function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then((database) => new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    const request = action(transaction.objectStore(storeName));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  }));
}

/** The cache is optional: every failure just means "no snapshot". */
export async function readSnapshot(): Promise<Snapshot | null> {
  try {
    window.localStorage.removeItem(legacyLocalStorageKey);
  } catch { /* storage unavailable */ }
  try {
    const snapshot = await run<Snapshot | undefined>('readonly', (store) => store.get(snapshotKey));
    return snapshot?.data && snapshot.syncedAt ? snapshot : null;
  } catch {
    return null;
  }
}

export async function writeSnapshot(snapshot: Snapshot): Promise<void> {
  try {
    await run('readwrite', (store) => store.put(snapshot, snapshotKey));
  } catch { /* quota exceeded or storage unavailable */ }
}

export async function clearSnapshot(): Promise<void> {
  try {
    await run('readwrite', (store) => store.delete(snapshotKey));
  } catch { /* nothing to clear */ }
}
