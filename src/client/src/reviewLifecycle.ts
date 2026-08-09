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

export function verifyReviewSnapshot(
  state: ReviewLifecycleState,
  reviewSnapshot: Pick<OutstandingReview, "previousTable" | "currentTable">
): ReviewLifecycleState {
  if (state.verifiedBaseline !== reviewSnapshot.previousTable) {
    return state;
  }

  return {
    verifiedBaseline: reviewSnapshot.currentTable,
    latestTable: state.latestTable
  };
}

export function verifyLatestTable(state: ReviewLifecycleState): ReviewLifecycleState {
  if (!state.latestTable) {
    return state;
  }

  if (
    state.verifiedBaseline &&
    summarizeDiff(diffTables(state.verifiedBaseline, state.latestTable))[0].kind === "no_change"
  ) {
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
