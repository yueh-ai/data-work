# Browser-Local Verified Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the last user-verified CSV table as a browser-local baseline, coalesce later previews into a baseline-to-latest review, and replace `Clear Highlights` with `Verify Changes`.

**Architecture:** Add a pure two-table lifecycle module that owns `verifiedBaseline` and `latestTable` and derives an Outstanding Review from those tables. Integrate it into the existing React session view so only successfully parsed previews update lifecycle and preview metadata, while review selection remains separate presentation state. Verification promotes the latest table locally; the backend and SSE protocol remain unchanged.

**Tech Stack:** TypeScript 5.9, React 19, PapaParse, Node's built-in test runner through `tsx --test`, Vite 7, existing CSS.

## Global Constraints

- The first successfully parsed handoff or working preview establishes both lifecycle tables and shows no review.
- Every later preview replaces only the Latest Table; intermediate unverified previews are not retained.
- The review is always Verified Baseline to Latest Table, never previous upload to latest upload.
- `Verify Changes` is browser-local and must not call an API, notify the agent, or pause uploads.
- A no-visible-change preview is displayed without review controls and does not advance the Verified Baseline.
- A client parse failure preserves the last successful table, preview metadata, and review.
- Refresh or session change clears browser lifecycle state; the next valid preview becomes a new baseline.
- Do not add upload counts, pending counts, version lists, durable storage, dependencies, API changes, or SSE event changes.
- Preserve the current category-level navigation behavior; individual-change navigation is deferred.
- Do not modify `src/server/**`, `skills/csv-data-work/**`, or the deferred issues recorded in the design.

## File Structure

- Create `src/client/src/reviewLifecycle.ts`: pure lifecycle transitions and Outstanding Review derivation.
- Create `src/client/src/reviewLifecycle.test.ts`: transition, coalescing, verification, no-change, reversal, and reset tests.
- Modify `src/client/src/main.tsx`: ingest valid previews into lifecycle, derive review presentation, implement local verification, and preserve last good state on parse failure.
- Modify `src/client/src/styles.css`: rename the review action class from clear semantics to verify semantics and remove the obsolete cleared-message style.
- Reference `docs/superpowers/specs/2026-08-09-browser-local-verified-baseline-design.md`: approved behavior and deferred scope; no spec edits are expected.

---

### Task 1: Pure Verified-Baseline Lifecycle

**Files:**
- Create: `src/client/src/reviewLifecycle.ts`
- Create: `src/client/src/reviewLifecycle.test.ts`
- Read: `src/client/src/csvTable.ts`
- Read: `src/client/src/csvDiff.ts`
- Read: `src/client/src/changeSummary.ts`

**Interfaces:**
- Consumes: `ParsedTable`, `diffTables(previous, next)`, and `summarizeDiff(diff)`.
- Produces: `ReviewLifecycleState`, `OutstandingReview`, `emptyReviewLifecycle()`, `receiveLatestTable(state, latestTable)`, `verifyLatestTable(state)`, and `buildOutstandingReview(state)`.
- `OutstandingReview` retains the existing `previousTable`, `currentTable`, and `summary` property names so table rendering helpers can continue consuming them.

- [ ] **Step 1: Write the failing lifecycle tests**

Create `src/client/src/reviewLifecycle.test.ts` with these exact cases:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { parseCsvTable } from "./csvTable.js";
import {
  buildOutstandingReview,
  emptyReviewLifecycle,
  receiveLatestTable,
  verifyLatestTable
} from "./reviewLifecycle.js";

const tableA = parseCsvTable(
  "_row_id,name,score\nrow_000001,Ada,10\nrow_000002,Grace,20\nrow_000003,Katherine,30\n"
);
const tableB = parseCsvTable(
  "_row_id,name,score\nrow_000001,Ada,11\nrow_000002,Grace,20\nrow_000003,Katherine,30\n"
);
const tableC = parseCsvTable(
  "_row_id,name,score\nrow_000001,Ada,10\nrow_000002,Grace,22\nrow_000003,Katherine,30\n"
);
const tableD = parseCsvTable(
  "_row_id,name,score\nrow_000001,Ada,10\nrow_000002,Grace,22\nrow_000003,Katherine,33\n"
);

