import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { strToU8, strFromU8, unzipSync, zipSync } from 'fflate';
import { BACKUP_LIMIT, makeBackup, readBackup } from '../src/backup';
import { dateSchema, newArchive, newPerson, unknownDate, validateArchive, type Archive, type Attachment, type Relationship } from '../src/model';
import { db, saveArchiveTransaction } from '../src/storage';

function person(name: string) { return newPerson(name); }
function relation(from: string, to: string, type: Relationship['type'] = 'parent'): Relationship {
  return { id: `r_${from}_${to}_${type}`, from, to, type, parentKind: 'biological', status: 'partner', date: unknownDate(), place: '', notes: '' };
}
function validArchive(): Archive {
  const archive = newArchive('My family');
  archive.people = [person('Asha')];
  archive.rootPersonId = archive.people[0].id;
  return archive;
}
function fileLike(blob: Blob, name = 'backup.zip'): File { return Object.assign(blob, { name }) as File; }
function attachment(id: string, bytes = new Uint8Array([1, 2, 3]), name = 'photo.png'): Attachment {
  const blob = new Blob([bytes], { type: 'image/png' });
  return { id, name, type: 'image/png', size: blob.size, blob, createdAt: new Date(0).toISOString() };
}

beforeEach(async () => {
  db.close();
  await db.delete();
  await db.open();
});

describe('archive durability', () => {
  it('validates a 10,000-person parent chain in one indexed graph pass', () => {
    const archive = validArchive();
    const first = archive.people[0];
    archive.people = Array.from({ length: 10_000 }, (_, i) => i === 0 ? first : person(`Person ${i}`));
    archive.relationships = Array.from({ length: 9_999 }, (_, i) => relation(archive.people[i].id, archive.people[i + 1].id));
    expect(validateArchive(archive).people).toHaveLength(10_000);
  });

  it('rejects ancestry cycles and reverse duplicate undirected links', () => {
    const archive = validArchive();
    archive.people.push(person('B'), person('C'));
    archive.relationships = [relation(archive.people[0].id, archive.people[1].id), relation(archive.people[1].id, archive.people[2].id), relation(archive.people[2].id, archive.people[0].id)];
    expect(() => validateArchive(archive)).toThrow(/loop in the ancestry/);
    archive.relationships = [relation(archive.people[0].id, archive.people[1].id, 'partner'), relation(archive.people[1].id, archive.people[0].id, 'partner')];
    expect(() => validateArchive(archive)).toThrow(/already recorded/);
  });

  it('checks exact Gregorian dates for years 1 through 99', () => {
    const date = (value: string) => dateSchema.safeParse({ kind: 'date', value, end: '', approximate: false }).success;
    expect(date('0004-02-29')).toBe(true);
    expect(date('0001-02-29')).toBe(false);
    expect(date('0099-02-28')).toBe(true);
    expect(date('0099-02-29')).toBe(false);
  });
});

describe('backup media and database commits', () => {
  it('round-trips Unicode stories and attachment bytes with remapped IDs', async () => {
    const archive = validArchive();
    const oldId = 'media_original';
    archive.people[0].photoId = oldId;
    archive.memories.push({ id: 'memory_1', title: 'తెలుగు కథ', content: 'Café — 祖先 👨‍👩‍👧', personIds: [archive.people[0].id], category: 'story', date: unknownDate(), place: '', storyteller: 'అమ్మమ్మ', source: '', attachmentIds: [oldId], createdAt: archive.createdAt, updatedAt: archive.updatedAt });
    const bytes = new Uint8Array([0, 1, 2, 127, 128, 255]);
    await db.attachments.add(attachment(oldId, bytes));
    const zipped = await makeBackup(archive);
    expect(zipped.size).toBeLessThan(BACKUP_LIMIT);
    const restored = await readBackup(fileLike(zipped));
    expect(restored.archive.memories[0].content).toBe('Café — 祖先 👨‍👩‍👧');
    expect(restored.archive.people[0].photoId).toBe(restored.files[0].id);
    expect(restored.archive.memories[0].attachmentIds).toEqual([restored.files[0].id]);
    expect(restored.files[0].id).not.toBe(oldId);
    expect([...new Uint8Array(await restored.files[0].blob.arrayBuffer())]).toEqual([...bytes]);
  });

  it('rejects script-capable or otherwise unsupported attachment MIME types', async () => {
    const archive = validArchive();
    archive.people[0].photoId = 'bad_media';
    const bytes = new Uint8Array([60, 115, 118, 103, 62]);
    const manifest = { format: 'roots-backup', version: 1, archive, files: [{ id: 'bad_media', name: 'payload.svg', type: 'image/svg+xml', size: bytes.length, createdAt: new Date(0).toISOString(), path: 'media/bad_media' }] };
    const zip = zipSync({ 'family.json': strToU8(JSON.stringify(manifest)), 'media/bad_media': bytes });
    await expect(readBackup(fileLike(new Blob([zip])))).rejects.toThrow(/Choose a JPG/);
  });

  it('aborts commits with dangling references, duplicate IDs, or an existing media ID collision', async () => {
    const currentArchive = validArchive();
    const current = { id: 'active', revision: 1, archive: currentArchive };
    await db.active.add(current);
    const nextArchive = structuredClone(currentArchive);
    nextArchive.people[0].photoId = 'missing_media';
    const next = { ...current, revision: 2, archive: nextArchive };
    await expect(saveArchiveTransaction(current, next, 'Add photo')).rejects.toThrow(/referenced attachment is missing/);
    expect(await db.snapshots.count()).toBe(0);

    await db.attachments.add(attachment('collision_media'));
    nextArchive.people[0].photoId = 'collision_media';
    await expect(saveArchiveTransaction(current, next, 'Replace photo', [attachment('collision_media')])).rejects.toThrow(/already exists/);
    expect(await db.snapshots.count()).toBe(0);
    await expect(saveArchiveTransaction(current, next, 'Duplicate IDs', [attachment('new_media'), attachment('new_media')])).rejects.toThrow(/duplicate attachment IDs/);
  });

  it('adds imported media without replacing existing bytes or rewriting retained snapshots', async () => {
    const original = validArchive();
    original.people[0].photoId = 'immutable_media';
    const oldBytes = new Uint8Array([9, 8, 7]);
    await db.attachments.add(attachment('immutable_media', oldBytes));
    const current = { id: 'active', revision: 1, archive: original };
    await db.active.add(current);
    const oldSnapshot = { archive: structuredClone(original), label: 'Earlier', savedAt: new Date(0).toISOString() };
    await db.snapshots.add(oldSnapshot);
    const nextArchive = structuredClone(original);
    nextArchive.title = 'Updated';
    const imported = attachment('fresh_import');
    await saveArchiveTransaction(current, { ...current, revision: 2, archive: nextArchive }, 'Import', [imported]);
    expect((await db.attachments.get('immutable_media'))?.size).toBe(3);
    expect([...(new Uint8Array(await (await db.attachments.get('immutable_media'))!.blob.arrayBuffer()))]).toEqual([...oldBytes]);
    expect((await db.snapshots.get(1))?.archive.people[0].photoId).toBe('immutable_media');
    expect((await db.snapshots.get(2))?.archive.title).toBe(original.title);
    expect((await db.active.get('active'))?.archive.title).toBe('Updated');
  });
});
