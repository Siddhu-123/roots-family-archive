import { zip, unzipSync, strToU8, strFromU8, type Zippable } from 'fflate';
import { db, validateAttachmentMetadata } from './storage';
import { validateArchive, newArchive, newPerson, unknownDate, uid, type Archive, type Attachment, type Person, type FamilyDate } from './model';

export const BACKUP_LIMIT = 500 * 1024 * 1024;
const README = 'Roots Family Archive\n\nfamily.json contains your people, relationships, heritage and stories in UTF-8 JSON.\nmedia/ contains the original attachment bytes. File names and media types are listed in family.json.\n\nKeep copies on more than one device and a private external drive or cloud folder.\nRestore this ZIP using the Backups page in Roots.\n';
const referencedFiles = (a: Archive) => new Set([...a.people.map(p => p.photoId), ...a.memories.flatMap(m => m.attachmentIds)].filter(Boolean));

export async function makeBackup(archive: Archive) {
  const ids = referencedFiles(archive);
  const assets = await db.attachments.bulkGet([...ids]);
  if (assets.some(x => !x)) throw new Error('An attachment is missing. Check your media before creating a complete backup.');
  const files: Zippable = {};
  const metadata = [];
  let total = 0;
  for (const asset of assets as Attachment[]) {
    validateAttachmentMetadata(asset.name, asset.type, asset.size);
    if (asset.blob.size !== asset.size) throw new Error('An attachment is damaged. Check your media before creating a complete backup.');
    total += asset.size;
    const path = `media/${asset.id}`;
    files[path] = [new Uint8Array(await asset.blob.arrayBuffer()), { level: 0 }];
    metadata.push({ id: asset.id, name: asset.name, type: asset.type, size: asset.size, createdAt: asset.createdAt, path });
  }
  const manifest = strToU8(JSON.stringify({ format: 'roots-backup', version: 1, exportedAt: new Date().toISOString(), archive, files: metadata }, null, 2));
  const readme = strToU8(README);
  total += manifest.length + readme.length;
  if (total > BACKUP_LIMIT) throw new Error('The expanded backup exceeds the 500 MB limit. Remove some attachments and try again.');
  files['family.json'] = [manifest, { level: 6 }];
  files['READ-ME.txt'] = readme;
  const bytes = await new Promise<Uint8Array>((resolve, reject) => zip(files, (error, data) => error ? reject(error) : resolve(data)));
  if (bytes.length > BACKUP_LIMIT) throw new Error('The backup is larger than the 500 MB import limit. Remove some attachments and try again.');
  return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/zip' });
}