test("first preview establishes both lifecycle tables without a review", () => {
  const state = receiveLatestTable(emptyReviewLifecycle(), tableA);

  assert.strictEqual(state.verifiedBaseline, tableA);
  assert.strictEqual(state.latestTable, tableA);
  assert.equal(buildOutstandingReview(state), null);
});

test("later previews coalesce from the verified baseline to the latest table", () => {
  let state = receiveLatestTable(emptyReviewLifecycle(), tableA);
  state = receiveLatestTable(state, tableB);
  state = receiveLatestTable(state, tableC);

  assert.strictEqual(state.verifiedBaseline, tableA);
  assert.strictEqual(state.latestTable, tableC);

  const review = buildOutstandingReview(state);
  assert.ok(review);
  assert.strictEqual(review.previousTable, tableA);
  assert.strictEqual(review.currentTable, tableC);
  assert.deepEqual(review.summary.map((item) => item.label), ["1 individual cell modified"]);
  assert.deepEqual(review.summary[0].targets, [
    { kind: "cell", rowId: "row_000002", column: "score", rowIndex: 1 }
  ]);
});

test("verification promotes the latest table and starts the next comparison there", () => {
  let state = receiveLatestTable(emptyReviewLifecycle(), tableA);
  state = receiveLatestTable(state, tableC);
  state = verifyLatestTable(state);

  assert.strictEqual(state.verifiedBaseline, tableC);
  assert.strictEqual(state.latestTable, tableC);
  assert.equal(buildOutstandingReview(state), null);

  state = receiveLatestTable(state, tableD);
  const review = buildOutstandingReview(state);
  assert.ok(review);
  assert.strictEqual(review.previousTable, tableC);
  assert.strictEqual(review.currentTable, tableD);
  assert.deepEqual(review.summary.map((item) => item.label), ["1 individual cell modified"]);
});

test("no-change and reversal previews leave the verified baseline unchanged", () => {
  const equivalentA = parseCsvTable(
    "_row_id,name,score\nrow_000001,Ada,10\nrow_000002,Grace,20\nrow_000003,Katherine,30\n"
  );

  let state = receiveLatestTable(emptyReviewLifecycle(), tableA);
  state = receiveLatestTable(state, equivalentA);
  assert.strictEqual(state.verifiedBaseline, tableA);
  assert.strictEqual(state.latestTable, equivalentA);
  assert.equal(buildOutstandingReview(state), null);

  state = receiveLatestTable(state, tableB);
  assert.ok(buildOutstandingReview(state));
  state = receiveLatestTable(state, equivalentA);
  assert.strictEqual(state.verifiedBaseline, tableA);
  assert.equal(buildOutstandingReview(state), null);
});

test("empty lifecycle resets both tables", () => {
  const populated = receiveLatestTable(emptyReviewLifecycle(), tableA);
  assert.ok(populated.latestTable);

  assert.deepEqual(emptyReviewLifecycle(), {
    verifiedBaseline: null,
    latestTable: null
  });
});
```

- [ ] **Step 2: Run the targeted test and verify it fails**

Run:

```bash
npx tsx --test src/client/src/reviewLifecycle.test.ts
```

Expected: FAIL because `./reviewLifecycle.js` does not exist.

- [ ] **Step 3: Implement the minimal lifecycle module**

Create `src/client/src/reviewLifecycle.ts`:

```ts
import { summarizeDiff, type ChangeSummaryItem } from "./changeSummary.js";
import { diffTables } from "./csvDiff.js";
import type { ParsedTable } from "./csvTable.js";

export type ReviewLifecycleState = {
  verifiedBaseline: ParsedTable | null;
  latestTable: ParsedTable | null;
};

export type OutstandingReview = {
  previousTable: ParsedTable;
  currentTable: ParsedTable;
  summary: ChangeSummaryItem[];
};

export function emptyReviewLifecycle(): ReviewLifecycleState {
  return {
    verifiedBaseline: null,
    latestTable: null
  };
}

