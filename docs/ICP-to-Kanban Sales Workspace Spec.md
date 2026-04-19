<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

# ICP-to-Kanban Sales Workspace Spec

This product spec defines a B2B sales workspace that starts from ICP-qualified intake, moves accounts through a Kanban-style progression board, supports deep inspection through a side panel and modals, and maintains a first-class audit trail across every critical action.[^1][^2][^3]

## Product overview

The core UX pattern is a three-part workspace: filter rail on the left, Kanban progression board in the center, and a persistent context panel on the right.[^4][^3] This pattern works well for sales workflows because it preserves flow visibility while allowing detailed inspection without full-page navigation.[^5][^3]

The workflow should begin with ICP intake and move through explicit qualification and execution stages rather than generic task columns, because sales boards are most useful when each state reflects a business milestone.[^6][^1] Auditability should be built into the main experience through visible timelines, field-level change logs, and required reason capture for sensitive actions such as owner changes, stage overrides, or lost and parked outcomes.[^7][^2]

## UX principles

The board should optimize for rapid scanning, stage-level bottleneck detection, and low-friction movement between summary and detail.[^5][^3] Cards should remain compact and decision-oriented, while notes, qualification evidence, and historical context move to the side panel and modal layers.[^5][^3]

A persistent context panel should behave like a working surface, not a passive preview, by showing summary, ownership, fit, current blockers, next actions, and recent timeline events for the selected record.[^8][^9] Modals should be reserved for high-density tasks such as full profile review, rule editing, reassignment, and complete history inspection, so the board itself stays fast and uncluttered.[^5][^3]

## Stage model

A recommended progression model is shown below.


| Stage | Purpose | Entry rule | Exit rule | Notes |
| :-- | :-- | :-- | :-- | :-- |
| ICP Intake | New account or lead enters workspace | Basic source and company or lead identity exists [^1] | Assigned for research [^1] | Intake can be imported, manual, or AI-suggested [^1] |
| Researching | Firmographic and persona enrichment | Owner assigned [^1] | Enough evidence to score fit [^1] | AI may prefill fields but changes should be auditable [^2] |
| Qualified | Confirmed ICP match | Minimum qualification fields completed [^1] | Outreach plan created [^1] | Stage should show why the entity qualifies [^1] |
| Outreach Running | Initial contact sequence in motion | Sequence or manual plan active [^1] | Prospect responds or sequence ends [^1] | Aging and touch cadence matter here [^7] |
| Engaged | Two-way interaction started | Meaningful reply or meeting interest [^1] | Meeting or demo scheduled [^1] | Good point to track intent strength [^1] |
| Meeting / Demo | Formal discovery or demo underway | Calendar event or meeting task attached [^1] | Follow-up or proposal created [^1] | Meeting outcomes should be logged [^2] |
| Proposal / Follow-up | Proposal or decision cycle active | Proposal artifact or follow-up plan exists [^1] | Won, lost, or parked [^1] | High-value audit stage for pricing and owner changes [^2] |
| Won | Successful conversion | Close reason and commercial details saved [^1] | N/A | Finalization should be immutable except via admin correction [^2] |
| Lost | Opportunity lost | Mandatory lost reason [^7][^1] | N/A | Reason code and note required [^7] |
| Parked | Deferred but not lost | Mandatory parked reason [^7] | Can be reactivated [^7] | Parked items should remain visible in saved views [^7] |

## Screen-by-screen spec

## Board view

The default screen should show a header with global search, team filter, owner filter, ICP segment, geography, stage aging filter, and saved views.[^10][^3] The center region should render the Kanban board horizontally with clear stage headers, WIP counts, aging indicators, and SLA warnings, because bottlenecks need to be visible before users open individual records.[^1][^3]

### Header

