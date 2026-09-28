# 14-day work order simulation and demo script

Purpose: show every role and workflow with realistic volume, without waiting two weeks.

`python scripts/simulation/run.py --org terra --start 2026-11-01 --days 14 [--seed 42]`

The script:

1. Creates PM schedules below (if missing) and runs `pm_generate` for the 14 days.
2. Advances a simulated clock day by day (`settings.sim_now`), and for each day:
   - moves each assignee's jobs through `wo_transition` with realistic timings (start 07:00, 20 to 90 min per job, lunch break),
   - completes SOP steps with plausible values and placeholder photos,
   - has field managers verify 90% of completed jobs the same day, fail 1 in 20,
   - writes simulated sensor readings every 15 minutes,
   - runs `alerts_evaluate`,
   - applies the scripted events for that day.
3. Leaves a realistic mix of open, overdue and closed work at the end.

Work week: Monday to Friday plus Saturday morning; configurable in `organisation.settings`.

## PM schedules (proposed seed, Terra Garden)

| Code | Routine | Target | Rule | Team |
| --- | --- | --- | --- | --- |
| PM-IRR-INSP | Irrigation line and valve inspection | each zone (EG, NG, SG, WG) | daily, working days | Irrigation (field engineers) |
| PM-BED-CARE | Weeding, pruning, mulching | each bed (48) | weekly, spread Mon to Fri, max 10 per day | Green teams |
| PM-TREE-HLTH | Tree health and condition check | tagged trees (396) | monthly, a quarter each week | Green teams |
| PM-IRR-FLOW | Irrigation controller and flow log | each controller | Mon and Thu | Field engineers |
| PM-SAFE-INSP | Tree and path safety inspection | site | every 14 days | Field manager |
| PM-SIGN-QR | Signage and QR label check | each zone | every 14 days | Green team |

Each PM-BED-CARE work order carries a consumables line (mulch) so item requests appear in the run.

## Scripted events

| Day | Event | Expected system behaviour |
| --- | --- | --- |
| 2 | Migration drafted 9 replacement requests for the dead plants in the Hortis export | Manager approves; export batch sent to procurement; receiver acknowledges via API |
| 3 | Irrigation pressure (simulated) drops below threshold for 30 min in South Garden | Alert, reactive WO P1; field engineer adds a replacement valve as an item request |
| 5 | Gardener logs a pest observation (scale insects) on a bed | Curator sees it; manager creates treatment WO with SOP "Pest treatment, low-toxicity" |
| 7 | Decline observation on *Tecomella undulata* (IUCN Endangered) | Curator alert; inspection WO for all 6 plants |
| 8 | Soil moisture in a West Garden bed below threshold at midday | Alert, WO "Check irrigation zone" |
| 9 | Field manager fails verification of a bed-care job (mulch missing) | Job returns to In progress with reason, completes next day |
| 10 | A tree is placed by offset from a control point after replanting | Local x, y and lat/lon shown; position source `offset` |
| 11 | Dust storm | Manager bulk moves outdoor jobs for the day to On hold, re-plans to days 12 and 13 |
| 12 | Request raised by scanning a broken sign's QR | Request, approval, scheduled, done |
| 14 | End of fortnight | Owner dashboard: completion rate, PM compliance, overdue, new records, open item requests |

## Demo script (about 20 minutes)

1. **Owner view** (2 min): dashboard for the fortnight, map of Terra Garden by zone.
2. **Manager view** (5 min): site grid and control points, request inbox, approve the day 12 sign request, calendar, drag a job, SOP library, alert rules.
3. **Field app on a phone** (6 min): My day, scan a bed QR, run the SOP, photo, complete; flight mode for one job, then sync.
4. **Observation with AI** (3 min): photograph a plant in Terra Garden, see suggestions with in-house codes and the collection check; curator confirms.
5. **Alerts and items** (3 min): replay the day 8 soil moisture alert to a closed WO; show the item request export and the API acknowledgement.
6. **Service angle** (2 min): switch to a second demo organisation to show isolation and a different asset catalogue.

## Reset

`supabase db reset && python scripts/simulation/run.py ...` rebuilds the demo in minutes.