export function receiveLatestTable(
  state: ReviewLifecycleState,
  latestTable: ParsedTable
): ReviewLifecycleState {
  if (!state.verifiedBaseline) {
    return {
      verifiedBaseline: latestTable,
      latestTable
    };
  }

  return {
    verifiedBaseline: state.verifiedBaseline,
    latestTable
  };
}

export function verifyLatestTable(state: ReviewLifecycleState): ReviewLifecycleState {
  if (!state.latestTable) {
    return state;
  }

  return {
    verifiedBaseline: state.latestTable,
    latestTable: state.latestTable
  };
}

export function buildOutstandingReview(state: ReviewLifecycleState): OutstandingReview | null {
  if (!state.verifiedBaseline || !state.latestTable) {
    return null;
  }

  const summary = summarizeDiff(diffTables(state.verifiedBaseline, state.latestTable));
  if (summary.length === 1 && summary[0].kind === "no_change") {
    return null;
  }

  return {
    previousTable: state.verifiedBaseline,
    currentTable: state.latestTable,
    summary
  };
}
```

- [ ] **Step 4: Run the targeted lifecycle tests**

Run:

```bash
npx tsx --test src/client/src/reviewLifecycle.test.ts
```

Expected: 5 tests pass and 0 fail.

- [ ] **Step 5: Run all existing tests**

Run:

```bash
npm test
```

Expected: 31 tests pass and 0 fail: the existing 26 plus the 5 new lifecycle tests.

- [ ] **Step 6: Commit the lifecycle module**

```bash
git add src/client/src/reviewLifecycle.ts src/client/src/reviewLifecycle.test.ts
git commit -m "feat: add verified csv review lifecycle"
```

---

### Task 2: Integrate Lifecycle and Verify Changes into the Session UI

**Files:**
- Modify: `src/client/src/main.tsx:18-22,62-69,152-286,425-436,498-625,843-883`
- Modify: `src/client/src/styles.css:494-541,579-584`
- Test: `src/client/src/reviewLifecycle.test.ts`

**Interfaces:**
- Consumes: all exports from `reviewLifecycle.ts` created in Task 1.
- Produces: browser-local preview lifecycle in `SessionView`, `Verify Changes` UI copy and handler, and parse-failure preservation.
- Keeps: `ReviewState.previousTable`, `ReviewState.currentTable`, and `ReviewState.summary` for `TablePreview` and existing review-target helpers.

- [ ] **Step 1: Replace the old review ownership types and imports**

In `src/client/src/main.tsx`, remove the value imports of `summarizeDiff` and `diffTables`. Keep `ChangeSummaryItem` as a type and add the lifecycle imports:

```ts
import type { ChangeSummaryItem, ChangeTarget } from "./changeSummary.js";
import { parseCsvTable, type ParsedTable, rowIdColumn, visibleColumns } from "./csvTable.js";
import {
  buildOutstandingReview,
  emptyReviewLifecycle,
  receiveLatestTable,
  verifyLatestTable,
  type OutstandingReview,
  type ReviewLifecycleState
} from "./reviewLifecycle.js";
import { activeCellClass, firstReviewScrollTarget, removedGhostCellClass } from "./reviewClassNames.js";
```

Replace the old `ReviewState` type with separate lifecycle-derived data and presentation state:

```ts
type ReviewPresentationState = {
  activeSummaryId: string | null;
  activeGroup: string | null;
};

type ReviewState = OutstandingReview & ReviewPresentationState;