- Global search across accounts, leads, contacts, and notes.
- Saved views such as `Enterprise India`, `Founder-led SaaS`, `Stale > 14 days`, and `Needs manager review`.
- Quick-create actions: new account, import list, AI-suggested ICP list, bulk assign.
- Date context for activity and stage aging.


### Left filter rail

- ICP segment, industry, company size, geography, persona, owner, source, score range, SLA breach, risk, stage age.
- Saved filter presets.
- Optional toggle for `My records`, `Team records`, and `All records`.


### Center board

Each column should display the stage name, total record count, value count if opportunities exist, median aging, and a visual alert when aging or SLA thresholds are breached.[^1][^3] Cards should be draggable where permissions allow, but restricted transitions should require confirmation or a modal with reason capture.[^7][^2]

### Card contents

| Field | Why it belongs on card |
| :-- | :-- |
| Account or lead name | Primary scan anchor [^3] |
| ICP tags | Shows fit category quickly [^1] |
| Owner avatar or initials | Clarifies responsibility [^5] |
| Fit score | Indicates research quality and match strength [^1] |
| Stage age | Exposes stalled records [^7] |
| Last activity timestamp | Helps managers detect inactivity [^7] |
| Next action due | Supports execution, not just reporting [^5] |
| Warning chip | Flags blocker, SLA breach, or missing data [^7] |

### Board interactions

- Click card: selects card and populates right panel.
- Double click or `Open details`: opens full modal.
- Drag to allowed stage: immediate move with audit event.
- Drag to guarded stage: confirmation modal with required reason.
- Bulk select: reassign, move stage, tag, archive, export.


## Right context panel

The right panel should stay persistent and update based on the currently selected card so users can inspect and act without losing board position.[^8][^9] It should hold the most operational information rather than duplicating the full modal.[^8]

### Panel sections

1. **Summary**: account name, lead status, fit score, owner, current stage, priority.
2. **Why this qualifies**: firmographic and persona matches, score contributors, enrichment confidence.
3. **Next actions**: upcoming task, recommended follow-up, due date, quick action buttons.
4. **Recent activity**: latest email, call, note, meeting, enrichment refresh.
5. **Recent audit events**: stage changes, owner changes, score changes, reason notes.[^2]
6. **AI assist block**: explain score, summarize notes, draft outreach, propose next step.[^9]

### Quick actions in panel

- Move stage.
- Assign or reassign owner.
- Add note.
- Create task.
- Schedule meeting.
- Mark blocked.
- Open full details.


## Modal inventory

Modals should be specialized and lightweight enough to preserve user context while still supporting detail-heavy tasks.[^5][^3] Each modal should log open-triggered actions only when an actual state change occurs, not merely on view.[^2]

### Full record modal

This modal acts as the full profile page without route switching. Tabs should include `Overview`, `People`, `Activity`, `Qualification`, `Opportunity`, `Documents`, and `History`.[^5][^3]

### Stage transition modal

Use when a stage change is restricted or needs extra data. The modal should show current stage, target stage, validation errors, required fields, optional note, and mandatory reason where appropriate.[^7][^2]

### Owner reassignment modal

Use for transferring responsibility. Required fields should include new owner, reason, effective date, optional watcher list, and whether open tasks should transfer.[^2]

### Outcome modal

Used for `Won`, `Lost`, or `Parked`. This modal should require a standardized reason code plus a freeform note, because outcome reasons are essential for auditability and later analysis.[^7][^2]

### History modal

The history modal should show the complete timeline with field-level diffs, filters by event type and actor, and a way to jump to related entities or artifacts.[^2]

## Audit trail specification

Audit trail should be a product feature rather than an admin back-office add-on, because users and managers need immediate trust in who changed what and why.[^2] Sensitive actions should require explicit rationale, and those rationales should appear inline in history views.[^2]

### Audit event types

