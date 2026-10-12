import { z } from 'zod';

export const uid = () => crypto.randomUUID();
const text = z.string().max(10000);
const id = z.string().min(1).max(120).regex(/^[a-zA-Z0-9_-]+$/);
export const dateSchema = z.object({
  kind: z.enum(['unknown', 'year', 'date', 'range', 'before', 'after']),
  value: z.string().max(40), end: z.string().max(40), approximate: z.boolean(),
}).superRefine((date, ctx) => {
  if (date.kind === 'unknown') return;
  const year = /^\d{1,4}$/;
  if (date.kind === 'date') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date.value)) {
      ctx.addIssue({ code: 'custom', path: ['value'], message: 'Choose a complete date.' }); return;
    }
    const [y, m, d] = date.value.split('-').map(Number);
    const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (y < 1 || m < 1 || m > 12 || d < 1 || d > days[m - 1])
      ctx.addIssue({ code: 'custom', path: ['value'], message: 'Enter a valid date.' });
  } else if (!year.test(date.value) || Number(date.value) < 1) {
    ctx.addIssue({ code: 'custom', path: ['value'], message: 'Enter a year from 1 to 9999.' });
  }
  if (date.kind === 'range' && (!year.test(date.end) || Number(date.end) < Number(date.value)))
    ctx.addIssue({ code: 'custom', path: ['end'], message: 'End year must be the same or later.' });
});
export type FamilyDate = z.infer<typeof dateSchema>;
export const unknownDate = (): FamilyDate => ({ kind: 'unknown', value: '', end: '', approximate: false });
export const yearDate = (value: number, approximate = false): FamilyDate => ({ kind: 'year', value: String(value), end: '', approximate });
export const personSchema = z.object({
  id, givenName: z.string().trim().min(1, 'Enter a name.').max(200), surname: z.string().max(200),
  nativeName: z.string().max(300), knownAs: z.string().max(300), maidenName: z.string().max(200),
  gender: z.enum(['female', 'male', 'nonbinary', 'unspecified']),
  livingStatus: z.enum(['living', 'deceased', 'unknown']), birth: dateSchema, death: dateSchema,
  gothram: z.string().max(200), ancestralVillage: z.string().max(300),
  birthPlace: z.string().max(300), currentPlace: z.string().max(300),
  occupation: z.string().max(300), languages: z.string().max(300),
  phone: z.string().max(80), email: z.string().max(300).refine(v => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Enter a valid email or leave it empty.'),
  notes: text, source: z.string().max(1000), confidence: z.enum(['confirmed', 'recalled', 'unsure']),
  photoId: z.string().max(120), customFacts: z.array(z.object({ id, label: z.string().min(1).max(200), value: text })).max(100),
  createdAt: z.string(), updatedAt: z.string(),
}).superRefine((p, ctx) => {
  if (p.livingStatus === 'living' && p.death.kind !== 'unknown')
    ctx.addIssue({ code: 'custom', path: ['death', 'value'], message: 'A living person cannot have a death date.' });
  const b = dateBounds(p.birth), d = dateBounds(p.death);
  const exactDatesReversed = p.birth.kind === 'date' && p.death.kind === 'date'
    && !p.birth.approximate && !p.death.approximate && p.birth.value > p.death.value;
  if (exactDatesReversed || (b && d && b[0] > d[1]))
    ctx.addIssue({ code: 'custom', path: ['death', 'value'], message: 'Death cannot be before birth.' });
});
export type Person = z.infer<typeof personSchema>;
export const relationshipSchema = z.object({
  id, from: id, to: id, type: z.enum(['parent', 'partner', 'sibling']),
  parentKind: z.enum(['biological', 'adoptive', 'step', 'guardian', 'unknown']),
  status: z.enum(['married', 'partner', 'separated', 'divorced', 'widowed']),
  date: dateSchema, place: z.string().max(300), notes: text,
});
export type Relationship = z.infer<typeof relationshipSchema>;
export const memorySchema = z.object({
  id, title: z.string().trim().min(1).max(300), content: text, personIds: z.array(id).max(10000),
  category: z.enum(['story', 'photo', 'document', 'tradition', 'recipe', 'interview']),
  date: dateSchema, place: z.string().max(300), storyteller: z.string().max(300),
  source: z.string().max(1000), attachmentIds: z.array(id).max(200), createdAt: z.string(), updatedAt: z.string(),
});
export type Memory = z.infer<typeof memorySchema>;
export const archiveSchema = z.object({
  version: z.literal(1), id, title: z.string().min(1).max(200), demo: z.boolean(),
  rootPersonId: z.string().max(120), people: z.array(personSchema).max(10000),
  relationships: z.array(relationshipSchema).max(30000), memories: z.array(memorySchema).max(10000),
  settings: z.object({ nameOrder: z.enum(['given-first', 'surname-first']), textSize: z.enum(['normal', 'large']), dateFormat: z.enum(['dmy', 'iso']) }),
  createdAt: z.string(), updatedAt: z.string(),
});
export type Archive = z.infer<typeof archiveSchema>;
export type Attachment = { id: string; name: string; type: string; size: number; blob: Blob; createdAt: string };
export const newPerson = (givenName = ''): Person => {
  const now = new Date().toISOString();
  return { id: uid(), givenName, surname: '', nativeName: '', knownAs: '', maidenName: '', gender: 'unspecified',
    livingStatus: 'unknown', birth: unknownDate(), death: unknownDate(), gothram: '', ancestralVillage: '', birthPlace: '',
    currentPlace: '', occupation: '', languages: '', phone: '', email: '', notes: '', source: '', confidence: 'recalled',
    photoId: '', customFacts: [], createdAt: now, updatedAt: now };
};
export const newArchive = (title = 'My family'): Archive => {
  const now = new Date().toISOString();
  return { version: 1, id: uid(), title, demo: false, rootPersonId: '', people: [], relationships: [], memories: [],
    settings: { nameOrder: 'given-first', textSize: 'normal', dateFormat: 'dmy' }, createdAt: now, updatedAt: now };
};
export function displayName(p: Person, order: Archive['settings']['nameOrder'] = 'given-first') {
  return (order === 'surname-first' ? [p.surname, p.givenName] : [p.givenName, p.surname]).filter(Boolean).join(' ');
}
export function dateBounds(d: FamilyDate): [number, number] | null {
  if (d.kind === 'unknown' || !d.value) return null;
  const n = Number(d.value.slice(0, 4));
  if (!Number.isFinite(n)) return null;
  if (d.kind === 'range') return [n, Number(d.end)];
  if (d.kind === 'before') return [0, n];
  if (d.kind === 'after') return [n, 9999];
  return [n, n];
}
export function formatFamilyDate(d: FamilyDate, format: 'dmy' | 'iso' = 'dmy'): string {
  if (d.kind === 'unknown' || !d.value) return '';
  const prefix = d.approximate ? 'c. ' : '';
  if (d.kind === 'date') {
    if (format === 'iso') return prefix + d.value;
    const [y, m, day] = d.value.split('-');
    return `${prefix}${Number(day)} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(m)-1]} ${y}`;
  }
  if (d.kind === 'range') return `${prefix}${d.value} - ${d.end}`;
  if (d.kind === 'before' || d.kind === 'after') return `${d.kind === 'before' ? 'Before' : 'After'} ${d.value}`;
  return prefix + d.value;
}
export function lifeSpan(p: Person) {
  const b = p.birth.kind === 'date' ? p.birth.value.slice(0, 4) : formatFamilyDate(p.birth);
  const d = p.death.kind === 'date' ? p.death.value.slice(0, 4) : formatFamilyDate(p.death);
  return [b || 'Birth unknown', p.livingStatus === 'living' ? 'Living' : d || (p.livingStatus === 'deceased' ? 'Deceased' : '')].filter(Boolean).join(' · ');
}
export function relatives(a: Archive, personId: string) {
  const find = (id: string) => a.people.find(p => p.id === id);
  return a.relationships.filter(r => r.from === personId || r.to === personId).flatMap(r => {
    const person = find(r.from === personId ? r.to : r.from);
    return person ? [{ person, relationship: r, label: r.type === 'parent' ? (r.to === personId ? 'Parent' : 'Child') : r.type === 'partner' ? 'Partner' : 'Sibling' }] : [];
  });
}
export function relationshipError(a: Archive, r: Relationship, ignoreId = ''): string | null {
  if (r.from === r.to) return 'A person cannot be related to themselves.';
  const people = new Set(a.people.map(p => p.id));
  if (!people.has(r.from) || !people.has(r.to)) return 'Choose two existing family members.';
  const existing = a.relationships.filter(e => e.id !== ignoreId);
  const pair = (type: Relationship['type'], from: string, to: string) => type === 'parent'
    ? `${type}:${from}:${to}` : `${type}:${from < to ? from : to}:${from < to ? to : from}`;
  const key = pair(r.type, r.from, r.to);
  if (existing.some(e => pair(e.type, e.from, e.to) === key)) return 'This relationship is already recorded.';
  if (r.type === 'parent') {
    const children = new Map<string, string[]>();
    for (const e of existing) if (e.type === 'parent') {
      const next = children.get(e.from);
      if (next) next.push(e.to); else children.set(e.from, [e.to]);
    }
    const visit = [r.to], seen = new Set<string>();
    while (visit.length) {
      const current = visit.pop()!;
      if (current === r.from) return 'This would create a loop in the ancestry. Check the parent and child.';
      if (seen.has(current)) continue; seen.add(current);
      for (const child of children.get(current) || []) visit.push(child);
    }
  }
  return null;
}
export function validateArchive(input: unknown): Archive {
  const a = archiveSchema.parse(input);
  for (const group of [a.people, a.relationships, a.memories]) {
    if (new Set(group.map(x => x.id)).size !== group.length) throw new Error('The file contains duplicate record IDs.');
  }
  const ids = new Set(a.people.map(p => p.id));
  if (a.rootPersonId && !ids.has(a.rootPersonId)) throw new Error('The starting person is missing from this archive.');
  const relationshipIds = new Set(a.people.map(p => p.id));
  const pairs = new Set<string>();
  const incoming = new Map([...relationshipIds].map(id => [id, 0]));
  const children = new Map<string, string[]>();
  for (const r of a.relationships) {
    if (!relationshipIds.has(r.from) || !relationshipIds.has(r.to)) throw new Error('Choose two existing family members.');
    if (r.from === r.to) throw new Error('A person cannot be related to themselves.');
    const pair = r.type === 'parent' ? `${r.type}:${r.from}:${r.to}`
      : `${r.type}:${r.from < r.to ? r.from : r.to}:${r.from < r.to ? r.to : r.from}`;
    if (pairs.has(pair)) throw new Error('This relationship is already recorded.');
    pairs.add(pair);
    if (r.type === 'parent') {
      incoming.set(r.to, incoming.get(r.to)! + 1);
      const next = children.get(r.from);
      if (next) next.push(r.to); else children.set(r.from, [r.to]);
    }
  }
  const queue = [...incoming].filter(([, count]) => count === 0).map(([id]) => id);
  let visited = 0;
  for (let i = 0; i < queue.length; i++) {
    visited++;
    for (const child of children.get(queue[i]) || []) {
      incoming.set(child, incoming.get(child)! - 1);
      if (incoming.get(child) === 0) queue.push(child);
    }
  }
  if (visited !== relationshipIds.size) throw new Error('This would create a loop in the ancestry. Check the parent and child.');
  if (a.memories.some(m => m.personIds.some(p => !ids.has(p)))) throw new Error('A memory refers to a missing person.');
  return a;
}
export function generationCount(a: Archive) {
  const incoming = new Map(a.people.map(p => [p.id, 0]));
  const depth = new Map(a.people.map(p => [p.id, 1]));
  const children = new Map<string, string[]>();
  for (const r of a.relationships.filter(r => r.type === 'parent')) {
    incoming.set(r.to, (incoming.get(r.to) || 0) + 1);
    children.set(r.from, [...(children.get(r.from) || []), r.to]);
  }
  const queue = a.people.filter(p => incoming.get(p.id) === 0).map(p => p.id);
  for (let i = 0; i < queue.length; i++) {
    for (const child of children.get(queue[i]) || []) {
      depth.set(child, Math.max(depth.get(child) || 1, (depth.get(queue[i]) || 1) + 1));
      incoming.set(child, incoming.get(child)! - 1);
      if (incoming.get(child) === 0) queue.push(child);
    }
  }
  return a.people.length ? Math.max(...depth.values()) : 0;
}
