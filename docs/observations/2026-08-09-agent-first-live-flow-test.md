# Agent-First Live Flow Test Observations

**Date:** 2026-08-09
**Session ID:** `2e3449c4-56db-44d7-8aa4-16545d71a31f`
**Dataset:** `data/housing.csv` (20,640 data rows)

## Flow Tested

1. Started the Companion Website locally at `http://localhost:3000`.
2. Created a session with `POST /api/sessions`.
3. Opened the returned Viewer URL in the browser.
4. Added `_row_id` to an agent-owned Working CSV.
5. Uploaded the Working CSV with `PUT /api/sessions/2e3449c4-56db-44d7-8aa4-16545d71a31f/working`.

The upload returned HTTP 200, reported 1 active viewer, and accepted 1,733,137 bytes.

## User Observations

### 1. Row ID representation

The agent generated padded string IDs such as `housing_000001`. Consider whether simple sequential values such as `1`, `2`, and `3` would make preparation faster or reduce the uploaded CSV size.

This requires measurement before making a product decision. CSV values are transmitted as text, so simpler IDs may save some bytes and formatting work, but row-ID generation is unlikely to dominate parsing, upload, SSE delivery, or browser rendering time. Stability and uniqueness across later transformations remain the primary requirements.

### 2. Live update was not immediately visible

After the agent uploaded the Working CSV, the user initially believed the Companion Website had not updated automatically. The upload response reported `activeViewers: 1`.

Follow-up observation: the live update had worked. In the small browser viewport, the upload section occupied the visible page and the updated data preview was farther down the page. The user did not initially notice it.

This is therefore a discoverability and layout observation rather than evidence of an SSE delivery failure. Consider making the arrival of a Working CSV more visible or bringing the updated preview into view, especially on short or small browser windows.

### 3. Refresh behavior

The user does not need to refresh the Companion Website after a successful Working CSV upload. This test confirmed that the live update arrived automatically; the updated table was below the currently visible portion of the page.

A refresh is not a reliable recovery mechanism in the current architecture. Agent Working CSV bytes are relayed to currently connected viewers and then discarded by the backend, so the server cannot replay the last Working CSV after the browser reconnects. If a live event is missed, the current recovery path is for the agent to upload the local Working CSV again while the viewer is connected.

### 4. Navigating multiple modified cells

After the median-imputation upload, the review summary reported 207 modified cells. Clicking that summary moved the table to the first modified cell, which was useful.

However, the review flow exposed only the first change directly. There was no obvious next/previous change navigation, so the user had to scroll through the table to locate additional modified cells. For a large dataset, a useful review flow should make it easy to move sequentially between changes and show the current change position, such as “1 of 207.”

### 5. “Clear Highlights” does not match the desired review model

The “Clear Highlights” action was not intuitive to the user. The desired action is closer to **Verify changes**: the user reviews and accepts the current changes, the highlights disappear, and the current Working CSV becomes the clean baseline for the next update.

This is not merely a visual preference. It describes a review-state transition:

1. New Working CSV arrives and is compared with the current accepted state.
2. The user reviews the differences.
3. The user verifies the changes.
4. The verified Working CSV becomes the new baseline, with no outstanding highlights.
5. The next agent upload is compared against that newly verified baseline.

### 6. Duplicate clickable change summaries are confusing

After the multi-step upload, the UI showed three clickable summary chips:

- `+4 columns`
- `-207 rows`
- `9022 cells modified`

It also showed clickable change-detail items beneath the chips. Both surfaces appear to represent the same change categories, so it is unclear which one the user should click. Keep one primary interactive surface rather than presenting two competing sets of controls for the same action.

### 7. Browser interaction test of the review controls

The agent clicked the controls directly in the Companion Website and observed the following behavior:

- The `+4 columns` chip and its detail item both move the table horizontally toward the added columns.
- The `9022 cells modified` chip and its detail item both move the table to a modified-cell region.
- The `-207 rows` chip and its detail item do work technically: the table’s internal scroll jumps near the end of the dataset, where deleted records are rendered with their old values struck through.
- The removed-row behavior is difficult to perceive. The page itself barely moves, the movement occurs inside the nested table scroller, and there is no strong “showing removed rows” confirmation. This makes the control feel unresponsive even when it has changed the table position.
- The previous/next arrow control displays category progress such as `2 of 3`. It navigates among the three change categories, not among the 9,022 individual modified cells. There is still no next/previous navigation through individual changes.

The user’s concern is therefore confirmed as a feedback and interaction-design problem rather than a completely nonfunctional removed-row action.

## Multi-Step Test Performed

The agent tested a more realistic multi-step data-science pipeline while preserving `_row_id` throughout:

1. **Feature engineering:** add `rooms_per_household`, `bedrooms_per_room`, and `population_per_household`.
2. **Categorization:** add an `income_band` derived from `median_income` quartiles.
3. **Outlier filtering:** remove rows above the 99th percentile of `population_per_household`.

The result was uploaded as one new Working CSV Version. The UI reported 4 added columns, 207 removed rows, and 9,022 modified cells. This exercised added columns, many derived values, categorical changes, and removed rows together, exposing the review-control observations recorded above.

## Scope of This Note

This file records the test and observations only. No application behavior was changed and no fix was attempted.
