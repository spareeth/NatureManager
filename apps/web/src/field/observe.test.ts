import { describe, expect, it } from 'vitest';
import { fieldsFor, observationProblems } from './observe';

describe('observation form rules', () => {
  it('asks only for the fields of the type', () => {
    expect(fieldsFor('fauna')).toEqual({
      count: true,
      lifeStage: true,
      phenophase: false,
      severity: false,
      audio: true,
    });
    expect(fieldsFor('phenology').phenophase).toBe(true);
    expect(fieldsFor('pest_disease').severity).toBe(true);
    expect(fieldsFor('water_quality')).toEqual({
      count: false,
      lifeStage: false,
      phenophase: false,
      severity: false,
      audio: false,
    });
  });
  it('needs a place, and a stage for phenology', () => {
    expect(observationProblems({ obsType: 'flora', phenophase: null }, true)).toEqual([]);
    expect(observationProblems({ obsType: 'flora', phenophase: null }, false)).toEqual(['place']);
    expect(observationProblems({ obsType: 'phenology', phenophase: null }, true)).toEqual([
      'phenophase',
    ]);
  });
});