| Event type | Example |
| :-- | :-- |
| Record created | Lead imported from Apollo |
| Field updated | Employee count changed from 140 to 220 |
| Stage changed | Qualified → Outreach Running |
| Owner changed | SDR A → AE B |
| Score changed | Fit score 71 → 84 |
| Tag changed | Added `Founder-led` |
| Note added | Qualification note created |
| Task lifecycle | Task created, completed, overdue |
| Communication logged | Email sent, call logged, meeting completed |
| Outcome recorded | Lost with reason `budget freeze` |
| AI action | AI suggested score or draft, user accepted or rejected |
| Permission event | Admin override on locked stage |

### Audit event fields

Every audit event should include the fields below.


| Field | Type | Description |
| :-- | :-- | :-- |
| id | UUID | Unique event id |
| tenant_id | UUID | Workspace or customer boundary |
| entity_type | enum | `account`, `lead`, `contact`, `task`, `opportunity`, `stage_transition`, `document` |
| entity_id | UUID | Target entity |
| action_type | enum | `create`, `update`, `move_stage`, `assign_owner`, `add_note`, `close_lost`, etc. |
| actor_type | enum | `user`, `system`, `ai_agent`, `integration` |
| actor_id | UUID nullable | User or system identity |
| occurred_at | timestamp | Event time |
| field_changes | JSON array | Old and new values for changed fields |
| reason_code | string nullable | Structured reason where required |
| reason_note | text nullable | Human explanation |
| source | enum | `ui`, `api`, `import`, `workflow`, `ai_assist` |
| request_id | string nullable | Cross-system traceability |
| related_entity_refs | JSON array | Linked entities such as task or meeting ids |

### Field change shape

```json
{
  "field": "stage_id",
  "label": "Stage",
  "old": "qualified",
  "new": "outreach_running",
  "display_old": "Qualified",
  "display_new": "Outreach Running"
}
```


## Core data shapes

The data model should support lead-centric and account-centric workflows, because some sales motions start from a person while others start from a company list.[^1] The recommended model below separates stable business entities from workflow entities and history entities to keep auditability and reporting clean.[^2]

### Main entities

| Entity | Purpose | Key relations |
| :-- | :-- | :-- |
| Tenant | Customer or workspace boundary | Has many users, pipelines, accounts, leads [^2] |
| User | Human actor in workspace | Owns records, performs events [^2] |
| Pipeline | Named workflow configuration | Has many stages [^1] |
| Stage | Ordered workflow state | Belongs to pipeline; has many record placements [^1] |
| Account | Company or target organization | Has many contacts, leads, opportunities, notes, audit events |
| Contact | Person associated with account | Belongs to account; can link to lead or opportunity |
| Lead | Qualified or unqualified working item | Belongs to account optionally; assigned to stage and owner |
| Opportunity | Commercial sales object | Belongs to account; may derive from lead |
| Task | Action item | Belongs to lead, account, contact, or opportunity |
| Activity | Email, call, meeting, note, enrichment event | Belongs polymorphically to record |
| ScoreSnapshot | Stored fit or intent score over time | Belongs to lead or account |
| AuditEvent | Immutable history log | Belongs polymorphically to any entity [^2] |
| Tag | Classification label | Many-to-many with accounts, leads, contacts |
| Document | Proposal, call summary, file, artifact | Belongs to record |

### Lead shape

```json
{
  "id": "uuid",
  "tenant_id": "uuid",
  "account_id": "uuid",
  "primary_contact_id": "uuid",
  "pipeline_id": "uuid",
  "stage_id": "uuid",
  "owner_user_id": "uuid",
  "title": "Acme - CTO outreach",
  "status": "active",
  "priority": "high",
  "fit_score": 84,
  "intent_score": 62,
  "stage_entered_at": "2026-04-19T06:00:00Z",
  "last_activity_at": "2026-04-18T15:10:00Z",
  "next_action_at": "2026-04-20T08:00:00Z",
  "source": "apollo_import",
  "source_ref": "apollo-list-77",
  "qualification_summary": "B2B SaaS, 120 employees, founder-led, India expansion",
  "risk_state": "stale",
  "sla_state": "breached",
  "created_at": "2026-04-10T08:30:00Z",
  "updated_at": "2026-04-19T06:10:00Z"
}
```