function emptyReviewPresentation(): ReviewPresentationState {
  return {
    activeSummaryId: null,
    activeGroup: null
  };
}
```

Do not keep `highlightsCleared`; verification replaces that visual-only state.

- [ ] **Step 2: Replace table and review ownership in `SessionView`**

Replace the old `table` and `review` state declarations with:

```ts
const [reviewLifecycle, setReviewLifecycle] = useState<ReviewLifecycleState>(emptyReviewLifecycle);
const [reviewPresentation, setReviewPresentation] = useState<ReviewPresentationState>(emptyReviewPresentation);
```

After the state declarations, derive the displayed table and review:

```ts
const table = reviewLifecycle.latestTable;
const outstandingReview = useMemo(
  () => buildOutstandingReview(reviewLifecycle),
  [reviewLifecycle]
);
const review = useMemo<ReviewState | null>(() => {
  if (!outstandingReview) {
    return null;
  }

  const activeSummaryId = outstandingReview.summary.some(
    (item) => item.id === reviewPresentation.activeSummaryId
  )
    ? reviewPresentation.activeSummaryId
    : outstandingReview.summary[0]?.id ?? null;

  return {
    ...outstandingReview,
    ...reviewPresentation,
    activeSummaryId
  };
}, [outstandingReview, reviewPresentation]);
```

This preserves the existing first-summary selection without letting presentation state own either table.

- [ ] **Step 3: Reset lifecycle on session changes**

Replace the complete session `useEffect` reset block with:

```ts
setSession(null);
setConnection("connecting");
setPreviewEvent(null);
setReviewLifecycle(emptyReviewLifecycle());
setReviewPresentation(emptyReviewPresentation());
setScrollRequest(null);
setParseError(null);
setCopyState(null);
setUploading(false);
```

This makes refresh, remount, and session changes establish a fresh first baseline while preserving every existing non-review reset.

- [ ] **Step 4: Parse before accepting preview metadata or lifecycle state**

Replace the handoff and working preview listeners with:

```ts
events.addEventListener("handoff-preview", (event) => {
  const next = JSON.parse((event as MessageEvent).data) as HandoffPreviewEvent;
  setSession((current) => (current ? { ...current, pendingHandoff: true } : current));
  setUploading(false);
  acceptPreview({ ...next, kind: "handoff", handoffStatus: "pending" });
});

events.addEventListener("working-preview", (event) => {
  const next = JSON.parse((event as MessageEvent).data) as WorkingPreviewEvent;
  setUploading(false);
  acceptPreview({ ...next, kind: "working" });
});
```

Replace `parseCsv(csv)` with this success-only ingestion function:

```ts
function acceptPreview(nextPreview: PreviewEvent) {
  setParseError(null);

  try {
    const nextTable = parseCsvTable(nextPreview.csv);
    setReviewLifecycle((current) => receiveLatestTable(current, nextTable));
    setReviewPresentation(emptyReviewPresentation());
    setScrollRequest(null);
    setPreviewEvent(nextPreview);
  } catch (err) {
    setParseError(err instanceof Error ? err.message : "CSV parsing failed.");
  }
}
```

The catch block must not clear lifecycle or preview metadata. This is what preserves the last good table and Outstanding Review on client parse failure.

- [ ] **Step 5: Move navigation mutations to presentation state**

Replace the old review-state handlers with:

```ts
function setActiveSummary(id: string) {
  queueReviewScroll(id);
  setReviewPresentation((current) => ({ ...current, activeSummaryId: id }));
}

function setActiveGroup(group: string | null) {
  setReviewPresentation((current) => ({
    ...current,
    activeGroup: current.activeGroup === group ? null : group
  }));
}

function moveActiveSummary(direction: -1 | 1) {
  if (!review?.summary.length) {
    return;
  }

  const activeIndex = Math.max(
    0,
    review.summary.findIndex((item) => item.id === review.activeSummaryId)
  );
  const nextIndex = (activeIndex + direction + review.summary.length) % review.summary.length;
  setActiveSummary(review.summary[nextIndex].id);
}

