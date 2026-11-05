# Workflows: Terra Garden platform (pilot)

How work flows through the platform at the end of Phase 2 (November 2026). It describes what each role
does, on which screen, and what the platform does in the background. Requirement IDs refer to
`docs/SRS.md`; table and function names to `docs/DATA_MODEL.md`.

Pilot site: Terra Garden, Expo City Dubai (zones East, North, South and West Garden; 48 beds). Expo Valley
appears in the project picker as "coming soon" and is not set up yet.

## 1. Roles and where they work

| Role | Main screens | Typical device |
| --- | --- | --- |
| Manager | Work orders, Planning, Item requests (with Hand-off), Base maps, Members | Desktop |
| Field manager | Work, Planning (read and generate), Field app (Verify work) | Phone and desktop |
| Green team, field engineer | Field app (My day, Scan, Requests), Map | Phone |
| Curator | Assets, Taxa, Map | Desktop |
| Owner | Read-only views of every page | Desktop |

Everyone can see the map, assets, taxa, work orders and item requests of their organisation. Every
member can report a problem and raise an item request. Data from another organisation is never visible.

**Signing in.** Enter your work email on the sign-in page and open the link that arrives by email. Each
link works once, and only the newest link is valid; an old or used link shows a message asking for a new
one. The header is one line: the title Nature OS, the tabs Map, Field app and Work orders, and a More menu
with the other pages. On a computer the project picker, the user and role, language (English or Arabic)
and sign out sit at the end of the line; on a phone they are under More. The Terra and Expo City Dubai
logos sit at the bottom right.

## 2. Work order lifecycle

Every job, preventive or reactive, is a work order with a number such as `WO-2026-000014`. Its status
changes only through the platform's transition rules, and every change is recorded in its history with
who did it and when.

| From | To | Who |
| --- | --- | --- |
| Requested | Approved or Cancelled | Manager, field manager |
| Approved | Scheduled | Manager, field manager (needs a person or team) |
| Scheduled | In progress | Assignee or a member of the assigned team, field manager |
| In progress | On hold (reason asked) or Completed | Assignee or team, field manager |
| On hold | In progress | Assignee or team, field manager |
| Completed | Verified | Manager, field manager, never the person or team who did the job |
| Completed | In progress (verification failed, reason required) | Manager, field manager |
| Verified | Closed | Manager, field manager, or automatically after 24 hours |

A job cannot be completed while a required SOP step is unanswered (a required photo step needs a photo).

## 3. Preventive maintenance (planned work)

1. **SOP.** A manager writes a standard operating procedure in Planning: title, safety equipment, hazards
   and steps in English and Arabic. Steps can be a tick, a number with a unit, text, a choice or a photo,
   and each can be required. The manager approves the draft; approved versions are read-only, and changes
   go into a new version. Jobs keep the version they were created with.
2. **Template.** A template links a job title to an SOP, a team and an estimated time (for example "Bed
   care", SOP-BED, Green Team East, 60 minutes).
3. **Schedule.** A schedule says where and how often: a bed, an asset or every bed of a zone, daily, on
   weekdays (for example Monday, Wednesday and Friday) or monthly, with a planning horizon.
4. **Generation.** Every night at 00:30 Dubai time the platform creates the jobs for the horizon, spread
   evenly over the days (15 beds over a week is 3 a day; a week started mid-way is spread over the days
   left). A field manager or manager can also press Generate now. Running it again never duplicates a job.
5. The jobs appear as Scheduled on the team's My day and on the Work calendar.

## 4. Reporting a problem or proposing an improvement

Anyone can raise a request, from several places:

- **Map:** tap "Report a problem here", then tap the spot. The request gets that position and the bed it
  falls in automatically.
- **Asset:** an asset's map popup, its page, or a scan of its tag offers "Report a problem"; the request is
  linked to the asset.
- **Work page and Work > Map:** "Report a problem" asks for the bed or zone; on Work > Map, clicking the map
  reports at that spot.

The form asks:

- the kind: **Fix a problem** (reactive work) or **Improvement or modification** (a proposed project);
- what is wrong, or what should change, and details;
- urgency (P1 urgent to P4 low);
- optionally up to **3 photos** and one **voice note** of up to 2 minutes.

Parts, materials and plants to buy are not work requests: the form points to item requests (section 9).

**Priority.** The reporter chooses the urgency on the form; preventive jobs take their template's default
priority (P3 unless a manager sets another). Priority orders the open requests and sets the response time,
counted from when the request was raised until work starts (In progress). Past it, a request that has not
started shows "SLA breached" in the inbox and on the board. The times are organisation settings; the
defaults are:

| Priority | Meaning | Work should start within |
| --- | --- | --- |
| P1 | Urgent: safety, major damage | 4 hours |
| P2 | High | 24 hours |
| P3 | Normal (default) | 3 days |
| P4 | Low | 14 days |

A manager or field manager can change the priority on the work order page (Change priority) until the
job is closed or cancelled; a reason is required, and the change is kept in the job's history (for example
"Priority P3 to P1: blocking the main path"). Nobody else can change it.

