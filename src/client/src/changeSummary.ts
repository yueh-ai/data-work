import type { CellChange, CsvDiff, RowChange } from "./csvDiff.js";

export type ChangeTarget =
  | { kind: "column"; column: string }
  | { kind: "row"; rowId: string; rowIndex?: number }
  | { kind: "cell"; rowId: string; column: string; rowIndex: number };

export type ChangeSummaryKind =
  | "column_added"
  | "column_removed"
  | "rows_added"
  | "rows_removed"
  | "column_modified"
  | "cells_modified"
  | "no_change";

export type ChangeSummaryItem = {
  id: string;
  kind: ChangeSummaryKind;
  label: string;
  count: number;
  targets: ChangeTarget[];
};

export function summarizeDiff(diff: CsvDiff): ChangeSummaryItem[] {
  const summary: ChangeSummaryItem[] = [];

  if (diff.columnsAdded.length) {
    summary.push({
      id: "columns-added",
      kind: "column_added",
      label: columnChangeLabel(diff.columnsAdded, "added"),
      count: diff.columnsAdded.length,
      targets: diff.columnsAdded.map((column) => ({ kind: "column", column }))
    });
  }

  if (diff.columnsRemoved.length) {
    summary.push({
      id: "columns-removed",
      kind: "column_removed",
      label: columnChangeLabel(diff.columnsRemoved, "removed"),
      count: diff.columnsRemoved.length,
      targets: diff.columnsRemoved.map((column) => ({ kind: "column", column }))
    });
  }

  if (diff.rowsAdded.length) {
    summary.push({
      id: "rows-added",
      kind: "rows_added",
      label: rowChangeLabel(diff.rowsAdded, "added"),
      count: diff.rowsAdded.length,
      targets: diff.rowsAdded.map(rowTarget)
    });
  }

  if (diff.rowsRemoved.length) {
    summary.push({
      id: "rows-removed",
      kind: "rows_removed",
      label: rowChangeLabel(diff.rowsRemoved, "removed"),
      count: diff.rowsRemoved.length,
      targets: diff.rowsRemoved.map(rowTarget)
    });
  }

  const absorbedCells = new Set<CellChange>();
  if (diff.matchedRowCount > 0) {
    for (const [column, cells] of groupCellsByColumn(diff.cellsModified)) {
      if (cells.length / diff.matchedRowCount < 0.5) {
        continue;
      }

      for (const cell of cells) {
        absorbedCells.add(cell);
      }

      summary.push({
        id: `column-modified:${column}`,
        kind: "column_modified",
        label: columnModifiedLabel(column, cells.length, diff.matchedRowCount),
        count: cells.length,
        targets: cells.map(cellTarget)
      });
    }
  }

  const scatteredCells = diff.cellsModified.filter((cell) => !absorbedCells.has(cell));
  if (scatteredCells.length) {
    summary.push({
      id: "cells-modified",
      kind: "cells_modified",
      label: `${scatteredCells.length} individual ${scatteredCells.length === 1 ? "cell" : "cells"} modified`,
      count: scatteredCells.length,
      targets: scatteredCells.map(cellTarget)
    });
  }

  if (!summary.length) {
    return [
      {
        id: "no-change",
        kind: "no_change",
        label: "No visible data changes detected",
        count: 0,
        targets: []
      }
    ];
  }

  return summary;
}

function columnChangeLabel(columns: string[], action: "added" | "removed") {
  if (columns.length === 1) {
    return `1 column ${action}: ${columns[0]}`;
  }
  return `${columns.length} columns ${action}`;
}

function rowChangeLabel(rows: RowChange[], action: "added" | "removed") {
  return `${rows.length} ${rows.length === 1 ? "row" : "rows"} ${action}`;
}

function rowTarget(row: RowChange): ChangeTarget {
  return {
    kind: "row",
    rowId: row.rowId,
    rowIndex: row.nextRowIndex ?? row.previousRowIndex
  };
}

function cellTarget(cell: CellChange): ChangeTarget {
  return {
    kind: "cell",
    rowId: cell.rowId,
    column: cell.column,
    rowIndex: cell.nextRowIndex
  };
}

function groupCellsByColumn(cells: CellChange[]) {
  const grouped = new Map<string, CellChange[]>();
  for (const cell of cells) {
    const existing = grouped.get(cell.column);
    if (existing) {
      existing.push(cell);
    } else {
      grouped.set(cell.column, [cell]);
    }
  }
  return grouped;
}

function columnModifiedLabel(column: string, changedCount: number, matchedRowCount: number) {
  if (changedCount === matchedRowCount) {
    return `${column} modified in all matched rows`;
  }

  const percent = Math.round((changedCount / matchedRowCount) * 100);
  return `${column} modified in ${percent}% of matched rows`;
}
