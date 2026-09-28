# Hortis migration (Terra Garden)

Goal: move all Terra Garden flora records from Hortis into this platform once, keep a short
parallel run, then freeze Hortis read-only. After cut-over this platform is the master.

Source: Hortis export of 27 April 2026, in OneDrive `ECD_documents/Work/Terra_research/TerraGardens/`.
Profile: `data/hortis/PROFILE_2026-04-27.md`. Copy the raw files to `data/hortis/raw/2026-04-27/`
(git-ignored). Never edit raw files.

| File | Rows | Key |
| --- | --- | --- |
| `expo-city-dubai-site-taxa_2026-04-27T11_30_10.885Z.csv` | 77 | Scientific name + Authorship |
| `expo-city-dubai-accessions_2026-04-27T11_28_45.756Z.csv` | 77 | Accession Number (2026-0008 to 2026-0086) |
| `expo-city-dubai-plant-materials_2026-04-27T11_29_47.236Z.csv` | 666 | Accession number + Qualifier (unique for all 666) |

Geometry in the repo: `data/gis/TG_boundary.geojson` and `data/gis/TG_beds_new.geojson` (CRS84,
48 bed names match Hortis exactly). Other geometry in the OneDrive folder:
`Landscape_beds_Terra.kml`, `pocketforest_bdry.*`, CAD drawing, `CAD_basemap.tif`,
Hortis template base map with a GCP file.

## 1. Order of work

1. `scripts/import_locations.py`: load `TG_boundary` as site TG and `TG_beds_new` as 48 beds;
   confirm the bed code field matches the 48 Hortis location names (EG-01..EG-12, NG-01..NG-15,
   SG-01..SG-11, WG-01..WG-10). Create zones EG, NG, SG, WG by dissolving beds on prefix.
2. `scripts/hortis/stage.py`: load the three CSV files as text into `staging_hortis.*`
   (UTF-8 with BOM; dates are `yyyy/m/d`).
3. `scripts/hortis/transform.py`: build taxa, org_taxon, accessions, assets per the mapping below.
4. `scripts/hortis/validate.py`: apply rules; write `staging_hortis.rejects` and `flags`.
5. Curator reviews flags (bed mismatches, duplicate tags, names) in a CSV and returns decisions.
6. `scripts/hortis/promote.py --org terra [--dry-run]`: upsert on legacy key; compute site-grid
   x, y; draft replacement item requests for dead plants.
7. `scripts/hortis/reconcile.py`: reconciliation report.

## 2. Mapping

### Site taxa and accessions to `taxon` and `org_taxon`

| Hortis column | Target | Rule |
| --- | --- | --- |
| Scientific name | `taxon.scientific_name` | Trim; keep the hybrid sign `×` (e.g. `Citrus × limon`) |
| Authorship | `taxon.authorship` | Direct |
| Family | `taxon.family` | Direct |
| Common name | `taxon.common_names.en` | Trim trailing spaces (several have them, e.g. "Ghaf", "Date palm ") |
| Life forms | `org_taxon.attributes.life_forms` | Split on `\|` |
| Climate | `org_taxon.attributes.climate` | Direct |
| IUCN red list status | `org_taxon.iucn_category` | Not Evaluated to NE, Least Concern to LC, Near Threatened to NT, Data Deficient to DD, Endangered to EN, blank to null |
| Native distribution | `org_taxon.attributes.native_distribution` | Direct (WCVP/POWO text) |
| Public description | `org_taxon.attributes.public_description` | Direct |
| Notes | `org_taxon.notes` | e.g. safety note on *Euphorbia tirucalli* latex |
| Tags | `org_taxon.attributes.hortis_tags` | Direct |
| (derived) species code | `org_taxon.inhouse_code` | From plant tag suffix, see below |
| (derived) zones present | `org_taxon.zones_present` | Distinct bed prefixes where the taxon occurs |
| Accession Number, Accession Date, Provenance Code/Name, Material Received | `accession.*` | Direct; provenance all `G` (garden) |
| Identification fields | `accession.attributes.identification` | Mostly empty in this export |

### Plant materials to `asset`

