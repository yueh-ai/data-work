# Browser-Local Verified Baseline Design

**Date:** 2026-08-09

**Status:** Approved during brainstorming

## Purpose

Give the user an explicit `Verify Changes` action without adding backend Working CSV storage, version history, agent coordination, or an upload counter.

The browser keeps the last user-verified table as a stable comparison baseline. If multiple previews arrive before verification, intermediate previews are discarded and the user reviews the net difference between the verified baseline and the newest table.

## Scope

This design covers only:

- a browser-local verified baseline,
- coalescing multiple preview arrivals into one baseline-to-latest review,
- replacing `Clear Highlights` with `Verify Changes`, and
- preserving the last good review when an incoming preview cannot be parsed.

It does not change the backend, SSE protocol, agent workflow, Working CSV ownership, refresh behavior, or the existing category-level change navigation.

## Terminology

**Verified Baseline:** The parsed table the user most recently accepted. It remains the comparison origin until the user verifies a later table.

**Latest Table:** The newest successfully parsed preview received by the browser. This is always the table displayed to the user.

**Outstanding Review:** The visible differences from the Verified Baseline to the Latest Table. It exists only when that comparison contains visible changes.

The product should not call this behavior a queue. The browser does not retain intermediate uploads, and the UI does not show upload counts or pending-version language.

## Product Decisions

1. The first successfully parsed preview establishes both the Verified Baseline and the Latest Table. It appears without review controls.
2. A later preview replaces the Latest Table but does not change the Verified Baseline.
3. The review is always computed from the Verified Baseline directly to the Latest Table.
4. If another preview arrives before verification, it replaces the previous Latest Table. The previous unverified preview is discarded.
5. `Verify Changes` promotes the Latest Table to the Verified Baseline and removes the review summary, highlights, and deleted ghosts.
6. Verification is browser-local. It does not pause the agent, send an acknowledgement, call an API, or update backend state.
7. If the latest preview has no visible differences from the Verified Baseline, the browser displays it without review controls and leaves the Verified Baseline unchanged.
8. Refreshing, reconnecting in a new browser state, or changing sessions clears both tables. The next successful preview becomes a new first baseline.

## State Model

The review lifecycle owns only two parsed tables:

```ts
type ReviewLifecycleState = {
  verifiedBaseline: ParsedTable | null;
  latestTable: ParsedTable | null;
};
```

Review presentation state remains separate. Selection, filtering, highlighting, and scroll targets must not determine or mutate the Verified Baseline.

The visible review is derived from the lifecycle state:

```ts
diffTables(verifiedBaseline, latestTable)
  -> summarizeDiff(diff)
  -> visible review or no visible changes
```

When either table is missing, or when the comparison has no visible changes, there is no Outstanding Review.

## State Transitions

| Current state | Event | Result | Review |
|---|---|---|---|
| No baseline | Receive A | Baseline A, Latest A | None |
| Baseline A, Latest A | Receive B | Baseline A, Latest B | A to B |
| Baseline A, Latest B | Receive C | Baseline A, Latest C; discard B | A to C |
| Baseline A, Latest C | Verify Changes | Baseline C, Latest C | None |
| Baseline C, Latest C | Receive D | Baseline C, Latest D | C to D |
| Baseline A, any latest | Receive table with no visible difference from A | Baseline A, display newest table | None |
| Any browser state | Reset, refresh, or session change | No baseline, no latest | None |

This model also handles a later preview that reverses all unverified changes. If the Latest Table is visibly equivalent to the Verified Baseline, the Outstanding Review disappears without changing the baseline.

## Client Responsibilities

### Review lifecycle

A small pure client module should own the lifecycle transitions:

- receive the first table,
- replace the latest table,
- promote the latest table on verification, and
- reset the state.

The lifecycle module depends on parsed tables only. It does not know about SSE, React components, navigation controls, or DOM scrolling.

