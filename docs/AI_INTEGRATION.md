# AI species identification

One FastAPI service in `services/ai/`, called by the web and field apps through the platform
(never directly with API keys in the browser).

## Endpoint

`POST /identify` (multipart)

| Field | Type | Notes |
| --- | --- | --- |
| `organisation_id` | uuid | Used to load the species list |
| `kind` | `plant` \| `animal` \| `camera_trap` \| `audio` | Picks the engine chain |
| `files` | 1 to 5 images, or 1 audio file | Plants: organ hint per image (leaf, flower, fruit, bark, habit) |
| `lat`, `lon`, `observed_at` | numbers, ISO time | For geo and season filters |
| `location_id` | uuid, optional | For the collection check |

Response:

```json
{
  "engine_chain": ["plantnet", "bioclip2"],
  "suggestions": [
    {"rank": 1, "scientific_name": "Prosopis cineraria", "score": 0.82,
     "engine": "plantnet", "taxon_id": "...", "inhouse_code": "TRR-0123",
     "in_collection": true, "iucn_category": "LC", "sensitive": false}
  ],
  "warnings": ["low_confidence"]
}
```

Rules: return top 5; mark `low_confidence` if top score < 0.35; never write to the database
directly. The platform stores results in `ai_suggestion`.

## Engine chains

| kind | Chain | Notes |
| --- | --- | --- |
| plant | Pl@ntNet API, then BioCLIP 2 zero-shot over the organisation's taxon list | Merge by name, keep best score per taxon, boost taxa in the current location by +0.1 (configurable) |
| animal | BioCLIP 2 over a UAE fauna checklist (`data/checklists/uae_fauna.csv`) | iNaturalist adapter only if a partner agreement exists |
| camera_trap | MegaDetector (MIT or Apache variant) then SpeciesNet with `country=ARE` | Blank images dropped; batch job, not synchronous |
| audio | BirdNET with lat, lon and week filter | Non-commercial model licence, fine for pilot |

## Engines

**Pl@ntNet**: `https://my-api.plantnet.org/v2/identify/all?api-key=...` with `images` and
`organs`. Free plan 500 identifications/day. Key in `PLANTNET_API_KEY`. Cache by image hash.

**BioCLIP 2**: `open_clip.create_model_and_transforms('hf-hub:imageomics/bioclip-2')`.
Precompute text embeddings for the organisation's taxa (prompt: `"a photo of <scientific name>"`)
at start-up and on taxon change; cosine similarity with the image embedding; softmax over the list.
CPU works for the pilot (a few seconds per image); GPU optional.

**SpeciesNet**: `pip install speciesnet`; run
`python -m speciesnet.scripts.run_model --folders <dir> --predictions_json out.json --country ARE`.

**BirdNET**: `pip install birdnet_analyzer`; analyse with lat, lon, week.

## Collection check

For plant suggestions, look up `asset` rows with that taxon inside `location_id` (or within 25 m
of the point). `in_collection = true/false`. A confident suggestion that is not in the collection
is a useful flag for the curator: either a misidentification or an unrecorded plant.

## As built (task 3.3)

- `POST /identify` needs the caller's Supabase token (`Authorization: Bearer ...`). The service reads the
  organisation's taxa (`org_taxon` with `taxon`) and runs the collection check with that token, so row
  level security applies; a caller outside `organisation_id` gets 403, no token 401. It never writes.
- Form fields as above; `organs` is repeated once per image. `kind` plant and animal work now
  (animal uses BioCLIP 2 over the organisation's Animalia taxa until the UAE fauna checklist exists);
  `camera_trap` and `audio` answer 501 until tasks 3.8 and later.
- Plant chain: Pl@ntNet (only when `PLANTNET_API_KEY` is set, cached by image hash), then BioCLIP 2
  over the organisation's Plantae list. Names are matched on genus and epithet (plus the infraspecific
  name after a rank marker); best score per taxon; scores below 0.01 dropped; +0.1 (`AI_LOCATION_BOOST`)
  for taxa in the collection; top 5 (`AI_TOP_N`). Suggestions carry `taxon_id`, `inhouse_code`,
  `iucn_category`, `sensitive` and `common_name`; a name outside our taxa has `taxon_id` null.
- Collection check: SQL function `ai_collection_check(org, taxa[], location, lon, lat, radius_m)`,
  security invoker; a living asset (not planned, dead, removed or disposed) of the taxon in the location
  or within 25 m (`AI_COLLECTION_RADIUS_M`, distance in EPSG:3997). `in_collection` is null when no
  place was given.
- Warnings: `low_confidence` (top score below 0.35), `no_result`, `plantnet_not_configured`,
  `plantnet_unavailable`, `bioclip2_not_configured`, `bioclip2_unavailable`, `species_list_empty`.
  A failing engine never fails the request.
- BioCLIP 2 loads in the background at start-up (about 30 s on CPU); text embeddings are cached per
  species list. After that a photo takes under a second on a laptop CPU.
- Docker image: torch from the CPU index, weights downloaded at build time.

## Evaluation (pilot)

Build a test set of 200 curator-verified Terra photos (`data/eval/`). Report top-1 and top-5
accuracy per engine and for the merged chain. Use the result to set the confidence threshold.

## Later

Fine-tune BioCLIP 2 (or a linear probe) on curator-verified Terra and Expo Valley photos.
Negotiate iNaturalist access if fauna accuracy is too low.

## Licences

| Component | Licence | Pilot | Paid service |
| --- | --- | --- | --- |
| Pl@ntNet API | Terms of service | Free plan | Pro plan above 200k/year |
| BioCLIP 2 | MIT | Yes | Yes |
| SpeciesNet | Apache-2.0 | Yes | Yes |
| MegaDetector | Per variant: MIT, Apache-2.0 or AGPL-3.0 | Use MIT/Apache variant | Same |
| BirdNET models | CC BY-NC-SA 4.0 | Yes (research/education) | Needs licence |
| iNaturalist CV | Partner agreement, fee-based | Optional | Agreement |
