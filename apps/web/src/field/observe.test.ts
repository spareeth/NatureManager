import { describe, expect, it, vi } from 'vitest';
import { fieldsFor, identifyKind, identifySpecies, observationProblems } from './observe';

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { access_token: 'TOKEN' } } }) },
  },
}));
vi.mock('./image', () => ({ compressImage: async (b: Blob) => b }));

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

describe('identify', () => {
  it('plant types use the plant chain, animals the animal chain, others none', () => {
    expect(identifyKind('flora')).toBe('plant');
    expect(identifyKind('pest_disease')).toBe('plant');
    expect(identifyKind('fauna')).toBe('animal');
    expect(identifyKind('water_quality')).toBeNull();
    expect(identifyKind('note')).toBeNull();
  });
  it('posts the photos with the user token and the place', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ engine_chain: [], suggestions: [], warnings: [] })),
    );
    vi.stubGlobal('fetch', fetchMock);
    await identifySpecies({
      orgId: 'o1',
      kind: 'plant',
      photos: [new Blob(['x'], { type: 'image/jpeg' })],
      lat: 25,
      lon: 55,
      locationId: null,
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/identify$/);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer TOKEN');
    const form = init.body as FormData;
    expect([
      form.get('organisation_id'),
      form.get('kind'),
      form.get('lat'),
      form.get('lon'),
    ]).toEqual(['o1', 'plant', '25', '55']);
    expect(form.getAll('files')).toHaveLength(1);
    vi.unstubAllGlobals();
  });
});
