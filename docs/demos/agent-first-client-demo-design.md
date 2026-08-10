# Agent-First Client Demo Guide Design

**Date:** 2026-08-09

**Status:** Approved during brainstorming

## Purpose

Create a client-ready presenter script for demonstrating agent-first CSV work with the Companion Website. The presenter supplies prepared real-estate data to a coding or data agent, narrates the live browser review, and controls progression between checkpoints.

The guide must show authentic agent work rather than replay only precomputed CSV versions. The agent will create stable row identities, transform the data reproducibly, call the session API, and pause after each upload so the presenter and client can inspect the result.

## Audience and Assumptions

The primary reader is the presenter, not the client and not the implementing agent.

The presenter will:

- run the demo live,
- provide prepared CSV source files to a separate coding or data agent,
- copy instructions from the guide into that agent,
- open the Viewer URL returned by the agent,
- inspect and verify browser-local changes, and
- narrate expected behavior and known limitations.

The agent is assumed to have:

- access to the supplied CSV files,
- a Python or equivalent tabular-data workspace,
- `curl` or equivalent HTTP capability,
- network access to the running Companion Website, and
- enough autonomy to create an Upload Session and prepare Working CSV files.

The guide will not use Codex-specific skills, tools, or terminology.

## Deliverables

Create these durable repository artifacts:

1. `data/demo/client-housing-source-1000.csv`
   - The first 1,000 records from `data/housing.csv`.
   - Preserves the source columns and values.
   - Does not contain `_row_id`; creating stable identity is part of the agent demonstration.
2. `data/demo/client-housing-new-batch-10.csv`
   - The next 10 records from `data/housing.csv`.
   - Represents a newly arrived data batch.
   - Does not contain `_row_id`.
3. `docs/demos/agent-first-client-demo.md`
   - The copy-paste presenter guide.
   - Contains setup, agent instructions, presenter actions, expected observations, recovery, and talking points.

## Demo Format

Use a checkpoint-based workflow. The agent must stop after every upload and wait for the presenter to continue.

Each checkpoint in the guide must contain:

- **Instruction to send the agent:** ready-to-copy prompt text.
- **Agent action:** the expected transformation and API request.
- **Endpoint:** the exact method and endpoint shape.
- **Presenter action:** what the presenter clicks or checks.
- **Expected observation:** filenames, row/column counts, review summaries, highlights, or ghosts.
- **Talking point:** the product behavior the presenter should explain.
- **Recovery:** a focused action if the expected state is not visible.

The guide should take approximately 12–15 minutes when run without troubleshooting.

## Dataset Story

The demo uses California housing records and tells a coherent data-preparation story.

### Source baseline

The agent receives 1,000 records without `_row_id`, creates deterministic IDs such as `housing_000001` through `housing_001000`, validates uniqueness and non-emptiness, and uploads the first Working CSV.

Expected browser behavior:

- The table appears as a clean first baseline.
- No change-review bar or `Verify Changes` button appears.

### Data-quality correction

The source contains six missing `total_bedrooms` values. The agent calculates the median `total_bedrooms / total_rooms` ratio from complete rows, then fills each missing value with:

```text
round(total_rooms * median_bedroom_to_room_ratio)
```

This transformation has realistic meaning: it estimates missing bedroom counts using the dataset's typical layout density while preserving row identity.

Expected browser behavior:

- Six individual cells are reported as modified.
- The presenter verifies the changes, promoting the cleaned table to the browser-local baseline.

### Feature engineering

The agent adds three interpretable housing features:

- `rooms_per_household = total_rooms / households` for dwelling size,
- `bedrooms_per_room = total_bedrooms / total_rooms` for layout density, and
- `population_per_household = population / households` for occupancy or crowding.

The agent uploads and pauses without asking the presenter to verify immediately.

### Baseline-to-latest coalescing

Before the presenter verifies the first feature set, the presenter sends a revised instruction. The revised feature set:

- discards the unverified `rooms_per_household` column,
- retains `bedrooms_per_room`,
- retains `population_per_household`, and
- adds `income_band` using quartile thresholds calculated from `median_income` in the cleaned baseline.

The replacement preview must be built from the last verified cleaned table, not by treating the unverified preview as a new accepted baseline.

Expected browser behavior:

- The earlier unverified review is replaced.
- Review summaries describe the verified cleaned baseline directly against the revised latest table.
- The review reports three added columns: `bedrooms_per_room`, `population_per_household`, and `income_band`.
- Discarded `rooms_per_household` does not appear as a removed column because it never existed in the verified baseline.

The presenter verifies the revised feature set before continuing.

### Mixed row and schema changes

The agent performs a model-preparation update with realistic row and schema changes:

- append the 10-record new-data batch with stable IDs continuing after the baseline range,
- remove tracts with fewer than 25 households because their aggregate measures are based on very small samples,
- one-hot encode the observed `ocean_proximity` categories into indicator columns, and
- remove the original `ocean_proximity` text column after encoding.

Expected browser behavior:

- three added-column and one removed-column review categories coexist,
- 10 added rows and three removed rows coexist,
- the table shows 1,007 rows,
- added rows can be navigated to, and
- removed rows appear as deleted ghosts.

The presenter verifies the mixed change set at the end of the main demonstration.

## API Narrative

The guide must show these calls explicitly:

1. `POST /api/sessions`
   - Creates the anonymous Upload Session.
   - Returns the session ID, Viewer URL, and Working Upload URL.
2. `GET /api/sessions/:sessionId/events`
   - Opened by the browser to receive live Server-Sent Events.
3. `PUT /api/sessions/:sessionId/working`
   - Called by the agent for every Working CSV preview.

The guide must explicitly state that `Verify Changes` calls no endpoint. It updates only browser-local lifecycle state and does not pause or acknowledge the agent.

## Recovery and Limitations

The guide must not hide the current ephemeral behavior.

If the browser refreshes, closes, reconnects in a new browser state, or the computer sleeps and discards the page state:

- the Latest Table and Verified Baseline are lost,
- the backend cannot replay the latest Working CSV because it does not store agent Working CSV bytes,
- the Upload Session may still exist if the server process remained alive, and
- the agent must re-upload the last verified Working CSV while the viewer is connected.

That recovery upload becomes a fresh first baseline and produces no review controls.

If the server process restarts, the in-memory Upload Session is also lost. The agent must create a new session and provide its new Viewer URL.

The Viewer intentionally omits agent-facing URLs, tokens, and shell commands. The guide should confirm that the current preview or empty state begins directly below the compact header, notices, and metadata.

## Presenter Talking Points

The guide should emphasize:

- the Python or data workspace owns the Working CSV,
- the backend is a live bridge rather than version storage,
- stable `_row_id` values make row-level review possible,
- the browser remembers the last user-verified table,
- multiple unverified arrivals coalesce into one verified-baseline-to-latest review,
- verification is local and non-blocking, and
- schema, row, and cell changes can coexist in one review.

## Scope Boundaries

The guide will not:

- promise persistence across refresh or browser closure,
- introduce backend storage or version history,
- require a specific agent vendor,
- rely on hidden precomputed Working CSV versions as the primary demo path,
- instruct the presenter to expose tokens or sensitive data, or
- claim that category navigation moves through every individual changed target.

## Verification Criteria

Before delivery:

- Confirm the 1,000-row and 10-row source files are exact slices of `data/housing.csv`.
- Confirm both prepared source files preserve the original header and contain no `_row_id` column.
- Run the documented transformation logic against the prepared files and record deterministic expected counts.
- Confirm every Working CSV generated by the guide has valid, non-empty, unique `_row_id` values.
- Confirm the expected review categories match the current diff and summary implementation.
- Confirm every endpoint and UI label in the guide matches the application.
- Scan the guide for placeholders, ambiguous instructions, contradictory baselines, and Codex-specific assumptions.