| Hortis column | Target | Rule |
| --- | --- | --- |
| Accession number + Qualifier | `asset.legacy_hortis_id` | `2026-0086.A`; legacy key for upsert |
| Tag number | `asset.tag_code` | Present on 396 rows. Rows without a tag get `<ZONE><BED>-G<NN>_<CODE>` or `_<GENUS3>` |
| Location name | `asset.location_id` | Match `location.code` |
| Latitude, Longitude | `asset.geom` (Point) | 396 rows; `position_source = 'hortis'`. Rows without coordinates: point at bed centroid, `position_source = 'bed_centroid'`, asset type GROUP |
| Status | `asset.status` | Present to active |
| Condition | `asset.condition` | Good 4, Fair 3, Poor 2; **Dead sets status `dead`** (9 rows) and drafts a replacement item request |
| Last observed | `asset.attributes.last_observed` | 24 rows |
| First present | `asset.install_date` | Parse `yyyy/m/d` |
| Life forms contains Tree and has tag | asset type TREE; else PLANT or GROUP | |

### In-house species code

Tag pattern: `<ZONE><BED>-T<NN>_<CODE>`, e.g. `WG07-T04_PRO`. 25 codes in the export, each mapping
to exactly one taxon:

ACA *Acacia arabica*, ACS *A. senegal*, ADA *Adansonia digitata*, BIS *Bismarckia nobilis*,
BOS *Boswellia sacra*, CIT *Citrus × aurantiifolia*, DEL *Delonix regia*, HIB *Hibiscus tiliaceus*,
MAN *Manilkara zapota*, MEL *Melaleuca viminalis*, MON *Morus nigra*, MOR *Moringa oleifera*,
OLE *Olea europaea*, PAR *Parkinsonia aculeata*, PHO *Phoenix dactylifera*, PHR *Phragmites australis*,
PRO *Prosopis cineraria*, TAI *Tamarindus indica*, TAM *Tamarix aphylla*, TEC *Tecomella undulata*,
TER *Terminalia catappa*, TES *Tecoma stans*, VAF *Acacia farnesiana*, VAN *Acacia nilotica*,
ZIZ *Ziziphus spina-christi*.

The other 52 taxa (herbs, grasses, shrubs without tags) have no code yet. Propose codes with the
same 3-letter rule (curator approves) so every taxon has one before cut-over. Seed file:
`data/hortis/species_codes.csv`.

## 3. Validation rules and known flags

| Rule | Found in this export | Action |
| --- | --- | --- |
| Tag bed prefix equals location | 37 mismatches (e.g. `SG03-T34_MON` in SG-11). Spatial check: 33 of the points lie inside the recorded Location bed, none inside the tag's bed, 4 outside all beds | Location is right, tag prefix is out of date: propose re-tag, curator confirms |
| Tag unique | 2 duplicates: `SG03-T10_PHO`, `EG11-T37_TAM` | Curator picks one; the other gets a new tag |
| Point inside its bed polygon | 95 of 396 outside every bed (median 0.7 m, max 5.9 m); 14 just outside the boundary in WG-03, WG-07, WG-08 (`data/gis/qa_tree_points_outside_beds.csv`) | Keep the point, keep the Hortis bed, set `position_accuracy_m` from the distance; re-survey with RTK or offsets later |
| Taxon name parses | `Ziziphus spina-christi christi` looks malformed | Curator confirms the accepted name |
| IUCN status present | 3 taxa blank (2 *Citrus* hybrids, *Ziziphus*) | Leave null; hybrids are not assessed |
| Level of protection | Not in the export | Needs a source before cut-over |

## 4. Reconciliation report

`data/hortis/reconciliation_<date>.md` and `.csv`:

| Entity | In export | Loaded | Updated | Rejected | Flagged |
| --- | --- | --- | --- | --- | --- |
| Taxa | 77 | | | | |
| Accessions | 77 | | | | |
| Plant records | 666 | | | | |
| Tagged trees with points | 396 | | | | |

Plus per zone: records before vs after (EG 156, NG 142, SG 173, WG 195); IUCN-listed counts
before vs after (EN: 6 plants of *Tecomella undulata*; NT: 17 plants of *Boswellia sacra*).
All must match.

## 5. Cut-over checklist

- [ ] Reconciliation reviewed by curator
- [ ] Bed-mismatch and duplicate-tag decisions applied
- [ ] Species codes approved for all 77 taxa
- [ ] Protection level source agreed
- [ ] Photos exported from Hortis (not in the CSV export) or accepted as lost
- [ ] Hortis set read-only, final export archived
