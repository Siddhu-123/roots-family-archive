import { readGedcom } from 'read-gedcom';

export interface GedcomPerson {
  id: string; givenName: string; surname: string; gender: string; birth: string; death: string;
  deceased: boolean; birthPlace: string; deathPlace: string; gothram: string; nativeName: string;
  knownAs: string; maidenName: string; notes: string; occupation: string;
}
export interface GedcomRelationship {
  id: string; from: string; to: string; type: 'parent' | 'partner'; parentKind: string;
  status: string; date: string; place: string;
}

type GedcomNode = { tag: string; pointer?: string | null; value?: string | null; children?: GedcomNode[] };
type Family = { a: string; b?: string; children: { child: string; kind: string }[]; status: string; date: string; place: string; noPartner?: boolean; ref?: string };

const emptyPerson = (id: string): GedcomPerson => ({ id, givenName: '', surname: '', gender: '', birth: '', death: '', deceased: false, birthPlace: '', deathPlace: '', gothram: '', nativeName: '', knownAs: '', maidenName: '', notes: '', occupation: '' });
const value = (x: { valueNonNull(): string[] } | null | undefined) => x?.valueNonNull().join(' ') ?? '';
const safe = (s: string) => s.replace(/[\r\n]+/g, ' ').trim();
const rawLine = (s: string) => s.replace(/[\r\n]+/g, ' ');
const utf8Length = (s: string) => new TextEncoder().encode(s).length;
function appendNote(lines: string[], level: 1 | 0, note: string) {
  const logicalLines = note.split(/\r?\n/);
  logicalLines.forEach((logical, index) => {
    const firstPrefix = `${level} NOTE `;
    const contPrefix = `${level + 1} CONT `;
    let rest = rawLine(logical);
    let prefix = index === 0 ? firstPrefix : contPrefix;
    if (!rest) { lines.push(prefix.trimEnd()); return; }
    while (rest) {
      let chunk = '';
      for (const char of rest) {
        if (utf8Length(prefix + chunk + char) > 255) break;
        chunk += char;
      }
      if (!chunk) throw new Error('Unable to encode GEDCOM note line.');
      lines.push(prefix + chunk);
      rest = rest.slice(chunk.length);
      prefix = `${level + 1} CONC `;
    }
  });
}
const idFromPointer = (pointer: string | null | undefined) => pointer?.replace(/^@|@$/g, '') ?? '';
const refPointer = (ref: string | null | undefined) => ref ? (ref.startsWith('@') ? ref : `@${ref}@`) : '';

function noteText(note: GedcomNode): string {
  let text = note.value ?? '';
  for (const child of note.children ?? []) {
    if (child.tag === 'CONT') text += `\n${child.value ?? ''}`;
    else if (child.tag === 'CONC') text += child.value ?? '';
  }
  return text;
}