### Account shape

```json
{
  "id": "uuid",
  "tenant_id": "uuid",
  "name": "Acme Technologies",
  "domain": "acme.example",
  "industry": "SaaS",
  "employee_count": 120,
  "hq_country": "IN",
  "hq_city": "Pune",
  "annual_revenue_range": "5M-20M",
  "ownership_type": "founder_led",
  "icp_segment": "Mid-market B2B SaaS India",
  "fit_score_latest": 84,
  "owner_user_id": "uuid",
  "created_at": "2026-04-10T08:00:00Z",
  "updated_at": "2026-04-18T17:00:00Z"
}
```


### Contact shape

```json
{
  "id": "uuid",
  "tenant_id": "uuid",
  "account_id": "uuid",
  "full_name": "Priya Shah",
  "job_title": "Chief Technology Officer",
  "seniority": "CXO",
  "department": "Engineering",
  "email": "priya@acme.example",
  "phone": null,
  "linkedin_url": "https://linkedin.com/in/example",
  "persona_tags": ["technical_buyer", "budget_influencer"],
  "created_at": "2026-04-10T09:00:00Z",
  "updated_at": "2026-04-12T10:00:00Z"
}
```


### Opportunity shape

```json
{
  "id": "uuid",
  "tenant_id": "uuid",
  "account_id": "uuid",
  "lead_id": "uuid",
  "owner_user_id": "uuid",
  "stage": "proposal",
  "currency": "USD",
  "amount": 24000,
  "close_date": "2026-05-15",
  "forecast_category": "best_case",
  "created_at": "2026-04-15T11:00:00Z",
  "updated_at": "2026-04-18T12:30:00Z"
}
```


### Task shape

```json
{
  "id": "uuid",
  "tenant_id": "uuid",
  "owner_user_id": "uuid",
  "subject": "Send tailored CTO intro",
  "task_type": "email_followup",
  "status": "open",
  "priority": "high",
  "due_at": "2026-04-20T08:00:00Z",
  "regarding_entity_type": "lead",
  "regarding_entity_id": "uuid",
  "created_at": "2026-04-19T06:00:00Z",
  "updated_at": "2026-04-19T06:00:00Z"
}
```


## Relations

The model should support both strict foreign keys and polymorphic activity feeds. Core relations are shown below.

```text
Tenant 1---N Users
Tenant 1---N Pipelines
Pipeline 1---N Stages
Tenant 1---N Accounts
Account 1---N Contacts
Account 1---N Leads
Lead N---1 Stage
Lead N---1 User (owner)
Account 1---N Opportunities
Lead 1---0..1 Opportunity
Lead 1---N Tasks
Lead 1---N Activities
Account 1---N Activities
Lead 1---N ScoreSnapshots
Any Entity 1---N AuditEvents
Tag N---N Lead
Tag N---N Account
Tag N---N Contact
```


### Recommended join tables

| Table | Purpose |
| :-- | :-- |
| lead_tags | Many-to-many between leads and tags |
| account_tags | Many-to-many between accounts and tags |
| contact_tags | Many-to-many between contacts and tags |
| entity_watchers | Users following a record for alerts |
| activity_participants | Contacts or users involved in a meeting or call |
| audit_related_entities | Normalized secondary references for audit events |

## Derived fields and projections

Some dashboard fields should be computed rather than manually stored, because boards need performance-friendly summaries while preserving raw events underneath.[^5][^2]


| Derived field | Formula or source |
| :-- | :-- |
| stage_age_days | `now - stage_entered_at` |
| is_stale | `last_activity_at` beyond threshold |
| sla_state | Rule engine based on stage and next action |
| latest_owner_change_at | Last matching `assign_owner` audit event |
| fit_score_latest | Latest score snapshot or account projection |
| board_warning | Derived from SLA breach, missing data, or blocked flag |
| last_meaningful_touch_at | Latest non-system activity |