**The role of SOPs.** An SOP sets how a job is done and how it is proven: one method for every team, the
safety equipment and hazards shown first, answers recorded at each step (tick, measurement, choice or
photo), and a completion gate (required steps must be answered). The verifier checks the work against the
SOP's answers. Each approved version is fixed, and a job keeps the version it was issued with.

The request starts as **Requested**. It shows in the manager's Work inbox, on the maps (Open work layer),
and in the field app under Requests, Open. The person who raised it follows it under Requests, Mine,
including the reason if it is cancelled.

## 5. Planning and dispatch (manager, field manager)

1. **Inbox** (Work, Inbox): new requests, with SLA and overdue badges. Open one to read it, see its photos
   and play its voice note.
2. **Schedule**: choose a person or team, a day and time and an estimate. The request moves to Approved and
   then Scheduled.
3. **Board and calendar**: drag a job to another status (the transition rules still apply) or another day;
   move a whole day, for example for weather.
4. **Map**: open work by status. Filter any view by garden (East, North, South, West) and by bed.

## 6. Doing the work (field app)

1. **My day** lists today's jobs of the user and their team, plus unfinished jobs from earlier days,
   sorted by bed, with a map. The Requests button shows the open requests count.
2. **Start job**, then work through the **SOP**: tick, enter numbers or text, choose, and take the photos
   the steps ask for. Safety equipment and hazards are shown first.
3. **Photos**: extra photos of the work, compressed on the phone to 1600 px.
4. **Items needed**: parts, materials or plants for this job, from the catalogue or typed; they become one
   item request linked to the job, submitted for approval (section 8).
5. **Work record**: notes, minutes worked and materials used.
6. **Complete job**: allowed once every required step is answered; the screen lists what is missing.
   **Put on hold** asks for a reason.

**Scan**: the Scan button reads a QR label or barcode (or a typed tag). It opens the asset with its open
jobs, starts a scheduled job of the user directly, or raises a request for that asset.

**Observe** (next to Scan on My day) records a sighting in three taps: Observe, a type (plant, animal,
phenology, pest or disease, plant health, water quality, note), Save. The GPS point and its accuracy are
taken as the screen opens; without GPS the bed or zone is chosen from a list. Optional: up to 3 photos, a
sound recording (animals, notes), count, life stage, the phenology stage (required for phenology) and a
severity from 1 to 5 (pests, plant health). From a scanned asset, Record an observation links it to that
tree. The observer's recent observations are listed with their verification status.

**Species suggestions.** For plants, animals, phenology, pests and plant health, once a photo is taken
the observer can press Identify species (needs network). The platform suggests up to 5 species from
Terra's own list, with the in-house code, the score and "In this bed" when that species grows there.
The observer picks one (saved as confirmed by the observer) or Unknown. Without network the observation
is saved without suggestions and a curator identifies it.

**Work order from an observation.** For pests, plant health, plants, water and notes the form offers
Also create a work order; it works offline and is sent after the observation. A saved observation can
raise one later with Create work order (in My recent observations, and on the Observations page). The
work order is a reactive request in the Work orders inbox with the observation's place, point, tree,
photos and notes; its priority follows the severity (5 is P1, 4 is P2, 3 is P3, 1 or 2 is P4, none is
P3). Pressing it again opens the same work order while it is open; a rejected observation raises none.

