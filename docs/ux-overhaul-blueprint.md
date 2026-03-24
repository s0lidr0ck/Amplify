# Amplify UX Overhaul Blueprint

**Status:** Proposed  
**Last updated:** 2026-03-23

## Why This Exists

Amplify has outgrown the current "open page, scroll page, leave page" model.

The next upgrade is not a visual refresh. It is a shift from:

- step-first UI
- page-first navigation
- artifact-first screens

to:

- workspace-first shell
- operator-first information architecture
- object/state-first workflows

This document turns the 6-lens UX review into a buildable blueprint for the web app in `apps/web`.

## Core Decision

Amplify should become a persistent private content-operations workspace.

The product should feel closer to:

- a studio
- a release desk
- a monitoring console

and less like:

- a wizard
- a series of long forms
- a stack of route pages with intros

## Product Principles

1. Design around operator questions, not route names.
2. Keep shell stable; change the canvas, not the whole page.
3. Make the active object obvious.
4. Prefer scanning over reading.
5. Hide non-blocking complexity until needed.
6. Make analytics feed upstream decisions.
7. Use the right rail for context, not inline sprawl.
8. Use motion to explain state, never to decorate.

## Primary Object Model

The UI should revolve around active operational objects:

- `Project`
- `Source Asset`
- `Sermon Master`
- `Transcript`
- `Generated Output`
- `Release Package`
- `Performance Entity`

Each object should expose a consistent state model:

- `missing`
- `queued`
- `running`
- `ready`
- `needs_review`
- `approved`
- `published`
- `failed`
- `underperforming`

## Target Information Architecture

### Global Navigation

Persistent left rail:

- `Home`
- `Projects`
- `Calendar`
- `Publish Queue`
- `Analytics`
- `Library`
- `Settings`

### Project Navigation

Persistent top workspace tabs:

- `Overview`
- `Ingest`
- `Generate`
- `Publish`
- `Analytics`

### Contextual Subnav

Within each workspace:

- `Ingest`
  - `Source`
  - `Trim`
  - `Transcript`
  - `Jobs`
- `Generate`
  - `Assets`
  - `Clips`
  - `Visuals`
  - `Copy`
  - `Blog`
  - `Metadata`
- `Publish`
  - `Release`
  - `Calendar`
  - `Destinations`
  - `Results`
- `Analytics`
  - `Brand`
  - `Platforms`
  - `Content`
  - `Reports`

## Shell Architecture

### Desktop Shell

```text
+--------------------------------------------------------------------------------------+
| Left Global Rail | Context Rail | Top App Bar / Scope / Filters                     |
|                  |              +---------------------------------------------------+
|                  |              | Main Canvas                           | Inspector |
|                  |              | queue / board / editor / chart /     | metadata  |
|                  |              | release surface                       | status    |
|                  |              |                                       | logs      |
+--------------------------------------------------------------------------------------+
```

### Region Responsibilities

- `Left Global Rail`
  - app-wide destinations
  - project switcher entry
  - unread/attention counts
- `Context Rail`
  - workspace subnav
  - saved views
  - filters
  - queues
- `Top App Bar`
  - current project
  - workspace title
  - scope chips
  - date range
  - search / command palette
  - primary action
- `Main Canvas`
  - active work surface
  - queue/focus/compare layouts
- `Inspector`
  - status
  - metadata
  - version history
  - diagnostics
  - release details
  - recommendations

### Mobile Shell

Mobile should not mimic the desktop shell.

Use:

- bottom destination nav for global areas
- slide-over context drawer
- top scoped header
- one primary canvas
- bottom sheet or right-sheet replacement for inspector

## Workspace Modes

Every workspace should support the same 3 high-level working modes:

1. `Queue`
Review many items quickly.

2. `Focus`
Work deeply on one selected item.

3. `Compare`
Review variants, related outputs, or destinations side by side.

## Progressive Disclosure Model

Apply this product-wide:

### Tier 1: Drive

- one recommended next action
- one primary CTA
- blocker summary
- no advanced controls unless blocking

### Tier 2: Review

- preview outputs
- inspect linked assets
- edit results
- approve / reject / regenerate

### Tier 3: Control

- advanced settings
- diagnostics
- model overrides
- raw payloads
- export tools
- system logs

Default behavior:

- open in `Drive`
- move into `Review` after successful generation
- reveal `Control` on demand

## Workspace Blueprints

## Overview

### Purpose

Answer:

- what requires attention now?
- what is blocked?
- what changed since last visit?
- what is ready to publish?
- what is underperforming?

### Layout

```text
Context Rail: Project views / saved filters

Main Canvas:
- Attention queue
- Recent changes
- Ready to publish
- Active jobs
- Performance signals

Inspector:
- selected project health
- owner / timestamps
- dependency chain
```

### Key Components

- `RecommendedNextActionCard`
- `RecentChangesFeed`
- `ProjectHealthTable`
- `ReadyToPublishQueue`
- `BlockedItemsList`
- `LiveJobPanel`

## Ingest

### Primary Question

Is this sermon ready to enter production?

