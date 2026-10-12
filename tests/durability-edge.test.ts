import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { BACKUP_LIMIT, makeBackup, readBackup } from '../src/backup';
import { newArchive, newPerson, type Archive, type Attachment } from '../src/model';
import { db, saveArchiveTransaction } from '../src/storage';

type Active = { id: string; revision: number; archive: Archive };

function makeArchive() {
  const archive = newArchive('Durability family');
  archive.people = [newPerson('Asha')];
  archive.rootPersonId = archive.people[0].id;
  return archive;
}

function media(id: string, bytes = new Uint8Array([17, 34, 51])): Attachment {
  const blob = new Blob([bytes], { type: 'image/png' });
  return { id, name: 'photo.png', type: 'image/png', size: blob.size, blob, createdAt: new Date(0).toISOString() };
}

function asFile(blob: Blob, name = 'backup.zip'): File {
  return Object.assign(blob, { name }) as File;
}

function fixtureManifest(archive: Archive, files: unknown[] = []) {
  return { format: 'roots-backup', version: 1, exportedAt: new Date(0).toISOString(), archive, files };
}

beforeEach(async () => {
  db.close();
  await db.delete();
  await db.open();
});

afterEach(() => vi.restoreAllMocks());

describe('durability edge cases', () => {
  it('rejects a stale revision without changing active, snapshots, or media', async () => {
    const archive = makeArchive();
    const stored: Active = { id: 'active', revision: 8, archive: { ...archive, title: 'Latest' } };
    const stale: Active = { id: 'active', revision: 7, archive };
    await db.active.add(stored);
    await db.snapshots.add({ archive, label: 'Existing snapshot', savedAt: new Date(0).toISOString() });
    await db.attachments.add(media('existing_media'));
    const mediaBefore = await db.attachments.toArray();
    const nextArchive = structuredClone(archive);
    nextArchive.people[0].photoId = 'new_media';

    await expect(saveArchiveTransaction(stale, { ...stale, revision: 8, archive: nextArchive }, 'Stale save', [media('new_media')]))
      .rejects.toThrow(/changed in another tab/);

    expect(await db.active.get('active')).toEqual(stored);
    expect(await db.snapshots.toArray()).toEqual([{ id: 1, archive, label: 'Existing snapshot', savedAt: new Date(0).toISOString() }]);
    expect(await db.attachments.toArray()).toEqual(mediaBefore);
    expect(await db.attachments.get('new_media')).toBeUndefined();
  });

  it('rolls back the snapshot and active write when attachments.bulkAdd hits quota inside the transaction', async () => {
    const archive = makeArchive();
    const current: Active = { id: 'active', revision: 1, archive };
    await db.active.add(current);
    const nextArchive = structuredClone(archive);
    nextArchive.people[0].photoId = 'quota_media';
    let transactionWasActive = false;
    const bulkAdd = vi.spyOn(db.attachments, 'bulkAdd').mockImplementation(() => {
      transactionWasActive = Boolean(Dexie.currentTransaction);
      return Dexie.Promise.reject(new DOMException('Storage quota exceeded', 'QuotaExceededError'));
    });

    await expect(saveArchiveTransaction(current, { ...current, revision: 2, archive: nextArchive }, 'Add media', [media('quota_media')]))
      .rejects.toMatchObject({ name: 'QuotaExceededError' });

    expect(bulkAdd).toHaveBeenCalledOnce();
    expect(transactionWasActive).toBe(true);
    expect(await db.active.get('active')).toEqual(current);
    expect(await db.snapshots.count()).toBe(0);
    expect(await db.attachments.get('quota_media')).toBeUndefined();
  });

  it('keeps a media-referencing snapshot within the 30-snapshot limit and restores its original bytes', async () => {
    const original = makeArchive();
    const originalId = 'immutable_media';
    const bytes = new Uint8Array([0, 4, 128, 255]);
    original.people[0].photoId = originalId;
    await db.attachments.add(media(originalId, bytes));
    let current: Active = { id: 'active', revision: 0, archive: original };
    await db.active.add(current);

    for (let revision = 1; revision <= 30; revision++) {
      const nextArchive = structuredClone(current.archive);
      nextArchive.title = `Revision ${revision}`;
      if (revision === 1) nextArchive.people[0].photoId = '';
      current = { ...current, revision, archive: nextArchive };
      await saveArchiveTransaction({ ...current, revision: revision - 1, archive: revision === 1 ? original : (await db.active.get('active'))!.archive }, current, `Revision ${revision}`);
    }

    const snapshots = await db.snapshots.orderBy('id').toArray();
    expect(snapshots).toHaveLength(30);
    expect(snapshots[0].archive.people[0].photoId).toBe(originalId);
    expect((await db.active.get('active'))?.archive.people[0].photoId).toBe('');
    expect([...(new Uint8Array(await (await db.attachments.get(originalId))!.blob.arrayBuffer()))]).toEqual([...bytes]);

    const restored = await readBackup(asFile(await makeBackup(snapshots[0].archive)));
    expect(restored.archive.people[0].photoId).toBe(restored.files[0].id);
    expect([...(new Uint8Array(await restored.files[0].blob.arrayBuffer()))]).toEqual([...bytes]);
  });

  it('blocks a complete export when referenced media is missing', async () => {
    const archive = makeArchive();
    archive.people[0].photoId = 'missing_media';
    await expect(makeBackup(archive)).rejects.toThrow(/attachment is missing/);
  });

  it('rejects restored archives with duplicate records and media whose declared size mismatches its bytes', async () => {
    const duplicate = makeArchive();
    duplicate.people.push(structuredClone(duplicate.people[0]));
    const duplicateZip = zipSync({ 'family.json': strToU8(JSON.stringify(fixtureManifest(duplicate))) });
    await expect(readBackup(asFile(new Blob([duplicateZip])))).rejects.toThrow(/duplicate record IDs/);

    const archive = makeArchive();
    archive.people[0].photoId = 'mismatch_media';
    const contents = new Uint8Array([1, 2, 3]);
    const manifest = fixtureManifest(archive, [{
      id: 'mismatch_media', name: 'photo.png', type: 'image/png', size: contents.length + 1,
      createdAt: new Date(0).toISOString(), path: 'media/mismatch_media',
    }]);
    const mismatchZip = zipSync({ 'family.json': strToU8(JSON.stringify(manifest)), 'media/mismatch_media': contents });
    await expect(readBackup(asFile(new Blob([mismatchZip])))).rejects.toThrow(/damaged or too large/);
  });

  it('rejects an oversized ZIP expansion from its central-directory header without allocating the expansion', async () => {
    const zip = zipSync({ 'family.json': strToU8('{}') });
    const bytes = new Uint8Array(zip);
    const signature = [0x50, 0x4b, 0x01, 0x02];
    let central = -1;
    for (let i = 0; i <= bytes.length - signature.length; i++) {
      if (signature.every((value, index) => bytes[i + index] === value)) { central = i; break; }
    }
    expect(central).toBeGreaterThanOrEqual(0);
    const expanded = BACKUP_LIMIT + 1;
    new DataView(bytes.buffer).setUint32(central + 24, expanded, true);
    await expect(readBackup(asFile(new Blob([bytes])))).rejects.toThrow(/expanded backup exceeds 500 MB/);
  });

  it('rejects an input file whose declared compressed size exceeds the import limit before reading it', async () => {
    const file = asFile(new Blob([]));
    Object.defineProperty(file, 'size', { value: BACKUP_LIMIT + 1 });
    const arrayBuffer = vi.spyOn(file, 'arrayBuffer');
    await expect(readBackup(file)).rejects.toThrow(/larger than the 500 MB import limit/);
    expect(arrayBuffer).not.toHaveBeenCalled();
  });
});
