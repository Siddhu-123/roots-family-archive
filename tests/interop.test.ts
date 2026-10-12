import { describe, expect, it } from 'vitest';
import { archiveFromGedcom, archiveToGedcom } from '../src/interop';
import { newArchive, newPerson, unknownDate, type Archive } from '../src/model';
import { parseGedcom } from '../src/gedcom';

const blank = (title = 'Family'): Archive => newArchive(title);
const bytes = (text: string) => new TextEncoder().encode(text).buffer;

describe('archive/GEDCOM adapter', () => {
  it('roundtrips approximate, exact, range, before, after, and unknown dates', () => {
    const archive = blank();
    const p = newPerson('தமிழ் பெயர்');
    p.surname = 'Rao'; p.birth = { kind: 'year', value: '1900', end: '', approximate: true };
    p.death = { kind: 'date', value: '1984-03-12', end: '', approximate: false };
    const b = newPerson('Range'); b.birth = { kind: 'range', value: '1870', end: '1872', approximate: false };
    const c = newPerson('Before'); c.birth = { kind: 'before', value: '1880', end: '', approximate: false };
    const d = newPerson('After'); d.birth = { kind: 'after', value: '1890', end: '', approximate: false };
    const e = newPerson('Unknown'); e.birth = unknownDate();
    archive.people = [p, b, c, d, e]; archive.rootPersonId = p.id;
    const got = archiveFromGedcom(bytes(archiveToGedcom(archive))).archive;
    expect(got.people.map(x => x.birth)).toEqual([p.birth, b.birth, c.birth, d.birth, e.birth]);
    expect(got.people[0].death).toEqual(p.death);
  });

  it('retains native names, other fields, story and source text', () => {
    const archive = blank(); const p = newPerson('Kannan');
    p.nativeName = 'கண்ணன்'; p.gothram = 'Bharadwaja'; p.knownAs = 'கண்ணு'; p.maidenName = 'Iyer';
    p.ancestralVillage = 'Thanjavur'; p.languages = 'தமிழ்'; p.email = 'person@example.org'; p.source = 'Grandmother interview';
    p.notes = 'Family notes';
    archive.people = [p]; archive.rootPersonId = p.id;
    archive.memories = [{ id: 'story', title: 'The journey', content: 'They moved from the village.', personIds: [p.id], category: 'story', date: unknownDate(), place: '', storyteller: 'Aunt', source: 'Oral history', attachmentIds: [], createdAt: p.createdAt, updatedAt: p.updatedAt }];
    const out = archiveToGedcom(archive);
    const imported = archiveFromGedcom(bytes(out)).archive;
    expect(imported.people[0]).toMatchObject({ nativeName: 'கண்ணன்', gothram: 'Bharadwaja', knownAs: 'கண்ணு', maidenName: 'Iyer', ancestralVillage: 'Thanjavur', languages: 'தமிழ்', email: 'person@example.org' });
    expect(imported.people[0].notes).toContain('Family notes');
    expect(imported.people[0].notes).toContain('The journey');
    expect(imported.people[0].notes).toContain('Oral history');
  });

  it('keeps co-parents without inferring a partner relationship', () => {
    const archive = blank(); const a = newPerson('Parent A'), b = newPerson('Parent B'), child = newPerson('Child');
    archive.people = [a, b, child]; archive.rootPersonId = child.id;
    archive.relationships = [a, b].map(parent => ({ id: parent.id, from: parent.id, to: child.id, type: 'parent' as const, parentKind: 'biological' as const, status: 'partner' as const, date: unknownDate(), place: '', notes: '' }));
    const out = archiveToGedcom(archive);
    expect(out).toContain('1 _NOPARTNER Y');
    const imported = archiveFromGedcom(bytes(out)).archive;
    expect(imported.relationships.filter(r => r.type === 'parent')).toHaveLength(2);
    expect(imported.relationships.some(r => r.type === 'partner')).toBe(false);
  });

  it('preserves mixed biological and adoptive parent kinds without duplicate parent rows', () => {
    const archive = blank(); const a = newPerson('Bio'), b = newPerson('Adoptive'), child = newPerson('Child');
    archive.people = [a, b, child]; archive.rootPersonId = child.id;
    archive.relationships = [
      { id: 'r1', from: a.id, to: child.id, type: 'parent', parentKind: 'biological', status: 'partner', date: unknownDate(), place: '', notes: '' },
      { id: 'r2', from: b.id, to: child.id, type: 'parent', parentKind: 'adoptive', status: 'partner', date: unknownDate(), place: '', notes: '' },
    ];
    const out = archiveToGedcom(archive);
    const imported = archiveFromGedcom(bytes(out)).archive;
    const links = imported.relationships.filter(r => r.type === 'parent').map(r => [imported.people.find(p => p.id === r.from)?.givenName, r.parentKind]);
    expect(links).toEqual(expect.arrayContaining([['Bio', 'biological'], ['Adoptive', 'adoptive']]));
    expect(links).toHaveLength(2);
    expect(imported.relationships.some(r => r.type === 'partner')).toBe(false);
  });

  it('keeps unsupported date text in notes and warns, and rejects invalid input', () => {
    const imported = archiveFromGedcom(bytes('0 HEAD\n0 @I1@ INDI\n1 NAME A /Rao/\n1 BIRT\n2 DATE During the harvest\n0 TRLR\n'));
    expect(imported.archive.people[0].birth).toEqual(unknownDate());
    expect(imported.archive.people[0].notes).toContain('During the harvest');
    expect(imported.warnings.join(' ')).toMatch(/unsupported birth date/i);
    expect(() => archiveFromGedcom(bytes('not a GEDCOM file'))).toThrow(/Unable to parse GEDCOM input/i);
  });

  it('remaps ids and does not discard untagged archive notes', () => {
    const parsed = parseGedcom(bytes('0 HEAD\n0 NOTE Shared archive story\n0 @I1@ INDI\n1 NAME A /Rao/\n0 TRLR\n'));
    expect(parsed.archiveNotes).toEqual(['Shared archive story']);
    const imported = archiveFromGedcom(bytes('0 HEAD\n0 NOTE Shared archive story\n0 @I1@ INDI\n1 NAME A /Rao/\n1 _ORIGID same\n0 TRLR\n'));
    expect(imported.archive.people[0].id).not.toBe('same');
    expect(imported.archive.memories[0].content).toBe('Shared archive story');
  });
});
