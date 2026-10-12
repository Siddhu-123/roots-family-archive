import { describe, expect, it } from 'vitest';
import { parseGedcom, writeGedcom, type GedcomPerson, type GedcomRelationship } from '../src/gedcom';

const person = (id: string, givenName: string): GedcomPerson => ({ id, givenName, surname: 'Rao', gender: 'U', birth: 'ABT 1900', death: '', deceased: false, birthPlace: 'Chennai, தமிழ்நாடு', deathPlace: '', gothram: 'Bharadwaja', nativeName: 'தமிழ் பெயர்', knownAs: 'கண்ணன்', maidenName: '', notes: 'First line\nSecond line', occupation: '' });
const parse = (s: string) => parseGedcom(new TextEncoder().encode(s).buffer);

describe('GEDCOM import/export', () => {
  it('roundtrips Unicode, notes, custom names, and approximate date strings', () => {
    const people = [person('a', 'கண்ணன்')];
    const text = writeGedcom({ title: 'குடும்பம்', people, relationships: [] });
    const got = parse(text);
    expect(got.people[0]).toMatchObject({ givenName: 'கண்ணன்', birth: 'ABT 1900', birthPlace: 'Chennai, தமிழ்நாடு', gothram: 'Bharadwaja', nativeName: 'தமிழ் பெயர்', knownAs: 'கண்ணன்', notes: 'First line\nSecond line' });
  });
  it('neutralises slashes in names so the surname delimiter remains valid', () => {
    const p = { ...person('slash', 'A/B'), surname: 'C/D' };
    const text = writeGedcom({ title: 'Tree', people: [p], relationships: [] });
    expect(text.match(/^1 NAME .*$/gm)).toEqual(['1 NAME A B /C D/']);
    expect(parse(text).people[0]).toMatchObject({ givenName: 'A B', surname: 'C D' });
  });
  it('preserves single-parent and partner-only families with valid linked records', () => {
    const people = [person('p', 'Parent'), person('c', 'Child'), person('x', 'Partner')];
    const rels: GedcomRelationship[] = [
      { id: 'r1', from: 'p', to: 'c', type: 'parent', parentKind: 'adopted', status: '', date: '', place: '' },
      { id: 'r2', from: 'p', to: 'x', type: 'partner', parentKind: '', status: '', date: '', place: '' },
    ];
    const out = writeGedcom({ title: 'Tree', people, relationships: rels });
    const got = parse(out);
    expect(got.relationships).toEqual(expect.arrayContaining([expect.objectContaining({ from: 'p', to: 'c', type: 'parent', parentKind: 'adopted' }), expect.objectContaining({ from: 'p', to: 'x', type: 'partner' })]));
    expect(out).toContain('2 PEDI adopted'); expect(out).toMatch(/0 @F\d+@ FAM[\s\S]*?1 HUSB @I\d+@[\s\S]*?1 WIFE @I\d+@/);
  });
  it('retains both parents in a multi-parent family and deduplicates shared family records', () => {
    const people = [person('a', 'A'), person('b', 'B'), person('c', 'C')];
    const relationships: GedcomRelationship[] = ['a', 'b'].map((from, i) => ({ id: `r${i}`, from, to: 'c', type: 'parent', parentKind: '', status: '', date: '', place: '' }));
    const text = writeGedcom({ title: 'Tree', people, relationships });
    expect((text.match(/^0 @F\d+@ FAM$/gm) ?? [])).toHaveLength(1);
    expect(parse(text).relationships.filter(x => x.to === 'c' && x.type === 'parent').map(x => x.from).sort()).toEqual(['a', 'b']);
  });
  it('retains a death event without a date', () => {
    const input = '0 HEAD\n0 @I1@ INDI\n1 NAME A /Rao/\n1 DEAT\n0 TRLR\n';
    const got = parse(input);
    expect(got.people[0]).toMatchObject({ death: '', deceased: true });
    expect(parse(writeGedcom({ title: 'Tree', people: got.people, relationships: [] })).people[0].deceased).toBe(true);
  });
  it('roundtrips marriage date, place, and status without changing the GEDCOM date string', () => {
    const people = [person('p', 'Parent'), person('x', 'Partner')];
    const relationships: GedcomRelationship[] = [{ id: 'm', from: 'p', to: 'x', type: 'partner', parentKind: '', status: 'divorced', date: 'BET 1900 AND 1902', place: 'Chennai, India' }];
    const out = writeGedcom({ title: 'Tree', people, relationships });
    expect(out).toContain('2 DATE BET 1900 AND 1902');
    expect(parse(out).relationships).toContainEqual(expect.objectContaining({ from: 'p', to: 'x', type: 'partner', status: 'divorced', date: 'BET 1900 AND 1902', place: 'Chennai, India' }));
  });
  it('reads parent kind from the child individual FAMC link', () => {
    const input = '0 HEAD\n0 @I1@ INDI\n1 NAME Parent /Rao/\n0 @I2@ INDI\n1 NAME Child /Rao/\n1 FAMC @F1@\n2 PEDI adopted\n0 @F1@ FAM\n1 HUSB @I1@\n1 CHIL @I2@\n0 TRLR\n';
    expect(parse(input).relationships).toContainEqual(expect.objectContaining({ from: 'I1', to: 'I2', type: 'parent', parentKind: 'adopted' }));
  });
  it('retains every parent when a child has more than two', () => {
    const people = ['a', 'b', 'c', 'd'].map(id => person(id, id.toUpperCase()));
    const relationships: GedcomRelationship[] = ['a', 'b', 'c'].map((from, i) => ({ id: `r${i}`, from, to: 'd', type: 'parent', parentKind: `kind-${from}`, status: '', date: '', place: '' }));
    const text = writeGedcom({ title: 'Tree', people, relationships });
    const parents = parse(text).relationships.filter(x => x.to === 'd' && x.type === 'parent');
    expect(parents.map(x => x.from).sort()).toEqual(['a', 'b', 'c']);
    expect(parents.map(x => x.parentKind).sort()).toEqual(['kind-a', 'kind-b', 'kind-c']);
  });
  it('preserves repeated notes, blank lines, and CONC continuation text', () => {
    const input = '0 HEAD\n0 @I1@ INDI\n1 NAME A /Rao/\n1 NOTE first\n2 CONT\n2 CONT third\n2 CONC and-a-half\n1 NOTE second\n0 TRLR\n';
    const expected = 'first\n\nthirdand-a-half\nsecond';
    const got = parse(input).people[0];
    expect(got.notes).toBe(expected);
    expect(parse(writeGedcom({ title: 'Tree', people: [got], relationships: [] })).people[0].notes).toBe(expected);
  });
  it('wraps long notes at the GEDCOM UTF-8 byte limit and restores native-script text', () => {
    const long = 'தமிழ்'.repeat(220);
    const text = writeGedcom({ title: 'Tree', people: [{ ...person('p', 'Parent'), notes: `${long}\n${long}` }], relationships: [] });
    expect(text.split('\n').filter(Boolean).every(line => new TextEncoder().encode(line).length <= 255)).toBe(true);
    expect(parse(text).people[0].notes).toBe(`${long}\n${long}`);
  });
  it('does not mutate people while exporting', () => {
    const p = person('p', 'Parent');
    const before = structuredClone(p);
    writeGedcom({ title: 'Tree', people: [p], relationships: [{ id: 'u', from: 'p', to: 'missing', type: 'other' } as unknown as GedcomRelationship] });
    expect(p).toEqual(before);
  });
  it('reports malformed references and rejects invalid or record-free input actionably', () => {
    const result = parse('0 HEAD\n1 GEDC\n2 VERS 5.5.1\n0 @I1@ INDI\n1 FAMC @F404@\n0 TRLR\n');
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(() => parse('not a GEDCOM file')).toThrow(/Unable to parse GEDCOM input/i);
    expect(() => parse('0 HEAD\n1 SOUR test\n0 TRLR\n')).toThrow(/no individual or family records/i);
  });
});