### Layout

```text
Context Rail:
- Source queue
- Filters
- Recent imports

Main Canvas:
- Source panel
- Master panel
- Transcript panel

Inspector:
- readiness checklist
- active jobs
- logs
- retry actions
```

### Panel Design

- `Source`
  - file status
  - duration
  - upload/replace
  - preview thumbnail/video
- `Master`
  - trim range
  - generated asset state
  - waveform/timeline
- `Transcript`
  - transcription state
  - quality summary
  - searchable excerpt

### Default Flow

1. Upload or confirm source.
2. Set or confirm sermon boundaries.
3. Generate transcript.
4. Surface "ready for Generate" status.

### Advanced Controls

Collapsed in inspector:

- alternate ingest paths
- trim precision
- job logs
- reprocess actions
- source replacement history

## Generate

### Primary Question

What assets do I have, what is missing, and what needs review?

### Strategic Note

This should become the center of the product.

### Layout

```text
Context Rail:
- Assets
- Clips
- Visuals
- Copy
- Blog
- Metadata
- Saved views: Needs review / Approved / Missing / Strongest

Main Canvas:
- board/list of outputs
- selected editor
- compare surface

Inspector:
- prompt inputs
- versions
- linked assets
- approval state
- diagnostics
```

### Recommended Default View

`Assets` should be the Generate landing view.

Group outputs by:

- `Needs review`
- `Ready`
- `Missing`
- `Published downstream`

### Core Interaction Pattern

1. Select output card from queue/list/board.
2. Open output in center editor.
3. Use inspector for versions, notes, links, diagnostics.
4. Compare against related assets without leaving workspace.

### Output Families

- `Clips`
  - candidate list
  - active preview player
  - selected clip details
- `Visuals`
  - sermon thumbnail
  - reel thumbnail
  - side-by-side comparisons
- `Copy`
  - title/description
  - text post
  - captions
- `Blog`
  - long-form article draft
  - excerpt/structure status
- `Metadata`
  - structured fields
  - warnings
  - downstream consumers

### Advanced Controls

Collapse by default:

- model/host selection
- candidate limits
- scoring internals
- prompt variants
- raw payloads
- artifact preparation

## Publish

### Primary Question

What can go live now, where, and with what confidence?

### Layout

```text
Context Rail:
- Release
- Calendar
- Destinations
- Results

Main Canvas:
- release queue
- publish preview
- calendar / schedule
- composer / destination preview

Inspector:
- validation
- SEO health
- channel rules
- release status
- publish history
```

### Target Behaviors

- publishing should feel like a release cockpit
- preview should be central
- validation should be persistent
- destination-specific settings should live in the inspector

### Default Flow

1. Review release readiness.
2. Confirm destination package.
3. Preview scheduled/live output.
4. Publish or schedule.
5. Surface result and audit trail.

### Advanced Controls

- SEO overrides
- channel-specific metadata
- authoring rules
- API diagnostics
- payload inspection

## Analytics

### Primary Question

What is working, where, and what should that change next?

### Layout

```text
Context Rail:
- Brand
- Platforms
- Content
- Reports

Top Bar:
- date range
- project / speaker / series
- platform
- content type

Main Canvas:
- KPI row
- chart canvas
- ranked lists
- anomaly cards

Inspector:
- selected content/platform detail
- comparisons
- recommendations
```

### Modes

- `Brand`
  - cross-platform rollup
  - top growth signals
- `Platforms`
  - platform-by-platform performance
  - audience and content-type fit
- `Content`
  - post/asset-level performance
  - winners, losers, patterns
- `Reports`
  - saved reports
  - exports

### Critical Requirement

Analytics must produce recommended next actions, not just charts.

Examples:

- "Short-form reels outperform long-form clips on Instagram by 32%."
- "Thumbnail style B has higher CTR on YouTube titles over 55 characters."
- "Blog + reel bundle outperforms reel-only publish for this speaker."

## Visual System Direction

### Keep

- warm, human foundation
- clean typography
- strong use of status color

### Change

- reduce large-radius card language
- reduce gradient overuse
- increase layout density
- create real surface hierarchy
- use shadows/elevation semantically
- replace hero-style headers with compact workspace headers

### Elevation Model

- `Level 0`: app background
- `Level 1`: base workspace surface
- `Level 2`: active panel / raised card
- `Level 3`: docked inspector / overlays

### Emotional Tone By Area

- `Ingest`: calm, procedural, trustworthy
- `Generate`: active, iterative, energetic
- `Publish`: decisive, polished, high-confidence
- `Analytics`: sharp, insight-rich, signal-forward

## Interaction Model

### Motion

Use motion only to explain causality:

- drawers slide from their owning edge
- details expand from the triggering item
- state changes animate tone/elevation
- loading preserves panel geometry

Target durations:

- `120-180ms` for micro transitions
- `200-280ms` for drawers/panel swaps

### Defaults

Adopt more invisible behaviors:

- remember last active workspace per project
- remember last active subview per workspace
- auto-focus the blocked or recommended next item
- prefill common publishing defaults
- autosave drafts with visible reassurance
- collapse non-blocking diagnostics