export function parseGedcom(input: ArrayBuffer): { people: GedcomPerson[]; relationships: GedcomRelationship[]; warnings: string[]; archiveNotes: string[] } {
  let doc;
  try { doc = readGedcom(input); } catch (e) { throw new Error(`Unable to parse GEDCOM input: ${e instanceof Error ? e.message : String(e)}`); }
  const root = doc;
  const inds = root.get('INDI').array() as GedcomNode[];
  const fams = root.get('FAM').array() as GedcomNode[];
  if (inds.length === 0 && fams.length === 0) throw new Error('Unable to parse GEDCOM input: no individual or family records were found.');

  const warnings: string[] = [];
  const archiveNotes = (root.get('NOTE').array() as GedcomNode[]).map(noteText);
  const people: GedcomPerson[] = [];
  const byPointer = new Map<string, GedcomPerson>();
  const individualNodes = new Map<string, GedcomNode>();
  for (const node of inds) {
    const pointer = node.pointer ?? undefined;
    const rec = root.getIndividualRecord(pointer);
    const raw = node.children ?? [];
    const custom = (tag: string) => raw.find(x => x.tag === tag)?.value ?? '';
    const id = custom('_ORIGID') || idFromPointer(node.pointer) || `I${people.length + 1}`;
    const p = emptyPerson(id);
    const key = refPointer(node.pointer ?? id);
    byPointer.set(key, p);
    individualNodes.set(key, node);
    const name = rec.getName(); const parts = name.valueAsParts()[0];
    p.givenName = parts?.[0] ?? value(name.getGivenName()); p.surname = parts?.[1] ?? value(name.getSurname());
    p.knownAs = value(name.getNickname()); p.gender = value(rec.getSex());
    const birth = rec.getEventBirth(), death = rec.getEventDeath();
    p.birth = value(birth.getDate()); p.birthPlace = value(birth.getPlace()); p.death = value(death.getDate()); p.deathPlace = value(death.getPlace());
    p.deceased = raw.some(x => x.tag === 'DEAT');
    p.occupation = value(rec.getAttributeOccupation());
    p.gothram = custom('_GOTRA'); p.nativeName = custom('_NATIVE'); p.knownAs ||= custom('_KNOWNAS'); p.maidenName = custom('_MAIDEN');
    const notes: string[] = [];
    for (const note of (raw.filter(x => x.tag === 'NOTE'))) notes.push(noteText(note));
    for (const association of rec.get('ASSO', null).array() as GedcomNode[]) notes.push(`GEDCOM association: ${association.value ?? ''}`);
    p.notes = notes.join('\n');
    people.push(p);
  }

  const relationships: GedcomRelationship[] = [];
  const seen = new Set<string>();
  const add = (r: GedcomRelationship) => {
    const key = `${r.type}:${r.from}:${r.to}:${r.parentKind}:${r.status}:${r.date}:${r.place}`;
    if (!seen.has(key)) { seen.add(key); relationships.push({ ...r, id: `R${relationships.length + 1}` }); }
  };
  const familyRef = (ref: string | null | undefined) => refPointer(ref);
  for (let fi = 0; fi < fams.length; fi++) {
    const node = fams[fi], fam = root.getFamilyRecord(node.pointer ?? undefined);
    const memberRefs = [...fam.getHusband().valueNonNull(), ...fam.getWife().valueNonNull()].map(familyRef);
    const members = memberRefs.map(ref => byPointer.get(ref)).filter((p): p is GedcomPerson => !!p);
    if (memberRefs.some(ref => !byPointer.has(ref))) warnings.push(`Family ${node.pointer ?? fi + 1} references an unknown partner.`);
    const status = node.children?.find(x => x.tag === '_STAT' || x.tag === 'STAT')?.value ?? '';
    const marriage = fam.getEventMarriage();
    const date = value(marriage.getDate()), place = value(marriage.getPlace());
    if (members.length === 2 && node.children?.find(x => x.tag === '_NOPARTNER')?.value !== 'Y') {
      add({ id: '', from: members[0].id, to: members[1].id, type: 'partner', parentKind: '', status, date, place });
    }
    const childRefs = fam.getChild().valueNonNull().map(familyRef);
    for (const childRef of childRefs) {
      const child = byPointer.get(childRef);
      if (!child) { warnings.push(`Family ${node.pointer ?? fi + 1} references missing child ${childRef}.`); continue; }
      const familyNode = node.children?.find(x => x.tag === 'CHIL' && familyRef(x.value) === childRef);
      const individualNode = individualNodes.get(childRef);
      const famc = individualNode?.children?.find(x => x.tag === 'FAMC' && familyRef(x.value) === familyRef(node.pointer));
      const pedigree = familyNode?.children?.find(x => x.tag === 'PEDI')?.value ?? famc?.children?.find(x => x.tag === 'PEDI')?.value ?? '';
      for (const parent of members) add({ id: '', from: parent.id, to: child.id, type: 'parent', parentKind: pedigree, status: '', date: '', place: '' });
    }
    for (const link of node.children?.filter(x => x.tag === 'CHIL') ?? []) {
      if (!childRefs.includes(familyRef(link.value))) warnings.push(`Family ${node.pointer ?? fi + 1} has a malformed child link.`);
    }
  }
  for (const [pointer, node] of individualNodes) for (const link of node.children?.filter(x => x.tag === 'FAMC') ?? []) {
    if (!fams.some(f => f.pointer === familyRef(link.value))) warnings.push(`Individual ${pointer} references missing family ${link.value}.`);
  }
  for (const p of people) if (!p.gender) p.gender = 'U';
  return { people, relationships, warnings, archiveNotes };
}

