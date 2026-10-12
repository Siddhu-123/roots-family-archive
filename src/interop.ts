import { newArchive, newPerson, uid, unknownDate, validateArchive, type Archive, type FamilyDate } from './model';
import { parseGedcom, writeGedcom, type GedcomPerson, type GedcomRelationship } from './gedcom';

const dateToGedcom = (date: FamilyDate): string => {
  if (date.kind === 'unknown' || !date.value) return '';
  const rawYear = (v: string) => String(Number(v)).padStart(4, '0');
  const full = (v: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return '';
    const [year, month, day] = v.split('-');
    const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    return `${Number(day)} ${months[Number(month) - 1]} ${year}`;
  };
  let raw = date.kind === 'date' ? full(date.value)
    : date.kind === 'range' ? `BET ${rawYear(date.value)} AND ${rawYear(date.end)}`
    : `${date.kind === 'before' ? 'BEF' : date.kind === 'after' ? 'AFT' : ''} ${rawYear(date.value)}`.trim();
  if (date.kind === 'year') raw = rawYear(date.value);
  if (!raw) return '';
  return date.approximate && date.kind !== 'range' ? `ABT ${raw}` : raw;
};

function dateFromGedcom(raw: string): { date: FamilyDate; unsupported: boolean } {
  const value = raw.trim().replace(/\s+/g, ' ');
  const unknown = { date: unknownDate(), unsupported: false };
  if (!value) return unknown;
  let text = value, approximate = false;
  const about = text.match(/^(ABT|CAL|EST)\s+(.+)$/i);
  if (about) { approximate = true; text = about[2]; }
  let match = text.match(/^(\d{1,4})$/);
  if (match && Number(match[1]) > 0) return { date: { kind: 'year', value: String(Number(match[1])), end: '', approximate }, unsupported: false };
  match = text.match(/^(\d{1,2})\s+([A-Z]{3})\s+(\d{1,4})$/i);
  const months = new Map(['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'].map((m, i) => [m, i + 1]));
  if (match && months.has(match[2].toUpperCase())) {
    const dateValue = `${String(Number(match[3])).padStart(4, '0')}-${String(months.get(match[2].toUpperCase())).padStart(2, '0')}-${String(Number(match[1])).padStart(2, '0')}`;
    if (!Number.isNaN(Date.parse(`${dateValue}T00:00:00Z`)) && new Date(`${dateValue}T00:00:00Z`).toISOString().slice(0, 10) === dateValue)
      return { date: { kind: 'date', value: dateValue, end: '', approximate }, unsupported: false };
  }
  match = text.match(/^(BET|FROM)\s+(\d{1,4})\s+(?:AND|TO)\s+(\d{1,4})$/i);
  if (match && Number(match[2]) > 0 && Number(match[3]) >= Number(match[2]))
    return { date: { kind: 'range', value: String(Number(match[2])), end: String(Number(match[3])), approximate }, unsupported: false };
  match = text.match(/^(BEF|AFT|BEF?ORE|AFT?ER)\s+(\d{1,4})$/i);
  if (match && Number(match[2]) > 0) return { date: { kind: /^B/i.test(match[1]) ? 'before' : 'after', value: String(Number(match[2])), end: '', approximate }, unsupported: false };
  match = text.match(/^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+(\d{1,4})$/i);
  if (match && Number(match[2]) > 0) return { date: { kind: 'year', value: String(Number(match[2])), end: '', approximate: true }, unsupported: false };
  return { date: unknownDate(), unsupported: true };
}

const genderOut = (gender: string) => gender === 'male' ? 'M' : gender === 'female' ? 'F' : 'U';
const genderIn = (gender: string) => gender.toUpperCase() === 'M' ? 'male' : gender.toUpperCase() === 'F' ? 'female' : 'unspecified';
const parentKindOut = (kind: string) => kind === 'biological' ? 'birth' : kind === 'adoptive' ? 'adopted' : kind;
const parentKindIn = (kind: string): 'biological' | 'adoptive' | 'step' | 'guardian' | 'unknown' => kind.toLowerCase() === 'birth' ? 'biological' : kind.toLowerCase() === 'adopted' ? 'adoptive' : ['step', 'foster', 'guardian', 'unknown'].includes(kind.toLowerCase()) ? (kind.toLowerCase() === 'foster' ? 'guardian' : kind.toLowerCase()) as 'step' | 'guardian' | 'unknown' : 'unknown';
const META_PREFIX = '[Family Tree Interop] ';

