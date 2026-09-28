# Item requests and procurement hand-off

Scope: record what must be maintained, replaced or procured; approve it; hand it to another
system. **No purchase orders, suppliers, stock or invoices here.** The receiving system (Expo City
Dubai procurement or ERP, not yet confirmed) owns purchasing.

## 1. Sources of requests

| Source | Trigger | Default reason |
| --- | --- | --- |
| Work order | Field user adds items needed (parts, materials) while on the job | `maintain` |
| Inspection / condition | Asset condition set to 1 or 2, or built asset status `out_of_service` | `replace` |
| Plant death | Asset status changed to `dead` or `removed` with reason | `replace` (same taxon, same bed), auto-drafted |
| Manager | New planting, consumables, tools | `procure_new` |
| PM template | Consumables linked to a PM template (e.g. mulch per bed per quarter) | `maintain`, drafted when the PM work order is generated |

The Hortis export already has 9 plants with condition "Dead"; migration creates 9 draft
replacement requests as the first demo batch.

## 2. Item catalogue

`item` table per organisation: code, name, category (`plant`, `irrigation`, `soil_amendment`,
`fertiliser`, `pest_control`, `hardware`, `signage`, `tools`, `ppe`, `other`), unit (each, m, m3,
kg, L, bag), optional `taxon_id` for plants (with size spec: pot size, height), optional
`external_code` (the receiving system's item or material code), active flag.

Plant items can be generated from `org_taxon` (one item per taxon and size), so a replacement
request for a dead *Moringa oleifera* picks the right item automatically.

## 3. Lifecycle

```
draft -> submitted -> approved -> sent -> acknowledged -> fulfilled
                  \-> rejected          \-> rejected_by_receiver
draft/submitted -> cancelled
```

| Transition | Who |
| --- | --- |
| draft to submitted | requester (any field role, manager) |
| submitted to approved / rejected | manager (field manager up to a configurable value) |
| approved to sent | system, when exported, pulled or posted |
| sent to acknowledged / rejected_by_receiver | receiving system via API, or manager manually |
| acknowledged to fulfilled | receiving system, or manager when items arrive; links to the work order that installs them |

Every transition writes `item_request_event` (same pattern as work orders).

## 4. Hand-off channels

All channels read from one **outbox**: `integration_outbox` rows are written in the same
transaction as the `approved` transition (transactional outbox pattern), so nothing is lost or sent twice.

| Channel | Pilot | Detail |
| --- | --- | --- |
| Export | Yes | CSV and XLSX of approved, unsent lines, grouped by category; download or scheduled email to a procurement mailbox. Marks lines `sent` with batch id |
| Pull API | Yes | `GET /api/v1/item-requests?status=approved&since=...` (API key per receiver, read-only); `POST /api/v1/item-requests/{id}/ack` with `external_ref` and status |
| Webhook | Later | POST JSON per approved request to a configured URL, HMAC-signed, retries with backoff |
| ERP connector | Later | Mapping to the confirmed ERP once known |

### Export / API line format (v1)

| Field | Example |
| --- | --- |
| request_number | IR-2026-000042 |
| line_no | 1 |
| organisation | terra |
| site_code | TG |
| location_code | SG-11 |
| reason | replace |
| item_code / external_code | PLT-MORO-15L / (blank) |
| description | Moringa oleifera, 15 L pot, replacement for SG03-T27_MOR |
| quantity, unit | 1, each |
| needed_by | 2026-11-15 |
| est_unit_cost_aed | optional |
| linked_asset_tag | SG03-T27_MOR |
| linked_work_order | WO-2026-000311 |
| requested_by, approved_by, approved_at | names and ISO time |

## 5. Reports

- Open requests by status, reason and category.
- Replacement rate: plants replaced per zone per quarter (links to plant mortality).
- Items needed for the next 14 days of PM work (from PM templates).
- Ageing: approved but not acknowledged for more than N days.

## 6. Open questions

- [ ] Which system receives requests at Expo City Dubai, and does it accept CSV/XLSX, an API pull, or both?
- [ ] Approval thresholds by value, and who approves above them?
- [ ] Is there an existing item or material code list to map `external_code` to?