export async function readBackup(file: File): Promise<{ archive: Archive; files: Attachment[] }> {
  if (file.size > BACKUP_LIMIT) throw new Error('The backup is larger than the 500 MB import limit.');
  if (/\.json$/i.test(file.name)) {
    try {
      const data = JSON.parse(await file.text());
      const archive = data.archive ? validateArchive(data.archive) : data.version ? validateArchive(data) : migrateLegacy(data);
      if (referencedFiles(archive).size) throw new Error('This JSON references media. Restore the complete ZIP backup instead.');
      return { archive, files: [] };
    } catch (error) {
      if (error instanceof Error && /references media/.test(error.message)) throw error;
      throw new Error('This family JSON is damaged or invalid.');
    }
  }
  let expectedTotal = 0;
  let entries: ReturnType<typeof unzipSync>;
  try {
    entries = unzipSync(new Uint8Array(await file.arrayBuffer()), { filter: entry => {
      if (!Number.isSafeInteger(entry.originalSize) || entry.originalSize < 0 || entry.originalSize > BACKUP_LIMIT || expectedTotal + entry.originalSize > BACKUP_LIMIT)
        throw new Error('The expanded backup exceeds 500 MB.');
      expectedTotal += entry.originalSize;
      return entry.name === 'family.json' || /^media\/[a-zA-Z0-9_-]+$/.test(entry.name);
    } });
  } catch (error) {
    if (error instanceof Error && error.message.includes('expanded backup exceeds')) throw error;
    throw new Error('This ZIP backup is damaged or invalid.');
  }
  const expandedTotal = Object.values(entries).reduce((sum, data) => sum + data.byteLength, 0);
  if (expandedTotal > BACKUP_LIMIT) throw new Error('The expanded backup exceeds 500 MB.');
  if (!entries['family.json']) throw new Error('This is not a Roots backup. The family.json record is missing.');
  let manifest: any;
  try { manifest = JSON.parse(strFromU8(entries['family.json'])); }
  catch { throw new Error('The backup manifest is damaged or invalid.'); }
  if (!manifest || manifest.format !== 'roots-backup' || manifest.version !== 1 || !Array.isArray(manifest.files)) throw new Error('This backup format is not supported.');
  const archive = validateArchive(manifest.archive);
  const files: Attachment[] = [];
  const remapped = new Map<string, string>();
  for (const item of manifest.files) {
    if (!item || typeof item.id !== 'string' || !/^[a-zA-Z0-9_-]{1,120}$/.test(item.id) || remapped.has(item.id) ||
        typeof item.name !== 'string' || typeof item.type !== 'string' || typeof item.size !== 'number' ||
        typeof item.path !== 'string' || item.path !== `media/${item.id}` || !Object.hasOwn(entries, item.path) ||
        typeof item.createdAt !== 'string' || item.createdAt.length > 64 || !Number.isFinite(Date.parse(item.createdAt)))
      throw new Error('An attachment record is invalid or missing.');
    const data = entries[item.path];
    validateAttachmentMetadata(item.name, item.type, item.size);
    if (data.length !== item.size) throw new Error('An attachment is damaged or too large.');
    const id = uid();
    remapped.set(item.id, id);
    files.push({ id, name: item.name, type: item.type, size: data.length, createdAt: item.createdAt, blob: new Blob([data as Uint8Array<ArrayBuffer>], { type: item.type }) });
  }
  for (const id of referencedFiles(archive)) if (!remapped.has(id)) throw new Error('This backup is incomplete. A referenced attachment is missing.');
  archive.people = archive.people.map(person => ({ ...person, photoId: person.photoId ? remapped.get(person.photoId)! : '' }));
  archive.memories = archive.memories.map(memory => ({ ...memory, attachmentIds: memory.attachmentIds.map(id => remapped.get(id)!) }));
  return { archive, files };
}

function legacyDate(value: unknown): FamilyDate {
  if (typeof value !== 'string' || !value) return unknownDate();
  return { kind: /^\d{4}-\d{2}-\d{2}$/.test(value) ? 'date' : 'year', value, end: '', approximate: false };
}
export function migrateLegacy(input: unknown): Archive {
  if (!input || typeof input !== 'object' || !('people' in input) || !Array.isArray(input.people)) throw new Error('Choose a Roots backup, GEDCOM file, or legacy family JSON.');
  const data = input as { people: Record<string, unknown>[]; links?: Record<string, unknown>[] };
  const a = newArchive('Imported family');
  const ids = new Map<string, string>();
  a.people = data.people.map(old => {
    const p = newPerson(String(old.firstName || old.givenName || 'Name unknown'));
    ids.set(String(old.id), p.id);
    return { ...p, surname: String(old.surname || ''), birth: legacyDate(old.birth), death: legacyDate(old.death), livingStatus: old.death ? 'deceased' : 'unknown', occupation: String(old.profession || ''), birthPlace: String(old.country || ''), notes: String(old.facts || '') } as Person;
  });
  a.rootPersonId = a.people[0]?.id || '';
  for (const old of data.links || []) {
    const from = ids.get(String(old.from)), to = ids.get(String(old.to));
    if (from && to) a.relationships.push({ id: uid(), from, to, type: old.type === 'spouse' ? 'partner' : old.type === 'sibling' ? 'sibling' : 'parent', parentKind: 'unknown', status: 'partner', date: unknownDate(), place: '', notes: '' });
  }
  return validateArchive(a);
}
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = name; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export function safeFilename(title: string) { return title.replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-|-$/g, '') || 'family'; }