function extraPersonNote(p: Archive['people'][number]): string {
  const extras = {
    ancestralVillage: p.ancestralVillage, currentPlace: p.currentPlace, languages: p.languages,
    phone: p.phone, email: p.email, source: p.source, confidence: p.confidence, customFacts: p.customFacts,
    createdAt: p.createdAt, updatedAt: p.updatedAt,
    approximateRanges: {
      ...(p.birth.kind === 'range' && p.birth.approximate ? { birth: p.birth } : {}),
      ...(p.death.kind === 'range' && p.death.approximate ? { death: p.death } : {}),
    },
  };
  const visible = [
    p.ancestralVillage && `Ancestral village: ${p.ancestralVillage}`,
    p.currentPlace && `Current place: ${p.currentPlace}`,
    p.languages && `Languages: ${p.languages}`,
    p.phone && `Phone: ${p.phone}`, p.email && `Email: ${p.email}`, p.source && `Source: ${p.source}`,
    p.confidence && `Confidence: ${p.confidence}`,
    ...p.customFacts.map(f => `Custom fact, ${f.label}: ${f.value}`),
  ].filter(Boolean).join('; ');
  return Object.values(extras).some(v => Array.isArray(v) ? v.length > 0 : !!v)
    ? `${META_PREFIX}${JSON.stringify(extras)}${visible ? `\nOther details: ${visible}` : ''}` : '';
}

function decodePersonNotes(notes: string): { notes: string; extras: Record<string, unknown> } {
  let extras: Record<string, unknown> = {};
  const kept = notes.split('\n').filter(line => {
    if (!line.startsWith(META_PREFIX)) return true;
    try { extras = { ...extras, ...JSON.parse(line.slice(META_PREFIX.length)) }; } catch { return true; }
    return false;
  });
  return { notes: kept.join('\n'), extras };
}

export function archiveToGedcom(archive: Archive): string {
  const personById = new Map(archive.people.map(p => [p.id, p]));
  const parentNotes = new Map<string, string[]>();
  const siblingNotes = new Map<string, string[]>();
  const relationships: GedcomRelationship[] = [];
  for (const r of archive.relationships) {
    if (!personById.has(r.from) || !personById.has(r.to)) continue;
    if (r.type === 'parent') {
      relationships.push({ id: r.id, from: r.from, to: r.to, type: 'parent', parentKind: parentKindOut(r.parentKind), status: '', date: '', place: '' });
      const parent = personById.get(r.from)!;
      const details = [r.parentKind !== 'biological' && r.parentKind !== 'adoptive' ? `kind ${r.parentKind}` : '', r.status && `status ${r.status}`, r.date.kind !== 'unknown' && `date ${JSON.stringify(r.date)}`, r.place && `place ${r.place}`, r.notes && `notes ${r.notes}`].filter(Boolean).join('; ');
      if (details) (parentNotes.get(r.to) ?? parentNotes.set(r.to, []).get(r.to)!).push(`Parent relationship (${[parent.givenName, parent.surname].filter(Boolean).join(' ') || 'unknown'}): ${details}`);
    } else if (r.type === 'partner') {
      relationships.push({ id: r.id, from: r.from, to: r.to, type: 'partner', parentKind: '', status: r.status, date: dateToGedcom(r.date), place: r.place });
      if (r.notes) (parentNotes.get(r.from) ?? parentNotes.set(r.from, []).get(r.from)!).push(`Partner relationship: ${r.notes}`);
    } else {
      const a = personById.get(r.from)!, b = personById.get(r.to)!;
      const details = [r.status && `status ${r.status}`, r.date.kind !== 'unknown' && `date ${JSON.stringify(r.date)}`, r.place && `place ${r.place}`, r.notes && `notes ${r.notes}`].filter(Boolean).join('; ');
      const detail = `Sibling link (${[b.givenName, b.surname].filter(Boolean).join(' ') || 'unknown'}): ${details || 'recorded in the family archive'}`;
      (siblingNotes.get(r.from) ?? siblingNotes.set(r.from, []).get(r.from)!).push(detail);
    }
  }
  const people: GedcomPerson[] = archive.people.map(p => {
    const b = dateToGedcom(p.birth), d = dateToGedcom(p.death);
    const notes = [p.notes, extraPersonNote(p), ...(parentNotes.get(p.id) ?? []), ...(siblingNotes.get(p.id) ?? [])];
    for (const m of archive.memories.filter(m => m.personIds.includes(p.id))) notes.push(`Family ${m.category}: ${m.title}${m.date.kind !== 'unknown' ? ` (${JSON.stringify(m.date)})` : ''}${m.place ? ` — ${m.place}` : ''}\n${m.content}${m.storyteller ? `\nStoryteller: ${m.storyteller}` : ''}${m.source ? `\nSource: ${m.source}` : ''}`);
    return { id: p.id, givenName: p.givenName, surname: p.surname, gender: genderOut(p.gender), birth: b, death: d,
      deceased: p.livingStatus === 'deceased', birthPlace: p.birthPlace, deathPlace: '', gothram: p.gothram,
      nativeName: p.nativeName, knownAs: p.knownAs, maidenName: p.maidenName, notes: notes.filter(Boolean).join('\n'), occupation: p.occupation };
  });
  const archiveNotes = archive.memories.filter(m => m.personIds.length === 0).map(m => `Family ${m.category}: ${m.title}\n${m.content}${m.storyteller ? `\nStoryteller: ${m.storyteller}` : ''}${m.source ? `\nSource: ${m.source}` : ''}`);
  return writeGedcom({ title: archive.title, people, relationships, archiveNotes });
}

