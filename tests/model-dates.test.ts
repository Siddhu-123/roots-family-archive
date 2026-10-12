import { describe, expect, it } from 'vitest';
import { newPerson, personSchema, yearDate, type FamilyDate } from '../src/model';

const exactDate = (value: string): FamilyDate => ({ kind: 'date', value, end: '', approximate: false });

describe('birth and death order', () => {
  it('rejects death before birth within the same year', () => {
    const result = personSchema.safeParse({ ...newPerson('Example'), livingStatus: 'deceased',
      birth: exactDate('2020-12-31'), death: exactDate('2020-01-01') });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues).toContainEqual(expect.objectContaining({
      path: ['death', 'value'], message: 'Death cannot be before birth.',
    }));
  });

  it('allows death on or after the birth date', () => {
    for (const death of ['2020-01-01', '2020-12-31']) {
      expect(personSchema.safeParse({ ...newPerson('Example'), livingStatus: 'deceased',
        birth: exactDate('2020-01-01'), death: exactDate(death) }).success).toBe(true);
    }
  });

  it('preserves overlapping uncertain dates', () => {
    for (const birth of [yearDate(2020), { ...exactDate('2020-12-31'), approximate: true }]) {
      expect(personSchema.safeParse({ ...newPerson('Example'), livingStatus: 'deceased',
        birth, death: exactDate('2020-01-01') }).success).toBe(true);
    }
  });
});