export function writeGedcom(data: { title: string; people: GedcomPerson[]; relationships: GedcomRelationship[]; archiveNotes?: string[] }): string {
  const lines = ['0 HEAD', '1 SOUR ROOTS-INTEROP', '1 GEDC', '2 VERS 5.5.1', '2 FORM LINEAGE-LINKED', '1 CHAR UTF-8', `1 TITL ${safe(data.title) || 'Family tree'}`];
  const ids = new Map(data.people.map((p, i) => [p.id, `@I${i + 1}@`]));
  const fams = new Map<string, Family>();
  const partnerPairs = new Set(data.relationships.filter(r => r.type === 'partner' && ids.has(r.from) && ids.has(r.to)).map(r => [r.from, r.to].sort().join('|')));
  const family = (a: string, b?: string, relationship?: GedcomRelationship) => {
    const [first, second] = b ? [a, b].sort() : [a, undefined];
    const key = second ? `${first}|${second}` : `${first}|`;
    let f = fams.get(key);
    if (!f) { f = { a: first, b: second, children: [], status: '', date: '', place: '' }; fams.set(key, f); }
    if (relationship) { f.status = relationship.status; f.date = relationship.date; f.place = relationship.place; }
    return f;
  };
  const extraNotes = new Map<string, string[]>();
  for (const r of data.relationships) {
    if (!ids.has(r.from) || !ids.has(r.to)) continue;
    if (r.type === 'partner') family(r.from, r.to, r);
    else if (r.type !== 'parent') (extraNotes.get(r.from) ?? extraNotes.set(r.from, []).get(r.from)!).push(`Relationship (${r.type}): ${r.from} -> ${r.to}; ${r.parentKind} ${r.status} ${r.date} ${r.place}`);
  }

  const parentsByChild = new Map<string, { from: string; kind: string }[]>();
  for (const r of data.relationships) if (r.type === 'parent' && ids.has(r.from) && ids.has(r.to)) (parentsByChild.get(r.to) ?? parentsByChild.set(r.to, []).get(r.to)!).push({ from: r.from, kind: r.parentKind });
  for (const [child, parents] of parentsByChild) {
    const unique = [...new Map(parents.map(p => [p.from, p])).values()];
    const kinds = new Set(unique.map(p => p.kind));
    if (unique.length === 2 && kinds.size > 1) {
      for (const parent of unique) {
        const f = family(parent.from);
        f.noPartner = true;
        f.children.push({ child, kind: parent.kind });
      }
    } else {
      const families = unique.length > 2 ? unique.map(p => family(p.from)) : [family(unique[0].from, unique[1]?.from)];
      for (const parent of unique) {
        const f = families.find(candidate => candidate.a === parent.from || candidate.b === parent.from)!;
        f.children.push({ child, kind: parent.kind });
      }
      if (unique.length === 2) {
        const [first, second] = [unique[0].from, unique[1].from].sort();
        const f = families.find(candidate => candidate.a === first && candidate.b === second);
        if (f && !partnerPairs.has([unique[0].from, unique[1].from].sort().join('|'))) f.noPartner = true;
      }
    }
  }
  for (const f of fams.values()) f.children = f.children.filter((x, i, a) => a.findIndex(y => y.child === x.child && y.kind === x.kind) === i);
  const individualFamilies = new Map<string, string[]>();
  let serial = 0;
  for (const f of fams.values()) {
    f.ref = `@F${++serial}@`;
    (individualFamilies.get(f.a) ?? individualFamilies.set(f.a, []).get(f.a)!).push(f.ref);
    if (f.b) (individualFamilies.get(f.b) ?? individualFamilies.set(f.b, []).get(f.b)!).push(f.ref);
    f.children = f.children.filter(x => ids.has(x.child));
  }
  for (const p of data.people) {
    const ref = ids.get(p.id)!;
    lines.push(`0 ${ref} INDI`, `1 _ORIGID ${safe(p.id)}`, `1 NAME ${safe(p.givenName).replace(/\//g, ' ')} /${safe(p.surname).replace(/\//g, ' ')}/`);
    if (p.gender) lines.push(`1 SEX ${safe(p.gender)}`);
    for (const [tag, val] of [['_GOTRA', p.gothram], ['_NATIVE', p.nativeName], ['_KNOWNAS', p.knownAs], ['_MAIDEN', p.maidenName]] as const) if (val) lines.push(`1 ${tag} ${safe(val)}`);
    if (p.birth || p.birthPlace) { lines.push('1 BIRT'); if (p.birth) lines.push(`2 DATE ${rawLine(p.birth)}`); if (p.birthPlace) lines.push(`2 PLAC ${safe(p.birthPlace)}`); }
    if (p.death || p.deceased || p.deathPlace) { lines.push('1 DEAT'); if (p.death) lines.push(`2 DATE ${rawLine(p.death)}`); if (p.deathPlace) lines.push(`2 PLAC ${safe(p.deathPlace)}`); }
    if (p.occupation) lines.push(`1 OCCU ${safe(p.occupation)}`);
    const notes = [p.notes, ...(extraNotes.get(p.id) ?? [])].filter(Boolean);
    for (const note of notes) appendNote(lines, 1, note);
    for (const f of fams.values()) if (f.children.some(x => x.child === p.id)) {
      lines.push(`1 FAMC ${f.ref}`);
      const kind = f.children.find(x => x.child === p.id)?.kind;
      if (kind) lines.push(`2 PEDI ${safe(kind)}`);
    }
    for (const familyRefValue of individualFamilies.get(p.id) ?? []) lines.push(`1 FAMS ${familyRefValue}`);
  }
  for (const note of data.archiveNotes ?? []) appendNote(lines, 0, note);
  for (const f of fams.values()) {
    lines.push(`0 ${f.ref} FAM`);
    if (f.a) lines.push(`1 HUSB ${ids.get(f.a)}`);
    if (f.b) lines.push(`1 WIFE ${ids.get(f.b)}`);
    if (f.date || f.place) { lines.push('1 MARR'); if (f.date) lines.push(`2 DATE ${rawLine(f.date)}`); if (f.place) lines.push(`2 PLAC ${safe(f.place)}`); }
    if (f.status) lines.push(`1 _STAT ${safe(f.status)}`);
    if (f.noPartner && f.b) lines.push('1 _NOPARTNER Y');
    for (const child of f.children) lines.push(`1 CHIL ${ids.get(child.child)}`, ...(child.kind ? [`2 PEDI ${safe(child.kind)}`] : []));
    lines.push(`1 NCHI ${f.children.length}`);
  }
  lines.push('0 TRLR'); return lines.join('\n') + '\n';
}