export function archiveFromGedcom(input: ArrayBuffer, title?: string): { archive: Archive; warnings: string[] } {
  const imported = parseGedcom(input);
  const archive = newArchive(title?.trim() || 'Imported family');
  const idMap = new Map<string, string>();
  const warnings = [...imported.warnings];
  archive.people = imported.people.map(source => {
    const p = newPerson(source.givenName.trim() || 'Name unknown');
    p.id = uid(); idMap.set(source.id, p.id);
    p.surname = source.surname; p.gender = genderIn(source.gender);
    const birth = dateFromGedcom(source.birth), death = dateFromGedcom(source.death);
    p.birth = birth.date; p.death = death.date;
    if (source.deceased) p.livingStatus = 'deceased';
    p.birthPlace = source.birthPlace; p.currentPlace = ''; p.occupation = source.occupation;
    p.gothram = source.gothram; p.nativeName = source.nativeName; p.knownAs = source.knownAs; p.maidenName = source.maidenName;
    p.notes = source.notes;
    for (const [label, date] of [['birth', birth], ['death', death]] as const) if (date.unsupported) {
      p.notes = [p.notes, `Unsupported ${label} date retained from GEDCOM: ${label === 'birth' ? source.birth : source.death}`].filter(Boolean).join('\n');
      warnings.push(`Person ${source.givenName || source.id} has an unsupported ${label} date; it was kept in notes.`);
    }
    const decoded = decodePersonNotes(p.notes); p.notes = decoded.notes;
    const extras = decoded.extras;
    for (const key of ['ancestralVillage', 'currentPlace', 'languages', 'phone', 'email', 'source'] as const) if (typeof extras[key] === 'string') p[key] = extras[key] as never;
    if (typeof extras.createdAt === 'string') p.createdAt = extras.createdAt;
    if (typeof extras.updatedAt === 'string') p.updatedAt = extras.updatedAt;
    if (extras.approximateRanges && typeof extras.approximateRanges === 'object') {
      const ranges = extras.approximateRanges as Record<string, FamilyDate>;
      if (ranges.birth?.kind === 'range') p.birth = ranges.birth;
      if (ranges.death?.kind === 'range') p.death = ranges.death;
    }
    if (['confirmed', 'recalled', 'unsure'].includes(String(extras.confidence))) p.confidence = extras.confidence as typeof p.confidence;
    if (Array.isArray(extras.customFacts)) p.customFacts = extras.customFacts.flatMap((fact: any) => fact && typeof fact.label === 'string' && typeof fact.value === 'string' ? [{ id: uid(), label: fact.label, value: fact.value }] : []);
    p.updatedAt = archive.updatedAt;
    return p;
  });
  archive.rootPersonId = archive.people[0]?.id ?? '';
  const seen = new Set<string>();
  for (const r of imported.relationships) {
    const from = idMap.get(r.from), to = idMap.get(r.to);
    if (!from || !to) { warnings.push(`Relationship ${r.id} was skipped because a person reference is missing.`); continue; }
    const type = r.type;
    const key = `${type}:${from}:${to}`;
    if (seen.has(key)) { warnings.push(`Duplicate ${type} relationship ${r.id} was skipped.`); continue; }
    seen.add(key);
    if (type === 'parent') archive.relationships.push({ id: uid(), from, to, type, parentKind: parentKindIn(r.parentKind), status: 'partner', date: unknownDate(), place: '', notes: '' });
    else archive.relationships.push({ id: uid(), from, to, type: 'partner', parentKind: 'unknown', status: ['married','partner','separated','divorced','widowed'].includes(r.status) ? r.status as any : 'partner', date: dateFromGedcom(r.date).date, place: r.place, notes: '' });
  }
  for (const note of imported.archiveNotes) if (note) archive.memories.push({ id: uid(), title: 'GEDCOM archive note', content: note, personIds: [], category: 'story', date: unknownDate(), place: '', storyteller: '', source: '', attachmentIds: [], createdAt: archive.createdAt, updatedAt: archive.updatedAt });
  archive.updatedAt = new Date().toISOString();
  return { archive: validateArchive(archive), warnings };
}
