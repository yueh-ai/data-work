import { normalizeCellValue, type ParsedTable, rowIdColumn, visibleColumns } from "./csvTable.js";

export type RowChange = {
  rowId: string;
  row: Record<string, string>;
  previousRowIndex?: number;
  nextRowIndex?: number;
};

export type CellChange = {
  rowId: string;
  column: string;
  previousValue: string;
  nextValue: string;
  previousRowIndex: number;
  nextRowIndex: number;
};

export type CsvDiff = {
  previous: ParsedTable;
  next: ParsedTable;
  columnsAdded: string[];
  columnsRemoved: string[];
  rowsAdded: RowChange[];
  rowsRemoved: RowChange[];
  cellsModified: CellChange[];
  matchedRowCount: number;
};

type IndexedRow = {
  row: Record<string, string>;
  rowIndex: number;
};

export function diffTables(previous: ParsedTable, next: ParsedTable): CsvDiff {
  const previousColumns = visibleColumns(previous);
  const nextColumns = visibleColumns(next);
  const previousColumnSet = new Set(previousColumns);
  const nextColumnSet = new Set(nextColumns);
  const previousRows = indexRowsById(previous);
  const nextRows = indexRowsById(next);

  const columnsAdded = nextColumns.filter((column) => !previousColumnSet.has(column));
  const columnsRemoved = previousColumns.filter((column) => !nextColumnSet.has(column));
  const sharedColumns = nextColumns.filter((column) => previousColumnSet.has(column));
  const rowsAdded = buildRowsAdded(next.rows, previousRows);
  const rowsRemoved = buildRowsRemoved(previous.rows, nextRows);
  const cellsModified = buildCellsModified(previousRows, nextRows, sharedColumns);

  return {
    previous,
    next,
    columnsAdded,
    columnsRemoved,
    rowsAdded,
    rowsRemoved,
    cellsModified,
    matchedRowCount: countMatchedRows(previousRows, nextRows)
  };
}

function indexRowsById(table: ParsedTable) {
  return new Map<string, IndexedRow>(
    table.rows.map((row, rowIndex) => [normalizeCellValue(row[rowIdColumn]), { row, rowIndex }])
  );
}

function buildRowsAdded(nextRows: Record<string, string>[], previousRows: Map<string, IndexedRow>) {
  return nextRows.flatMap((row, nextRowIndex) => {
    const rowId = normalizeCellValue(row[rowIdColumn]);
    if (previousRows.has(rowId)) {
      return [];
    }
    return [{ rowId, row, nextRowIndex }];
  });
}

function buildRowsRemoved(previousRows: Record<string, string>[], nextRows: Map<string, IndexedRow>) {
  return previousRows.flatMap((row, previousRowIndex) => {
    const rowId = normalizeCellValue(row[rowIdColumn]);
    if (nextRows.has(rowId)) {
      return [];
    }
    return [{ rowId, row, previousRowIndex }];
  });
}

function buildCellsModified(
  previousRows: Map<string, IndexedRow>,
  nextRows: Map<string, IndexedRow>,
  sharedColumns: string[]
) {
  return Array.from(nextRows.entries()).flatMap(([rowId, nextEntry]) => {
    const previousEntry = previousRows.get(rowId);
    if (!previousEntry) {
      return [];
    }

    return sharedColumns.flatMap((column) => {
      const previousValue = normalizeCellValue(previousEntry.row[column]);
      const nextValue = normalizeCellValue(nextEntry.row[column]);
      if (previousValue === nextValue) {
        return [];
      }
      return [
        {
          rowId,
          column,
          previousValue,
          nextValue,
          previousRowIndex: previousEntry.rowIndex,
          nextRowIndex: nextEntry.rowIndex
        }
      ];
    });
  });
}

function countMatchedRows(previousRows: Map<string, IndexedRow>, nextRows: Map<string, IndexedRow>) {
  return Array.from(nextRows.keys()).filter((rowId) => previousRows.has(rowId)).length;
}
