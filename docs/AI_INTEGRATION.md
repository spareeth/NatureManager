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