### Preview ingestion

The existing SSE handlers continue receiving handoff and working previews. After parsing succeeds, the parsed table is passed to the lifecycle transition.

The first successful preview of either kind establishes the baseline. This preserves both the current agent-first path and the supported browser-upload path.

### Review presentation

The review summary and table markers are derived from Verified Baseline to Latest Table. When a newer preview changes the derived summary, presentation state resets to the first available summary item because old targets may no longer exist.

The existing category navigation behavior is otherwise unchanged in this focused feature.

## UI Behavior

- Rename `Clear Highlights` to `Verify Changes`.
- Show `Verify Changes` only while an Outstanding Review exists.
- Clicking it leaves the Latest Table visible.
- The review bar, highlights, and deleted ghosts disappear immediately after verification.
- A newer preview received during review immediately replaces the displayed table and recomputes the net review.
- Do not show an upload count, pending count, intermediate-version list, or agent acknowledgement state.
- Do not add a persistent success message. The disappearance of the review state is the verification feedback for this POC.

## Error Handling

Backend validation remains unchanged. A rejected Working CSV upload does not emit a preview and cannot affect browser review state.

If an emitted preview cannot be parsed in the browser:

- keep the current Verified Baseline,
- keep the current Latest Table,
- keep any Outstanding Review,
- show the parse error, and
- wait for the next valid preview.

A malformed arrival must not erase the last successfully displayed data or its review state.

## Testing

### Pure lifecycle tests

- First table establishes both lifecycle slots and produces no review.
- A later table changes only the Latest Table.
- A to B to C before verification produces an A-to-C review and retains no B state.
- Verification promotes C and removes the Outstanding Review.
- A later D preview compares C to D.
- A no-visible-change preview is displayed without advancing the Verified Baseline.
- A full reversal back to baseline removes the Outstanding Review.
- Reset clears both lifecycle slots.

### Integration and UI tests

- `Verify Changes` replaces `Clear Highlights`.
- Verification keeps the latest table visible while removing summaries, highlights, and deleted ghosts.
- A newer preview during review recomputes the summary against the unchanged Verified Baseline.
- A parse failure preserves the last good table and review.
- No upload count or intermediate-version UI is rendered.
- Existing category navigation remains functional.
- The first handoff or working preview establishes a baseline without review controls.

### Browser smoke test

1. Open a live session and upload A.
2. Upload changed table B and confirm the A-to-B review appears.
3. Without verifying, upload changed table C and confirm the review now represents A to C.
4. Click `Verify Changes` and confirm the current table remains while review markers disappear.
5. Upload D and confirm the review represents C to D.
6. Refresh and confirm the next upload establishes a fresh baseline.

## Deferred Follow-Up Problems

The following confirmed problems remain important but are deliberately outside this small implementation. Future design work should begin with [the agent-first live-flow observation](../../observations/2026-08-09-agent-first-live-flow-test.md) and this list so they are not lost:

1. Separate or reduce agent-facing session controls so the user-facing preview and arrival state are visible in short viewports.
2. Add a distinct, perceivable signal for every new Working CSV arrival.
3. Support next and previous navigation through individual changed targets rather than only summary categories.
4. Remove or clarify the duplicate chip and detail interaction surfaces and their independent selection states.
5. Improve feedback when navigation moves inside the nested table scroller, especially for removed-row ghosts.
6. Revisit refresh and replay only as a separate storage and reliability decision.
7. Align the `_row_id` format contract across the backend, browser handoff normalization, and agent skill.

## Compatibility and Consequences

- No API or SSE event changes are required.
- The backend remains a live bridge and does not store agent Working CSV Versions.
- The agent continues uploading without waiting for user verification.
- Verification cannot survive refresh because it exists only in browser memory.
- Memory remains bounded to two parsed tables rather than growing with the number of uploads.
- Users see the net effect since their last verification, not a history of intermediate transformations.
