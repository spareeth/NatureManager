import { describe, expect, it } from 'vitest';
import {
  buildAttributes,
  coerce,
  fieldLabel,
  validateAttributes,
  type FormSchema,
} from './schemaForm';

const schema: FormSchema = {
  type: 'object',
  properties: {
    height_m: { type: 'number', minimum: 0, title: 'Height (m)', 'x-title-ar': 'الارتفاع (م)' },
    stations: { type: 'integer', minimum: 1 },
    multi_stem: { type: 'boolean' },
    valve_type: { type: 'string', enum: ['solenoid', 'gate'] },
    measures: { type: 'array', items: { type: 'string', enum: ['flow', 'pressure'] } },
    serial: { type: 'string' },
  },
};

describe('schema form', () => {
  it('labels in English and Arabic', () => {
    expect(fieldLabel('height_m', schema.properties!.height_m!, 'en')).toBe('Height (m)');
    expect(fieldLabel('height_m', schema.properties!.height_m!, 'ar')).toBe('الارتفاع (م)');
    expect(fieldLabel('serial', schema.properties!.serial!, 'ar')).toBe('serial');
  });

  it('coerces input text to stored types', () => {
    expect(coerce({ type: 'number' }, '6,5')).toBe(6.5);
    expect(coerce({ type: 'number' }, '')).toBeUndefined();
    expect(coerce({ type: 'number' }, 'tall')).toBe('tall');
    expect(coerce({ type: 'boolean' }, 'true')).toBe(true);
    expect(coerce({ type: 'array' }, [])).toBeUndefined();
    expect(coerce({ type: 'string' }, '  A1  ')).toBe('A1');
  });

  it('validates numbers, ranges, integers and enums', () => {
    const v = buildAttributes(schema, {
      height_m: '-1',
      stations: '2.5',
      valve_type: 'butterfly',
      measures: ['flow', 'ph'],
      serial: 'S1',
    });
    expect(validateAttributes(schema, v).map((e) => `${e.key}:${e.code}`)).toEqual([
      'height_m:min',
      'stations:integer',
      'valve_type:enum',
      'measures:enum',
    ]);
    expect(validateAttributes(schema, buildAttributes(schema, { height_m: 'tall' }))).toEqual([
      { key: 'height_m', code: 'number' },
    ]);
    expect(
      validateAttributes(
        schema,
        buildAttributes(schema, { height_m: '6.5', stations: '4', multi_stem: true }),
      ),
    ).toEqual([]);
  });

  it('keeps attributes the schema does not know, drops cleared fields', () => {
    expect(
      buildAttributes(schema, { height_m: '', serial: 'X' }, { height_m: 5, hortis_note: 'kept' }),
    ).toEqual({
      hortis_note: 'kept',
      serial: 'X',
    });
  });
});