**Curator review** (More, Observations; curators and managers): observations to review, newest first,
with photos, sound, notes and the AI suggestions. Verify keeps the species (or takes a suggestion with
Verify as), Change species searches the taxa, Reject removes it from the records. Plants and animals
need a species before they can be verified. Who verified and when is recorded.

## 7. Offline (flight mode)

The field app keeps the day's work on the phone: today's and tomorrow's jobs with their SOPs, the assets of
those zones, the item catalogue, the requests lists and the map tiles that may be stored (OpenStreetMap
and our own imagery; Google and Esri imagery are online only).

Without network every action still works: start, SOP answers, photos, voice notes, items, record,
complete, hold, verify and new requests. Each change waits in an outbox and shows at once. The bar at the
top shows Online or Offline and how many changes are waiting. When the network returns the changes are
sent in order; a replay never duplicates anything. A change the server refuses (for example the job was
reassigned meanwhile) is listed with the reason and Retry or Discard.

Signing out clears the phone's copy, after a warning if changes have not been sent.

## 8. Verification and closing

1. Completed jobs appear for the field manager in Field app, **Verify work**, oldest first, with who did
   them. The person or team who did a job cannot verify it.
2. The field manager reviews the SOP answers, photos, notes and materials, ticks the checklist (work done
   as the SOP says; photos show the finished work; site left clean and safe) and presses **Pass**. Or
   presses **Fail** and writes what needs fixing: the job returns to In progress and the team sees "Sent
   back by" with the reason on the job.
3. A manager or field manager closes verified work, or it closes automatically after 24 hours.

## 9. Item requests and the procurement hand-off

Item requests record what must be maintained, replaced or bought; purchasing itself happens in the
receiving system. Numbers look like `IR-2026-000042`.

**Sources**

- a job on the phone (Items needed);
- a person on the Item requests page (New request);
- automatic drafts: a plant recorded dead or removed, an asset whose condition drops to 1 or 2, or a built
  asset out of service gets a replacement draft for the same species and bed (one open draft per asset).

**Lifecycle**

| From | To | Who |
| --- | --- | --- |
| Draft | Submitted or Cancelled | Requester, manager, field manager |
| Submitted | Approved | Manager; field manager up to the approval limit (default 0 AED); never the requester |
| Submitted | Rejected (reason required) or Cancelled | Manager, field manager (cancel also the requester) |
| Approved | Sent | The hand-off only (export or pull API) |
| Sent | Acknowledged or Rejected by receiver (reason required) | Receiving system, or manager |
| Acknowledged | Fulfilled | Receiving system, manager, field manager |

Lines (item or free text, reason maintain, replace or procure new, quantity, unit, optional cost, linked
asset) can change only while the request is a draft. The **catalogue** (Item requests, Item catalogue) holds the
items with their receiving-system codes; plant items are generated from the taxa.

**Hand-off** (Item requests, Hand-off, managers): approved, unsent lines are exported as one batch in CSV or
XLSX and marked Sent. Earlier batches can be downloaded again. A receiving system can instead pull approved
requests with its own API key and acknowledge them with its reference. Approval writes the hand-off record
in the same step, so nothing is lost or sent twice.

## 10. Map, assets and base maps

- **Map**: beds and zones, the assets coloured by status, control points and the Open work layer. Managers
  and curators add assets by tapping, drawing a planting group or by offset from a control point.
- **Assets**: the register with tags and QR labels; each asset page shows its history and open work.
  Every asset has a permanent QR code (for example `TG-7K3QF9`), created with the asset and never changed.
  Managers see it on the asset page with a PNG download; Print label puts it on the label fixed to the
  tree. Scanning it, or typing the code into Scan, opens the asset even if its tag code was corrected.
- **Base maps** (managers): the list of base layers for the site, its default, and which may be stored on
  phones. Google satellite needs its key and is online only; Esri World Imagery needs an ArcGIS key; our own
  orthophoto can be added as a tile layer and stored offline.
- **Project picker**: Terra Garden today; Expo Valley appears as coming soon.

## 11. Background jobs

| When | What |
| --- | --- |
| Nightly 00:30 Dubai time | Generate preventive jobs for each schedule's horizon |
| Hourly | Close work verified more than 24 hours ago |
| On a change of an asset's status or condition | Draft a replacement item request |
| On approval of an item request | Write the hand-off record |
| When the phone is back online, after each change, and every 30 seconds | Send the field app's outbox |