## Permission model

Role-sensitive actions should be explicit because stage moves, bulk edits, and corrections have operational and audit implications.[^2] A minimal role model is shown below.


| Role | Typical powers |
| :-- | :-- |
| SDR / Researcher | Create, enrich, qualify, add notes, move within early stages |
| AE / Sales owner | Own execution stages, create opportunity, close won or lost within policy |
| Manager | Reassign owners, override guarded transitions, inspect full history |
| Admin | Configure pipeline, reason codes, permission rules, and correction workflows |
| System / AI agent | Suggest or auto-apply allowed changes with source attribution [^2] |

## Recommended APIs

A clean service surface should separate command endpoints from read projections.

### Command examples

- `POST /leads`
- `POST /leads/{id}/move-stage`
- `POST /leads/{id}/assign-owner`
- `POST /leads/{id}/close-lost`
- `POST /leads/{id}/park`
- `POST /tasks`
- `POST /activities`
- `POST /audit/query`


### Read examples

- `GET /board?pipeline_id=...&filters=...`
- `GET /leads/{id}/panel`
- `GET /leads/{id}/history`
- `GET /accounts/{id}/summary`
- `GET /dashboard/exceptions`
- `GET /reports/stage-aging`


## UI state model

For frontend implementation, the client should separate board state, selected entity state, modal state, and history filters. This reduces coupling between drag-and-drop interactions and detail rendering.

```json
{
  "boardFilters": {
    "ownerIds": ["uuid"],
    "icpSegments": ["Mid-market B2B SaaS India"],
    "stageIds": ["qualified", "outreach_running"],
    "staleOnly": true
  },
  "selectedLeadId": "uuid",
  "openModal": {
    "type": "history",
    "entityId": "uuid"
  },
  "historyFilters": {
    "eventTypes": ["move_stage", "assign_owner"],
    "actorIds": [],
    "dateFrom": "2026-04-01"
  }
}
```


## Reporting views

Because audit and progression are both central, the system should expose management views beyond the board itself.[^7][^2]

- Stage aging report.
- Conversion by ICP segment.
- Lost and parked reason distribution.
- Owner reassignment frequency.
- SLA breach trend.
- AI suggestion acceptance and rejection rates.[^2]
- Field volatility report for important attributes such as fit score, owner, and stage.[^2]


## Implementation notes

The write side should treat `AuditEvent` as immutable and append-only, while read models can denormalize latest stage, owner, score, and warning state for board speed.[^2] That separation makes it easier to support reliable history, manager trust, and future analytics.[^2]

A practical backend approach is to keep transactional entities in normalized tables, store field diffs in JSON for audit flexibility, and project board-friendly aggregates into read models keyed by tenant, pipeline, stage, and owner.[^2] This gives the UX the speed of a board app while preserving the governance expected of CRM and sales operations systems.[^7][^2]

<div align="center">⁂</div>

[^1]: https://kanbanzone.com/2019/kanban-solutions-for-sales/

[^2]: https://sales.hatrio.com/blog/what-are-crm-audit-trails/

[^3]: https://uxpatterns.dev/patterns/data-display/kanban-board

[^4]: https://pageflows.com/web/elements/kanban-board/

[^5]: https://www.justinmind.com/ui-design/dashboard-design-best-practices-ux

[^6]: https://kroolo.com/blog/12-essential-kanban-board-examples-for-2024

[^7]: https://www.insightly.com/blog/crm-audit/

[^8]: https://www.lazarev.agency/articles/dashboard-ux-design

[^9]: https://www.letsgroto.com/blog/mastering-ai-copilot-design

[^10]: https://www.visily.ai/blog/how-to-create-a-dashboard-wireframe/