## Component Inventory

### Shell

- `GlobalRail`
- `WorkspaceRail`
- `WorkspaceTabs`
- `TopScopeBar`
- `InspectorPanel`
- `CommandPalette`

### Navigation / State

- `StatePill`
- `AttentionBadge`
- `SavedViewSwitcher`
- `FilterChipRow`
- `BreadcrumbScope`

### Queue / Board / Table

- `ProjectQueueTable`
- `OutputBoard`
- `ReleaseQueue`
- `AssetListPane`
- `ContentPerformanceTable`

### Editor / Review

- `SplitCompareView`
- `PreviewPane`
- `VersionHistoryPanel`
- `ApprovalPanel`
- `LinkedAssetsPanel`

### Jobs / Operations

- `LiveJobTicker`
- `BlockingIssuesPanel`
- `OperationalStatusBoard`
- `RetryActionBar`

### Analytics

- `KpiRow`
- `TrendCanvas`
- `PlatformBreakdownTable`
- `RecommendationPanel`
- `AnomalyFeed`

### Progressive Disclosure

- `DrivePanel`
- `AdvancedDrawer`
- `SimpleAdvancedToggle`
- `ContextualEmptyState`

## Mapping To Current Codebase

### Current Areas To Replace Or Refactor

- `apps/web/src/components/layout/AppShell.tsx`
  - replace with real shell architecture
- `apps/web/src/app/projects/[id]/layout.tsx`
  - replace page-style project layout with persistent workspace shell
- `apps/web/src/components/workflow/ProjectWorkflowNav.tsx`
  - remove as primary navigation model
- `apps/web/src/app/projects/[id]/page.tsx`
  - rebuild as Overview workspace

### Current Route Families To Fold Into Workspaces

- Ingest
  - `source`
  - `trim`
  - `transcript`
- Generate
  - `clips`
  - `reel`
  - `reel-thumbnail`
  - `sermon-thumbnail`
  - `title-desc`
  - `text-post`
  - `blog`
  - `metadata`
  - current `text` and `visuals` should become workspace views, not primary destinations
- Publish
  - `publishing`
- Analytics
  - `analytics`

## Phased Rebuild Plan

## Phase 1: Shell Foundation

### Goal

Install the new operator shell without rebuilding every tool at once.

### Deliverables

- new `GlobalRail`
- new `WorkspaceTabs`
- new `WorkspaceRail`
- new `InspectorPanel`
- compact top scope bar
- remove current workflow rail from primary flow

### Success Criteria

- any project can open into a persistent multi-pane shell
- nav model is consistent on desktop
- mobile falls back to drawers/sheets cleanly

## Phase 2: Generate Studio

### Goal

Turn Generate into one domain workspace.

### Deliverables

- Generate landing workspace
- saved views
- output board/list
- central review surface
- right inspector with versions/links/diagnostics
- inline compare mode

### Success Criteria

- user can move across clips, visuals, copy, blog, and metadata without route-hopping
- advanced controls are no longer first-load clutter

## Phase 3: Publish Desk

### Goal

Rebuild Publishing as queue + preview + schedule + results.

### Deliverables

- release checklist
- destination-aware preview
- schedule/calendar surface
- publish result history
- validation inspector

### Success Criteria

- publishing no longer feels like a long form
- release state is obvious at a glance

## Phase 4: Analytics Decision Layer

### Goal

Make analytics actionable.

### Deliverables

- brand/platform/content modes
- KPI row and ranked performance
- drilldown inspector
- recommendation panel tied to creation/publishing

### Success Criteria

- analytics answers what changed, where, and what to do next

## Phase 5: Ingest Consolidation

### Goal

Fold source/trim/transcript into one intake workspace.

### Deliverables

- 3-panel ingest canvas
- shared readiness checklist
- jobs/logs inspector
- unified asset status

### Success Criteria

- ingest no longer feels like 3 separate destinations

## Phase 6: Polish And Defaults

### Goal

Make the system feel obvious.

### Deliverables

- simple/advanced preference
- remembered workspace context
- tighter motion
- better completion states
- stronger "what unlocks next"
- invisible defaults and autosave reassurance

## Guardrails

Do not:

- copy reference screenshots literally
- increase chrome without reducing navigation debt
- bury blocking information
- hide destructive actions
- turn every workspace into a dashboard collage

Do:

- preserve expert control
- make default paths simpler
- prefer contextual inspectors over new pages
- keep the shell spatially stable

## Definition Of Success

The redesign succeeds if a user can:

1. enter a project and immediately know what needs attention
2. move across related outputs without route-hopping
3. publish from a release desk instead of a long form
4. read analytics as recommendations, not just charts
5. use advanced controls without exposing them as default clutter

## Recommended Next Artifact

After this blueprint, the next document should be:

- a wireframe spec for:
  - `Overview`
  - `Ingest`
  - `Generate`
  - `Publish`
  - `Analytics`

and then:

- a component-by-component implementation checklist for `apps/web`
