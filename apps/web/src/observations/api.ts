import { supabase } from '../lib/supabase';
import { check } from '../field/api';

// Curator review of observations (FR-OBS-04): verify (with the species), change the species, reject.
// The verification rules (who may verify, verified_by and verified_at) are in the observation trigger.

export type ReviewFilter = 'pending' | 'curator_verified' | 'rejected' | 'all';

export type ReviewSuggestion = {
  id: string;
  rank: number;
  engine: string;
  taxon_name: string;
  taxon_id: string | null;
  score: number;
  in_collection: boolean | null;
};
export type ReviewMedia = {
  id: string;
  bucket: 'photos' | 'audio';
  path: string;
  kind: 'photo' | 'audio';
  caption: string | null;
};
export type ReviewObservation = {
  id: string;
  obs_type: string;
  observed_at: string;
  observer: string;
  verification: string;
  count: number | null;
  life_stage: string | null;
  phenophase: string | null;
  severity: number | null;
  notes: string | null;
  taxon_id: string | null;
  taxon: { scientific_name: string } | null;
  location: { code: string } | null;
  asset: { tag_code: string } | null;
  suggestions: ReviewSuggestion[];
  media: ReviewMedia[];
};

const SELECT = [
  'id, obs_type, observed_at, observer, verification, count, life_stage, phenophase, severity, notes, taxon_id',
  'taxon:taxon (scientific_name)',
  'location:location!observation_location_id_organisation_id_fkey (code)',
  'asset:asset!observation_asset_id_organisation_id_fkey (tag_code)',
  'suggestions:ai_suggestion!ai_suggestion_observation_id_organisation_id_fkey (id, rank, engine, taxon_name, taxon_id, score, in_collection)',
  'media:media!media_observation_id_organisation_id_fkey (id, bucket, path, kind, caption)',
].join(', ');

/** Statuses a filter shows. "To review": not yet verified or rejected by a curator. */
export function statusesFor(f: ReviewFilter): string[] | null {
  if (f === 'pending') return ['ai_suggested', 'observer_confirmed'];
  if (f === 'all') return null;
  return [f];
}

export async function fetchReview(siteId: string, f: ReviewFilter) {
  let q = supabase.from('observation').select(SELECT).eq('site_id', siteId);
  const st = statusesFor(f);
  if (st) q = q.in('verification', st);
  const rows = check<ReviewObservation[]>(
    await q.order('observed_at', { ascending: f !== 'pending' }).limit(100),
  );
  for (const r of rows) r.suggestions = [...(r.suggestions ?? [])].sort((a, b) => a.rank - b.rank);
  return rows;
}

/** Verify, optionally setting the species in the same step. */
export async function verifyObservation(id: string, taxonId?: string | null) {
  const patch: Record<string, unknown> = { verification: 'curator_verified' };
  if (taxonId !== undefined) patch.taxon_id = taxonId;
  check(
    await supabase
      .from('observation')
      .update(patch as never)
      .eq('id', id)
      .select('id')
      .single(),
  );
}

export async function rejectObservation(id: string) {
  check(
    await supabase
      .from('observation')
      .update({ verification: 'rejected' })
      .eq('id', id)
      .select('id')
      .single(),
  );
}

/** Types whose observation names a species (verifying them needs one). */
export const needsSpecies = (obsType: string) =>
  ['flora', 'fauna', 'phenology', 'pest_disease'].includes(obsType);
