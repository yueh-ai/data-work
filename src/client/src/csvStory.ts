export type StoryTableShape = {
  columns: string[];
  rowCount: number;
};

export type DataStory = {
  kind: "initial" | "column-removal" | "column-addition" | "structural-change" | "refresh";
  previousColumnCount: number;
  nextColumnCount: number;
  previousRowCount: number;
  nextRowCount: number;
  removedColumns: string[];
  addedColumns: string[];
  rowDelta: number;
  columnDelta: number;
  focusColumns: string[];
  summary: string;
};

export function buildDataStory(previous: StoryTableShape | null, next: StoryTableShape): DataStory {
  if (!previous) {
    return {
      kind: "initial",
      previousColumnCount: 0,
      nextColumnCount: next.columns.length,
      previousRowCount: 0,
      nextRowCount: next.rowCount,
      removedColumns: [],
      addedColumns: next.columns,
      rowDelta: next.rowCount,
      columnDelta: next.columns.length,
      focusColumns: next.columns.slice(0, 4),
      summary: `Initial upload with ${formatCount(next.rowCount, "row")} and ${formatCount(next.columns.length, "column")}.`
    };
  }

  const nextColumnSet = new Set(next.columns);
  const previousColumnSet = new Set(previous.columns);
  const removedColumns = previous.columns.filter((column) => !nextColumnSet.has(column));
  const addedColumns = next.columns.filter((column) => !previousColumnSet.has(column));
  const rowDelta = next.rowCount - previous.rowCount;
  const columnDelta = next.columns.length - previous.columns.length;
  const kind = storyKind(removedColumns, addedColumns, rowDelta);

  return {
    kind,
    previousColumnCount: previous.columns.length,
    nextColumnCount: next.columns.length,
    previousRowCount: previous.rowCount,
    nextRowCount: next.rowCount,
    removedColumns,
    addedColumns,
    rowDelta,
    columnDelta,
    focusColumns: focusColumns(previous.columns, next.columns, removedColumns, addedColumns),
    summary: buildSummary(removedColumns, addedColumns, previous, next)
  };
}

function storyKind(removedColumns: string[], addedColumns: string[], rowDelta: number): DataStory["kind"] {
  if (removedColumns.length && !addedColumns.length) {
    return "column-removal";
  }
  if (addedColumns.length && !removedColumns.length) {
    return "column-addition";
  }
  if (removedColumns.length || addedColumns.length || rowDelta !== 0) {
    return "structural-change";
  }
  return "refresh";
}

function focusColumns(previousColumns: string[], nextColumns: string[], removedColumns: string[], addedColumns: string[]) {
  const anchor = removedColumns[0] ?? addedColumns[0] ?? nextColumns[0];
  const sourceColumns = removedColumns.length ? previousColumns : nextColumns;
  const anchorIndex = Math.max(0, sourceColumns.indexOf(anchor));
  const start = Math.max(0, anchorIndex - 1);
  const selected = sourceColumns.slice(start, start + 3);

  for (const column of nextColumns.slice(Math.max(0, anchorIndex - 1), anchorIndex + 4)) {
    if (selected.length >= 3) {
      break;
    }
    if (!selected.includes(column)) {
      selected.push(column);
    }
  }

  return selected;
}

function buildSummary(removedColumns: string[], addedColumns: string[], previous: StoryTableShape, next: StoryTableShape) {
  const changes: string[] = [];
  if (removedColumns.length) {
    changes.push(`Removed ${formatList(removedColumns)}`);
  }
  if (addedColumns.length) {
    changes.push(`Added ${formatList(addedColumns)}`);
  }
  if (!changes.length) {
    changes.push("Refreshed table");
  }

  const rowText =
    previous.rowCount === next.rowCount
      ? "Row count unchanged"
      : `Row count ${previous.rowCount.toLocaleString()} -> ${next.rowCount.toLocaleString()}`;

  return `${changes.join(". ")}. ${rowText}. Column count ${previous.columns.length} -> ${next.columns.length}.`;
}

function formatList(values: string[]) {
  if (values.length <= 2) {
    return values.join(" and ");
  }
  return `${values.slice(0, 2).join(", ")} and ${values.length - 2} more`;
}

function formatCount(value: number, noun: string) {
  return `${value.toLocaleString()} ${noun}${value === 1 ? "" : "s"}`;
}
