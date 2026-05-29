import type { ChangeSummaryItem, ChangeTarget } from "./changeSummary.js";

export function activeCellClass({
  isActiveCell,
  isActiveRow
}: {
  isActiveCell: boolean;
  isActiveColumn: boolean;
  isActiveRow: boolean;
}) {
  return isActiveCell || isActiveRow ? "review-cell--active" : "";
}

export function removedGhostCellClass({
  isActiveRow,
  isRemovedColumn
}: {
  isActiveRow: boolean;
  isRemovedColumn: boolean;
}) {
  return [
    "review-cell",
    "review-cell--delete",
    isRemovedColumn ? "review-column--removed" : "",
    isActiveRow ? "review-cell--active" : ""
  ].filter(Boolean).join(" ");
}

export function firstReviewScrollTarget(summary: ChangeSummaryItem[], activeSummaryId: string | null): ChangeTarget | null {
  if (!activeSummaryId) {
    return null;
  }

  return summary.find((item) => item.id === activeSummaryId)?.targets[0] ?? null;
}