function verifyChanges() {
  setReviewLifecycle((current) => verifyLatestTable(current));
  setReviewPresentation(emptyReviewPresentation());
  setScrollRequest(null);
}
```

Delete `clearHighlights()`. `verifyChanges()` performs the only baseline promotion in the client.

- [ ] **Step 6: Replace Clear Highlights UI semantics**

At the `ChangeReviewBar` call site, pass:

```tsx
onVerifyChanges={verifyChanges}
```

Rename the component prop from `onClearHighlights` to `onVerifyChanges` in both the destructuring and prop type:

```ts
function ChangeReviewBar({
  review,
  onSetActiveSummary,
  onSetActiveGroup,
  onMoveActiveSummary,
  onVerifyChanges
}: {
  review: ReviewState;
  onSetActiveSummary: (id: string) => void;
  onSetActiveGroup: (group: string | null) => void;
  onMoveActiveSummary: (direction: -1 | 1) => void;
  onVerifyChanges: () => void;
}) {
```

Change the component wrapper, label, and action to:

```tsx
<section className="change-review" aria-label="CSV change review">
```

```tsx
<span className="change-review__updated">Changes since last verification</span>
```

```tsx
<button className="verify-button" type="button" onClick={onVerifyChanges}>
  Verify Changes
</button>
```

Delete the `change-review__cleared` paragraph entirely. The entire `ChangeReviewBar` already renders only when `review` is non-null, so verification and no-visible-change arrivals remove the control automatically.

- [ ] **Step 7: Remove visual-clear branches from table rendering helpers**

In the table scroll effect, reduce the guard to:

```ts
if (!review || !scrollRequest) {
  return;
}
```

Update the helper guards to depend only on review existence:

```ts
function removedColumns(review: ReviewState | null) {
  if (!review) {
    return [];
  }

  return review.summary.flatMap((item) =>
    item.kind === "column_removed"
      ? item.targets.flatMap((target) => (target.kind === "column" ? [target.column] : []))
      : []
  );
}
```

```ts
function removedRows(review: ReviewState | null) {
  if (!review) {
    return [];
  }

  const removedIds = new Set(
    review.summary.flatMap((item) =>
      item.kind === "rows_removed"
        ? item.targets.flatMap((target) => (target.kind === "row" ? [target.rowId] : []))
        : []
    )
  );
  return review.previousTable.rows.filter((row) =>
    removedIds.has(String(row[rowIdColumn] ?? ""))
  );
}
```

In `buildReviewTargetLookup`, change its early return to:

```ts
if (!review) {
  return lookup;
}
```

- [ ] **Step 8: Rename the review action CSS**

In `src/client/src/styles.css`, replace `.clear-button` with `.verify-button` in the shared selector and dedicated rule:

```css
.change-chip,
.verify-button,
.change-detail {
  border: 1px solid transparent;
  border-radius: 8px;
  background: #ffffff;
}
```

```css
.verify-button {
  min-height: 32px;
  padding: 0 11px;
  border-color: #cfd9d4;
  color: #1c4236;
  font-size: 0.8rem;
  font-weight: 850;
}
```

Delete the now-unused `.change-review__cleared` rule at current lines 579-584.

- [ ] **Step 9: Search for stale clear semantics and forbidden new copy**

Run:

```bash
rg -n "Clear Highlights|clearHighlights|onClearHighlights|highlightsCleared|change-review__cleared|clear-button|updates pending|uploads pending" src/client/src
```

Expected: no matches.

Then verify the new copy appears exactly where intended:

```bash
rg -n "Verify Changes|Changes since last verification" src/client/src/main.tsx
```

Expected: `Verify Changes` appears in the button and `Changes since last verification` appears in the review heading. No upload-count copy appears.

- [ ] **Step 10: Run automated verification**

Run:

```bash
npm test
npm run typecheck
npm run build
```

Expected:

- 31 tests pass and 0 fail.
- Both client and server TypeScript checks exit 0.
- Vite client build and server TypeScript build exit 0.

- [ ] **Step 11: Commit the UI integration**

```bash
git add src/client/src/main.tsx src/client/src/styles.css
git commit -m "feat: verify browser-local csv changes"
```

---

### Task 3: Live Agent-First Browser Verification

**Files:**
- Verify: `src/client/src/main.tsx`
- Verify: `src/client/src/reviewLifecycle.ts`
- Verify: `src/client/src/styles.css`
- Read: `docs/superpowers/specs/2026-08-09-browser-local-verified-baseline-design.md`

**Interfaces:**
- Consumes: the completed lifecycle and UI integration from Tasks 1 and 2.
- Produces: evidence that A-to-B-to-C coalescing, local verification, C-to-D comparison, and refresh reset work through the real POST, SSE, parse, diff, and render path.

- [ ] **Step 1: Start the development server**

Run in a dedicated terminal:

```bash
npm run dev
```

Expected: the Companion Website listens at `http://localhost:3000`. If port 3000 is already served by this checkout's `src/server/index.ts`, reuse that process instead of starting another one.

- [ ] **Step 2: Create an agent-first session and open its Viewer URL**

Run:

```bash
review_session_json=$(curl -sS -X POST http://localhost:3000/api/sessions)
review_session_id=$(printf '%s' "$review_session_json" | node -e 'let value=""; process.stdin.on("data", chunk => value += chunk); process.stdin.on("end", () => console.log(JSON.parse(value).sessionId));')
printf 'http://localhost:3000/session/%s\n' "$review_session_id"
```

Open the printed Viewer URL and wait until the status reads `Live`.

- [ ] **Step 3: Upload A as the first baseline**

Run:

```bash
printf '_row_id,name,score\nrow_000001,Ada,10\nrow_000002,Grace,20\nrow_000003,Katherine,30\n' | curl -sS -X PUT -H 'Content-Type: text/csv' -H 'Content-Disposition: attachment; filename="a.csv"' --data-binary @- "http://localhost:3000/api/sessions/$review_session_id/working"
```

Expected in the browser:

- `a.csv` is displayed.
- Three rows are visible.
- No `Changes since last verification` review bar is present.
- No `Verify Changes` button is present.

- [ ] **Step 4: Upload B and verify the first review**

Run:

```bash
printf '_row_id,name,score\nrow_000001,Ada,11\nrow_000002,Grace,20\nrow_000003,Katherine,30\n' | curl -sS -X PUT -H 'Content-Type: text/csv' -H 'Content-Disposition: attachment; filename="b.csv"' --data-binary @- "http://localhost:3000/api/sessions/$review_session_id/working"
```

Expected:

- The review bar reads `Changes since last verification`.
- The summary reports `1 individual cell modified`.
- Ada's score is highlighted.
- `Verify Changes` is present.

- [ ] **Step 5: Upload C without verifying B and prove A-to-C coalescing**

Run:

```bash
printf '_row_id,name,score\nrow_000001,Ada,10\nrow_000002,Grace,22\nrow_000003,Katherine,30\n' | curl -sS -X PUT -H 'Content-Type: text/csv' -H 'Content-Disposition: attachment; filename="c.csv"' --data-binary @- "http://localhost:3000/api/sessions/$review_session_id/working"
```

Expected:

- `c.csv` replaces B immediately.
- The summary still reports exactly `1 individual cell modified`, proving B was discarded. A B-to-C diff would report two modified cells.
- Grace's score is highlighted and Ada's score is not highlighted.
- No upload count, pending count, or version list appears.

- [ ] **Step 6: Verify C locally**

Click `Verify Changes` once.

Expected:

- `c.csv` and its three rows remain visible.
- The review bar, modified-cell highlight, and `Verify Changes` button disappear.
- The server receives no new request and the agent upload flow remains unblocked.

- [ ] **Step 7: Upload D and prove the baseline moved to C**

Run:

```bash
printf '_row_id,name,score\nrow_000001,Ada,10\nrow_000002,Grace,22\nrow_000003,Katherine,33\n' | curl -sS -X PUT -H 'Content-Type: text/csv' -H 'Content-Disposition: attachment; filename="d.csv"' --data-binary @- "http://localhost:3000/api/sessions/$review_session_id/working"
```

Expected:

- The review reports exactly one modified cell.
- Katherine's score is highlighted.
- Grace's verified score of 22 is not highlighted, proving the comparison is C to D.

- [ ] **Step 8: Verify refresh reset**

Refresh the Viewer URL. Confirm the browser shows `No current CSV`, then upload D again with the Step 7 command.

Expected:

- D appears as a fresh first baseline.
- No review bar or `Verify Changes` button appears.
- The agent did not need a new endpoint or upload format.

- [ ] **Step 9: Run final repository verification**

Run:

```bash
npm test
npm run typecheck
npm run build
git status --short
```

Expected:

- 31 tests pass and 0 fail.
- Typecheck and build exit 0.
- `git status --short` contains no uncommitted implementation files from this plan. Preserve any pre-existing `AGENTS.md` or `docs/observations/` changes that were present before implementation.

Do not create an additional commit when this task changes no files.
