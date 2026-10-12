import Dexie, { type Table } from 'dexie';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { validateArchive, type Archive, type Attachment } from './model';
import { sampleArchive } from './seed';

type Active = { id: string; revision: number; archive: Archive };
export type Snapshot = { id?: number; archive: Archive; label: string; savedAt: string };
class FamilyDatabase extends Dexie {
  active!: Table<Active, string>;
  attachments!: Table<Attachment, string>;
  snapshots!: Table<Snapshot, number>;
  constructor() {
    super('roots-family-archive');
    this.version(1).stores({ active: 'id', attachments: 'id', snapshots: '++id,savedAt' });
  }
}
export const db = new FamilyDatabase();
const referencedFiles = (archive: Archive) => new Set([...archive.people.map(p => p.photoId), ...archive.memories.flatMap(m => m.attachmentIds)].filter(Boolean));
export async function saveArchiveTransaction(current: Active, next: Active, label: string, files: Attachment[] = []) {
  const fileIds = new Set<string>();
  for (const file of files) {
    if (fileIds.has(file.id)) throw new Error('The change contains duplicate attachment IDs.');
    if (!/^[a-zA-Z0-9_-]{1,120}$/.test(file.id)) throw new Error('An attachment ID is invalid.');
    validateAttachmentMetadata(file.name, file.type, file.size);
    if (file.blob.size !== file.size) throw new Error('An attachment is damaged or has an invalid size.');
    fileIds.add(file.id);
  }
  await db.transaction('rw', db.active, db.snapshots, db.attachments, async () => {
    const stored = await db.active.get('active');
    if (!stored || stored.revision !== current.revision) throw new Error('This family changed in another tab. Reload the latest archive before saving. Your form is still open.');
    const collisions = (await db.attachments.bulkGet([...fileIds])).some(Boolean);
    if (collisions) throw new Error('An attachment ID already exists. The change was not saved.');
    const available = new Set([...fileIds, ...(await db.attachments.bulkGet([...referencedFiles(next.archive)])).filter(Boolean).map(file => file!.id)]);
    for (const id of referencedFiles(next.archive)) if (!available.has(id)) throw new Error('A referenced attachment is missing. Add the file before saving.');
    await db.snapshots.add({ archive: current.archive, label, savedAt: new Date().toISOString() });
    const count = await db.snapshots.count();
    if (count > 30) { const old = await db.snapshots.orderBy('id').limit(count - 30).primaryKeys(); await db.snapshots.bulkDelete(old); }
    if (files.length) await db.attachments.bulkAdd(files);
    await db.active.put(next);
  });
}
type Store = {
  archive: Archive; revision: number; saving: boolean; error: string;
  commit: (update: (archive: Archive) => Archive, label: string, files?: Attachment[]) => Promise<void>;
  reload: () => Promise<void>;
};
const StoreContext = createContext<Store | null>(null);
export function ArchiveProvider({ children }: { children: ReactNode }) {
  const [row, setRow] = useState<Active | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const rowRef = useRef<Active | null>(null);
  const queue = useRef(Promise.resolve());
  const channel = useRef<BroadcastChannel | null>(null);
  const mounted = useRef(true);
  const applyRow = useCallback((value: Active) => { rowRef.current = value; if (mounted.current) setRow(value); }, []);
  const reload = useCallback(async () => {
    const next = await db.active.get('active');
    if (next) applyRow(next);
  }, [applyRow]);
  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    db.transaction('rw', db.active, async () => {
      let current = await db.active.get('active');
      if (!current) { current = { id: 'active', revision: 0, archive: sampleArchive() }; await db.active.add(current); }
      if (!cancelled) applyRow(current);
    }).catch(e => !cancelled && setLoadError(e instanceof Error ? e.message : 'Unable to open storage.'));
    if ('BroadcastChannel' in window) {
      const bc = new BroadcastChannel('roots-archive-changes'); channel.current = bc;
      bc.onmessage = () => { queue.current.then(reload).catch(() => {}); };
    }
    const refresh = () => { if (document.visibilityState === 'visible') queue.current.then(reload).catch(() => {}); };
    document.addEventListener('visibilitychange', refresh);
    return () => { cancelled = true; mounted.current = false; channel.current?.close(); document.removeEventListener('visibilitychange', refresh); };
  }, [applyRow, reload]);
  const commit = useCallback((update: (archive: Archive) => Archive, label: string, files: Attachment[] = []) => {
    setSaving(true); setError('');
    const job = queue.current.then(async () => {
      const current = rowRef.current;
      if (!current) throw new Error('Your archive is still opening.');
      const archive = validateArchive(update(structuredClone(current.archive)));
      archive.updatedAt = new Date().toISOString();
      const next: Active = { id: 'active', revision: current.revision + 1, archive };
      await saveArchiveTransaction(current, next, label, files);
      applyRow(next); channel.current?.postMessage({ revision: next.revision });
    });
    const settled = job.catch(async e => {
      try { const latest = await db.active.get('active'); if (latest) applyRow(latest); } catch {}
      setError(e instanceof Error ? e.message : 'The change could not be saved.'); throw e;
    });
    queue.current = settled.catch(() => {});
    return settled
      .finally(() => { queue.current.then(() => mounted.current && setSaving(false)); });
  }, [applyRow]);
  if (loadError) return <div className="fatal"><h1>Your archive could not open</h1><p>{loadError}</p><button onClick={() => location.reload()}>Try again</button><p>Allow browser storage for this site. Existing data has not been replaced.</p></div>;
  if (!row) return <div className="loading-screen"><div className="loading-mark"/><span>Opening your family archive…</span></div>;
  return <StoreContext.Provider value={{ archive: row.archive, revision: row.revision, saving, error, commit, reload }}>{children}</StoreContext.Provider>;
}
export function useArchive() {
  const store = useContext(StoreContext); if (!store) throw new Error('ArchiveProvider is missing.'); return store;
}
export function useAttachment(id: string) {
  const [file, setFile] = useState<Attachment | null>(null);
  const [url, setUrl] = useState('');
  useEffect(() => {
    let disposed = false, objectUrl = '';
    setFile(null); setUrl('');
    if (id) db.attachments.get(id).then(value => {
      if (!disposed && value) { objectUrl = URL.createObjectURL(value.blob); setFile(value); setUrl(objectUrl); }
    }).catch(() => {});
    return () => { disposed = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [id]);
  return { file, url };
}
const allowedTypes = /^(image\/(jpeg|png|webp|gif)|audio\/(mpeg|mp3|wav|x-wav|ogg|webm|mp4|aac)|application\/pdf|video\/(mp4|webm)|text\/plain)$/;
export function validateAttachmentMetadata(name: string, type: string, size: number) {
  if (typeof name !== 'string' || name.length > 250) throw new Error('Attachment names must be 250 characters or fewer.');
  if (typeof type !== 'string' || !allowedTypes.test(type)) throw new Error('Choose a JPG, PNG, WebP, GIF, PDF, text file, audio, or video recording.');
  if (!Number.isSafeInteger(size) || size < 0 || size > 50 * 1024 * 1024) throw new Error('Each file must be smaller than 50 MB.');
}
export function attachmentFromFile(file: File, id: string): Attachment {
  const type = file.type.split(';')[0];
  validateAttachmentMetadata(file.name.slice(0, 250), type, file.size);
  return { id, name: file.name.slice(0, 250), type, size: file.size, blob: file, createdAt: new Date().toISOString() };
}
