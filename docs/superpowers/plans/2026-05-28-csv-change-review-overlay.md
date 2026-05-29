# CSV Change Review Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build deterministic CSV change detection with backend `_row_id` normalization, mechanical change summaries, and Batch Ripple review overlays in the Companion Website.

**Architecture:** The backend normalizes uploaded CSVs by adding or validating `_row_id`, then continues to broadcast normalized CSV text. The frontend keeps pure parsing, diffing, summary, and animation planning in small TypeScript modules, while React state in `main.tsx` only coordinates uploads, previous/current tables, review overlay state, and rendering.

**Tech Stack:** TypeScript, Express, React 19, PapaParse, Node `node:test`, Vite, CSS animations.

---

## File Structure

- Create `src/server/csvRows.ts`
  - Owns server-side `_row_id` normalization and validation.
  - Exports `normalizeUploadedCsv(csv, isFirstUpload)` and typed upload errors.
  - Uses PapaParse so backend CSV round-tripping handles quoted values.

- Modify `src/server/app.ts`
  - Calls `normalizeUploadedCsv` in the upload route before constructing `UploadNotice`.
  - Stores and broadcasts normalized CSV text.
  - Returns diagnostic JSON for `_row_id` contract failures.

- Modify `src/server/index.test.ts`
  - Adds integration tests for first upload normalization, preserving existing `_row_id`, rejecting invalid later uploads, and downloading normalized CSV.

- Create `src/client/src/csvTable.ts`
  - Owns browser CSV parsing, column type inference, warnings, hidden system column filtering, and value normalization.
  - Keeps PapaParse parsing out of `main.tsx`.

- Create `src/client/src/csvDiff.ts`
  - Owns deterministic row-id based diffing.
  - Exports `diffTables(previous, next)`.

- Create `src/client/src/changeSummary.ts`
  - Owns grouped mechanical summaries and animation plan creation.
  - Exports `summarizeDiff(diff)`.

- Create tests:
  - `src/client/src/csvTable.test.ts`
  - `src/client/src/csvDiff.test.ts`
  - `src/client/src/changeSummary.test.ts`

- Modify `src/client/src/main.tsx`
  - Removes inline `Papa.parse`, type inference, and warning helpers.
  - Keeps previous parsed table.
  - Computes diff and summary on later CSV events.
  - Renders `ChangeReviewBar` above the table.
  - Passes review state into `TablePreview`.

- Modify `src/client/src/styles.css`
  - Adds summary chips, detail rows, review overlay classes, ghost rows/columns, and Batch Ripple animations.

---

## Task 1: Backend `_row_id` Normalization Module

**Files:**
- Create: `src/server/csvRows.ts`
- Test: `src/server/index.test.ts`

- [ ] **Step 1: Add backend normalization tests**

Add these tests to `src/server/index.test.ts` below the existing imports. They can live in the same file as the current integration test.

```ts
async function withTestServer(run: (origin: string) => Promise<void>) {
  const app = await createApp({ serveClient: false });
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, resolve);
  });

  try {
    const address = server.address();
    assert(address && typeof address === "object");
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

async function createSession(origin: string) {
  const sessionResponse = await fetch(`${origin}/api/sessions`, { method: "POST" });
  assert.equal(sessionResponse.status, 201);
  return (await sessionResponse.json()) as { sessionId: string; uploadToken: string };
}

async function uploadCsv(origin: string, sessionId: string, csv: string) {
  return fetch(`${origin}/api/sessions/${sessionId}/upload`, {
    method: "PUT",
    headers: {
      "Content-Disposition": 'attachment; filename="working.csv"',
      "Content-Type": "text/csv"
    },
    body: csv
  });
}

async function downloadCsv(origin: string, sessionId: string) {
  const response = await fetch(`${origin}/api/sessions/${sessionId}/csv`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/csv/);
  return response.text();
}
```

Add these test cases:

```ts
test("first upload adds sequential row ids and download returns normalized CSV", async () => {
  await withTestServer(async (origin) => {
    const session = await createSession(origin);

    const uploadResponse = await uploadCsv(origin, session.sessionId, "latitude,total_rooms\n37.88,880\n37.86,7099\n");
    assert.equal(uploadResponse.status, 200);

    assert.equal(await downloadCsv(origin, session.sessionId), "_row_id,latitude,total_rooms\nrow_000001,37.88,880\nrow_000002,37.86,7099\n");
  });
});

test("first upload preserves valid existing row ids", async () => {
  await withTestServer(async (origin) => {
    const session = await createSession(origin);

    const csv = "_row_id,latitude,total_rooms\nrow_000010,37.88,880\nrow_000011,37.86,7099\n";
    const uploadResponse = await uploadCsv(origin, session.sessionId, csv);
    assert.equal(uploadResponse.status, 200);

    assert.equal(await downloadCsv(origin, session.sessionId), csv);
  });
});

test("later upload missing row ids is rejected with diagnostic error", async () => {
  await withTestServer(async (origin) => {
    const session = await createSession(origin);
    assert.equal((await uploadCsv(origin, session.sessionId, "latitude,total_rooms\n37.88,880\n")).status, 200);

    const uploadResponse = await uploadCsv(origin, session.sessionId, "latitude,total_rooms\n37.89,881\n");
    assert.equal(uploadResponse.status, 400);

    assert.deepEqual(await uploadResponse.json(), {
      error: "missing_row_id",
      message: "Upload rejected: missing required _row_id column.",
      detail:
        "This session already has a normalized Working CSV Version with _row_id. The uploaded CSV appears to be an original or reset file rather than a continuation of the current Working CSV Version."
    });
  });
});

test("uploads reject duplicate and empty row ids", async () => {
  await withTestServer(async (origin) => {
    const duplicateSession = await createSession(origin);
    const duplicateResponse = await uploadCsv(
      origin,
      duplicateSession.sessionId,
      "_row_id,latitude\nrow_000001,37.88\nrow_000001,37.86\n"
    );
    assert.equal(duplicateResponse.status, 400);
    assert.equal((await duplicateResponse.json()).error, "duplicate_row_id");

    const emptySession = await createSession(origin);
    const emptyResponse = await uploadCsv(origin, emptySession.sessionId, "_row_id,latitude\nrow_000001,37.88\n,37.86\n");
    assert.equal(emptyResponse.status, 400);
    assert.equal((await emptyResponse.json()).error, "empty_row_id");
  });
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
npm test
```

Expected: FAIL. The first new test downloads the original CSV without `_row_id`, and the later upload test returns `200` instead of `400`.

- [ ] **Step 3: Install backend CSV parsing dependency**

No package install is needed. `papaparse` and `@types/papaparse` are already present in `package.json`.

- [ ] **Step 4: Create `src/server/csvRows.ts`**

Create the file with this implementation:

```ts
import Papa from "papaparse";

const rowIdColumn = "_row_id";
const missingRowIdDetail =
  "This session already has a normalized Working CSV Version with _row_id. The uploaded CSV appears to be an original or reset file rather than a continuation of the current Working CSV Version.";

export type CsvRowUploadErrorCode = "missing_row_id" | "duplicate_row_id" | "empty_row_id" | "csv_parse_error";

export class CsvRowUploadError extends Error {
  constructor(
    public readonly code: CsvRowUploadErrorCode,
    message: string,
    public readonly detail?: string
  ) {
    super(message);
  }
}

export function normalizeUploadedCsv(csv: string, isFirstUpload: boolean) {
  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.trim()
  });

  if (parsed.errors.length) {
    const first = parsed.errors[0];
    throw new CsvRowUploadError("csv_parse_error", `${first.message}${first.row !== undefined ? ` at row ${first.row + 1}` : ""}.`);
  }

  const fields = parsed.meta.fields?.filter(Boolean) ?? [];
  if (!fields.length) {
    throw new CsvRowUploadError("csv_parse_error", "The CSV header row is empty.");
  }

  const rows = parsed.data.filter((row) => Object.values(row).some((value) => String(value ?? "").trim()));
  const hasRowId = fields.includes(rowIdColumn);

  if (!hasRowId && !isFirstUpload) {
    throw new CsvRowUploadError("missing_row_id", "Upload rejected: missing required _row_id column.", missingRowIdDetail);
  }

  const outputFields = hasRowId ? fields : [rowIdColumn, ...fields];
  const outputRows = hasRowId
    ? rows
    : rows.map((row, index) => ({
        [rowIdColumn]: formatRowId(index + 1),
        ...row
      }));

  validateRowIds(outputRows);

  return Papa.unparse(outputRows, {
    columns: outputFields,
    header: true,
    newline: "\n"
  });
}

function validateRowIds(rows: Record<string, string>[]) {
  const seen = new Set<string>();

  for (const row of rows) {
    const rowId = String(row[rowIdColumn] ?? "").trim();
    if (!rowId) {
      throw new CsvRowUploadError("empty_row_id", "Upload rejected: _row_id values must be non-empty.");
    }
    if (seen.has(rowId)) {
      throw new CsvRowUploadError("duplicate_row_id", `Upload rejected: duplicate _row_id value "${rowId}".`);
    }
    seen.add(rowId);
  }
}

function formatRowId(value: number) {
  return `row_${String(value).padStart(6, "0")}`;
}
```

- [ ] **Step 5: Wire backend upload route**

Modify `src/server/app.ts`:

At the top, add:

```ts
import { CsvRowUploadError, normalizeUploadedCsv } from "./csvRows.js";
```

In the upload route, replace:

```ts
const notice: UploadNotice = {
  uploadedAt: new Date().toISOString(),
  filename: parseFilename(req.get("content-disposition")),
  bytes: body.length,
  csv
};

session.latestCsv = csv;
```

with:

```ts
let normalizedCsv: string;
try {
  normalizedCsv = normalizeUploadedCsv(csv, !session.latestCsv);
} catch (err) {
  if (err instanceof CsvRowUploadError) {
    res.status(400).json({
      error: err.code,
      message: err.message,
      ...(err.detail ? { detail: err.detail } : {})
    });
    return;
  }
  throw err;
}

const notice: UploadNotice = {
  uploadedAt: new Date().toISOString(),
  filename: parseFilename(req.get("content-disposition")),
  bytes: Buffer.byteLength(normalizedCsv, "utf8"),
  csv: normalizedCsv
};

session.latestCsv = normalizedCsv;
```

- [ ] **Step 6: Update existing download test expectation**

In the existing test named `uploads can omit auth and the latest CSV can be downloaded`, replace:

```ts
assert.equal(await downloadResponse.text(), csv);
```

with:

```ts
assert.equal(await downloadResponse.text(), "_row_id,latitude,total_rooms\nrow_000001,37.88,880\n");
```

Alternatively, if this test now overlaps with the new first-upload test, delete the old test body after preserving the auth assertion in one of the new tests.

- [ ] **Step 7: Run backend tests**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 8: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 9: Commit backend normalization**

```bash
git add src/server/app.ts src/server/csvRows.ts src/server/index.test.ts
git commit -m "feat: normalize csv row ids on upload"
```

---

## Task 2: Client CSV Parsing Module

**Files:**
- Create: `src/client/src/csvTable.ts`
- Create: `src/client/src/csvTable.test.ts`
- Modify later: `src/client/src/main.tsx`

- [ ] **Step 1: Write `csvTable` tests**

Create `src/client/src/csvTable.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { parseCsvTable, rowIdColumn, visibleColumns } from "./csvTable.js";

test("parseCsvTable parses rows, types, and warnings while preserving row ids", () => {
  const table = parseCsvTable("_row_id,latitude,total_rooms\nrow_000001,37.88,880\nrow_000002,37.86,7099\n");

  assert.deepEqual(table.columns, ["_row_id", "latitude", "total_rooms"]);
  assert.deepEqual(visibleColumns(table), ["latitude", "total_rooms"]);
  assert.equal(table.rows[0][rowIdColumn], "row_000001");
  assert.equal(table.types.latitude, "number");
  assert.equal(table.types.total_rooms, "integer");
  assert.deepEqual(table.warnings, []);
});

test("parseCsvTable treats empty header as an error", () => {
  assert.throws(() => parseCsvTable("\n1,2\n"), /The CSV header row is empty/);
});

test("visibleColumns hides only the reserved row id column", () => {
  const table = parseCsvTable("_row_id,name,_row_id_extra\nrow_000001,Ada,visible\n");

  assert.deepEqual(visibleColumns(table), ["name", "_row_id_extra"]);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
npm test -- src/client/src/csvTable.test.ts
```

Expected: FAIL with module not found for `./csvTable.js`.

- [ ] **Step 3: Create `src/client/src/csvTable.ts`**

Create:

```ts
import Papa from "papaparse";

export const rowIdColumn = "_row_id";

export type ParsedTable = {
  columns: string[];
  rows: Record<string, string>[];
  types: Record<string, string>;
  warnings: string[];
};

export function parseCsvTable(csv: string): ParsedTable {
  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.trim()
  });

  if (parsed.errors.length) {
    const first = parsed.errors[0];
    throw new Error(`${first.message}${first.row !== undefined ? ` at row ${first.row + 1}` : ""}.`);
  }

  const columns = parsed.meta.fields?.filter(Boolean) ?? [];
  const rows = parsed.data.filter((row) => Object.values(row).some((value) => String(value ?? "").trim()));

  if (!columns.length) {
    throw new Error("The CSV header row is empty.");
  }

  return {
    columns,
    rows,
    types: inferColumnTypes(columns, rows),
    warnings: buildWarnings(columns, rows)
  };
}

export function visibleColumns(table: ParsedTable) {
  return table.columns.filter((column) => column !== rowIdColumn);
}

export function normalizeCellValue(value: unknown) {
  return String(value ?? "");
}

function inferColumnTypes(columns: string[], rows: Record<string, string>[]) {
  return Object.fromEntries(
    columns.map((column) => {
      const values = rows.map((row) => String(row[column] ?? "").trim()).filter(Boolean);
      return [column, inferType(values)];
    })
  );
}

function inferType(values: string[]) {
  if (!values.length) {
    return "empty";
  }

  const sample = values.slice(0, 500);
  if (sample.every((value) => /^(true|false|yes|no)$/i.test(value))) {
    return "boolean";
  }
  if (sample.every((value) => /^-?\d+$/.test(value))) {
    return "integer";
  }
  if (sample.every((value) => value !== "" && Number.isFinite(Number(value)))) {
    return "number";
  }
  if (sample.every((value) => !Number.isNaN(Date.parse(value)))) {
    return "date";
  }
  return "text";
}

function buildWarnings(columns: string[], rows: Record<string, string>[]) {
  const warnings: string[] = [];
  if (columns.length > 100) {
    warnings.push("Wide CSV: the browser is rendering every column for this POC.");
  }
  if (rows.length > 10_000) {
    warnings.push("Large CSV: the browser is rendering every row for this POC.");
  }
  return warnings;
}
```

- [ ] **Step 4: Run focused client parsing tests**

Run:

```bash
npm test -- src/client/src/csvTable.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit CSV parsing module**

```bash
git add src/client/src/csvTable.ts src/client/src/csvTable.test.ts
git commit -m "feat: add client csv table parser"
```

---

## Task 3: Deterministic Client Diff Engine

**Files:**
- Create: `src/client/src/csvDiff.ts`
- Create: `src/client/src/csvDiff.test.ts`

- [ ] **Step 1: Write diff engine tests**

Create `src/client/src/csvDiff.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { parseCsvTable } from "./csvTable.js";
import { diffTables } from "./csvDiff.js";

test("diffTables detects added and removed columns without extra cell modifications", () => {
  const previous = parseCsvTable("_row_id,a,b\nrow_000001,1,2\nrow_000002,3,4\n");
  const next = parseCsvTable("_row_id,a,c\nrow_000001,1,5\nrow_000002,3,6\n");

  const diff = diffTables(previous, next);

  assert.deepEqual(diff.columnsAdded, ["c"]);
  assert.deepEqual(diff.columnsRemoved, ["b"]);
  assert.deepEqual(diff.cellsModified, []);
});

test("diffTables detects added rows removed rows and modified cells by row id", () => {
  const previous = parseCsvTable("_row_id,name,score\nrow_000001,Ada,10\nrow_000002,Grace,20\n");
  const next = parseCsvTable("_row_id,name,score\nrow_000001,Ada,11\nrow_000003,Katherine,30\n");

  const diff = diffTables(previous, next);

  assert.deepEqual(diff.rowsAdded.map((row) => row.rowId), ["row_000003"]);
  assert.deepEqual(diff.rowsRemoved.map((row) => row.rowId), ["row_000002"]);
  assert.deepEqual(diff.cellsModified, [
    {
      rowId: "row_000001",
      column: "score",
      previousValue: "10",
      nextValue: "11",
      nextRowIndex: 0,
      previousRowIndex: 0
    }
  ]);
});

test("diffTables ignores row id and treats missing and empty values as equal", () => {
  const previous = parseCsvTable("_row_id,name,score\nrow_000001,Ada,\n");
  const next = parseCsvTable("_row_id,name,score\nrow_000001,Ada,\n");

  const diff = diffTables(previous, next);

  assert.deepEqual(diff.cellsModified, []);
});
```

- [ ] **Step 2: Run focused diff tests and verify they fail**

Run:

```bash
npm test -- src/client/src/csvDiff.test.ts
```

Expected: FAIL with module not found for `./csvDiff.js`.

- [ ] **Step 3: Create `src/client/src/csvDiff.ts`**

Create:

```ts
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

export function diffTables(previous: ParsedTable, next: ParsedTable): CsvDiff {
  const previousVisibleColumns = visibleColumns(previous);
  const nextVisibleColumns = visibleColumns(next);
  const previousColumnSet = new Set(previousVisibleColumns);
  const nextColumnSet = new Set(nextVisibleColumns);
  const columnsAdded = nextVisibleColumns.filter((column) => !previousColumnSet.has(column));
  const columnsRemoved = previousVisibleColumns.filter((column) => !nextColumnSet.has(column));
  const sharedColumns = nextVisibleColumns.filter((column) => previousColumnSet.has(column));
  const previousRows = indexRows(previous);
  const nextRows = indexRows(next);

  const rowsAdded: RowChange[] = [];
  const rowsRemoved: RowChange[] = [];
  const cellsModified: CellChange[] = [];
  let matchedRowCount = 0;

  for (const [rowId, nextEntry] of nextRows) {
    const previousEntry = previousRows.get(rowId);
    if (!previousEntry) {
      rowsAdded.push({ rowId, row: nextEntry.row, nextRowIndex: nextEntry.index });
      continue;
    }

    matchedRowCount += 1;
    for (const column of sharedColumns) {
      const previousValue = normalizeCellValue(previousEntry.row[column]);
      const nextValue = normalizeCellValue(nextEntry.row[column]);
      if (previousValue !== nextValue) {
        cellsModified.push({
          rowId,
          column,
          previousValue,
          nextValue,
          previousRowIndex: previousEntry.index,
          nextRowIndex: nextEntry.index
        });
      }
    }
  }

  for (const [rowId, previousEntry] of previousRows) {
    if (!nextRows.has(rowId)) {
      rowsRemoved.push({ rowId, row: previousEntry.row, previousRowIndex: previousEntry.index });
    }
  }

  return {
    previous,
    next,
    columnsAdded,
    columnsRemoved,
    rowsAdded,
    rowsRemoved,
    cellsModified,
    matchedRowCount
  };
}

function indexRows(table: ParsedTable) {
  return new Map(
    table.rows.map((row, index) => [
      normalizeCellValue(row[rowIdColumn]),
      {
        row,
        index
      }
    ])
  );
}
```

- [ ] **Step 4: Run diff tests**

Run:

```bash
npm test -- src/client/src/csvDiff.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit diff engine**

```bash
git add src/client/src/csvDiff.ts src/client/src/csvDiff.test.ts
git commit -m "feat: add csv diff engine"
```

---

## Task 4: Mechanical Summary Builder

**Files:**
- Create: `src/client/src/changeSummary.ts`
- Create: `src/client/src/changeSummary.test.ts`

- [ ] **Step 1: Write summary tests**

Create `src/client/src/changeSummary.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { summarizeDiff } from "./changeSummary.js";
import { parseCsvTable } from "./csvTable.js";
import { diffTables } from "./csvDiff.js";

test("summarizeDiff groups schema row column and scattered cell changes", () => {
  const previous = parseCsvTable("_row_id,a,b,score,note\nrow_000001,1,x,10,same\nrow_000002,2,y,20,same\nrow_000003,3,z,30,same\nrow_000004,4,q,40,same\n");
  const next = parseCsvTable("_row_id,a,c,score,note\nrow_000001,1,new,11,same\nrow_000002,2,new,22,same\nrow_000003,3,new,33,changed\nrow_000005,5,new,50,same\n");

  const summary = summarizeDiff(diffTables(previous, next));

  assert.deepEqual(
    summary.map((item) => item.kind),
    ["column_added", "column_removed", "rows_added", "rows_removed", "column_modified", "cells_modified"]
  );
  assert.equal(summary[0].label, "1 column added: c");
  assert.equal(summary[1].label, "1 column removed: b");
  assert.equal(summary[2].label, "1 row added");
  assert.equal(summary[3].label, "1 row removed");
  assert.equal(summary[4].label, "score modified in all matched rows");
  assert.equal(summary[5].label, "1 individual cell modified");
});

test("summarizeDiff reports no visible changes", () => {
  const previous = parseCsvTable("_row_id,a\nrow_000001,1\n");
  const next = parseCsvTable("_row_id,a\nrow_000001,1\n");

  const summary = summarizeDiff(diffTables(previous, next));

  assert.deepEqual(summary, [
    {
      id: "no-change",
      kind: "no_change",
      label: "No visible data changes detected",
      count: 0,
      targets: []
    }
  ]);
});

test("summarizeDiff does not create column-level groups when there are zero matched rows", () => {
  const previous = parseCsvTable("_row_id,a\nrow_000001,1\n");
  const next = parseCsvTable("_row_id,a\nrow_000002,2\n");

  const summary = summarizeDiff(diffTables(previous, next));

  assert.deepEqual(
    summary.map((item) => item.kind),
    ["rows_added", "rows_removed"]
  );
});
```

- [ ] **Step 2: Run focused summary tests and verify they fail**

Run:

```bash
npm test -- src/client/src/changeSummary.test.ts
```

Expected: FAIL with module not found for `./changeSummary.js`.

- [ ] **Step 3: Create `src/client/src/changeSummary.ts`**

Create:

```ts
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
  const items: ChangeSummaryItem[] = [];

  if (diff.columnsAdded.length) {
    items.push({
      id: "columns-added",
      kind: "column_added",
      label: formatColumnList(diff.columnsAdded, "added"),
      count: diff.columnsAdded.length,
      targets: diff.columnsAdded.map((column) => ({ kind: "column", column }))
    });
  }

  if (diff.columnsRemoved.length) {
    items.push({
      id: "columns-removed",
      kind: "column_removed",
      label: formatColumnList(diff.columnsRemoved, "removed"),
      count: diff.columnsRemoved.length,
      targets: diff.columnsRemoved.map((column) => ({ kind: "column", column }))
    });
  }

  if (diff.rowsAdded.length) {
    items.push({
      id: "rows-added",
      kind: "rows_added",
      label: `${diff.rowsAdded.length} ${plural("row", diff.rowsAdded.length)} added`,
      count: diff.rowsAdded.length,
      targets: diff.rowsAdded.map(rowTarget)
    });
  }

  if (diff.rowsRemoved.length) {
    items.push({
      id: "rows-removed",
      kind: "rows_removed",
      label: `${diff.rowsRemoved.length} ${plural("row", diff.rowsRemoved.length)} removed`,
      count: diff.rowsRemoved.length,
      targets: diff.rowsRemoved.map(rowTarget)
    });
  }

  const absorbedCells = new Set<string>();
  if (diff.matchedRowCount > 0) {
    const byColumn = groupCellsByColumn(diff.cellsModified);
    for (const [column, cells] of byColumn) {
      if (cells.length / diff.matchedRowCount >= 0.5) {
        cells.forEach((cell) => absorbedCells.add(cellKey(cell)));
        items.push({
          id: `column-modified:${column}`,
          kind: "column_modified",
          label:
            cells.length === diff.matchedRowCount
              ? `${column} modified in all matched rows`
              : `${column} modified in ${Math.round((cells.length / diff.matchedRowCount) * 100)}% of matched rows`,
          count: cells.length,
          targets: cells.map(cellTarget)
        });
      }
    }
  }

  const scatteredCells = diff.cellsModified.filter((cell) => !absorbedCells.has(cellKey(cell)));
  if (scatteredCells.length) {
    items.push({
      id: "cells-modified",
      kind: "cells_modified",
      label: `${scatteredCells.length} individual ${plural("cell", scatteredCells.length)} modified`,
      count: scatteredCells.length,
      targets: scatteredCells.map(cellTarget)
    });
  }

  if (!items.length) {
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

  return items;
}

function formatColumnList(columns: string[], action: "added" | "removed") {
  if (columns.length === 1) {
    return `1 column ${action}: ${columns[0]}`;
  }
  return `${columns.length} columns ${action}`;
}

function groupCellsByColumn(cells: CellChange[]) {
  const grouped = new Map<string, CellChange[]>();
  for (const cell of cells) {
    grouped.set(cell.column, [...(grouped.get(cell.column) ?? []), cell]);
  }
  return grouped;
}

function rowTarget(row: RowChange): ChangeTarget {
  return { kind: "row", rowId: row.rowId, rowIndex: row.nextRowIndex ?? row.previousRowIndex };
}

function cellTarget(cell: CellChange): ChangeTarget {
  return { kind: "cell", rowId: cell.rowId, column: cell.column, rowIndex: cell.nextRowIndex };
}

function cellKey(cell: CellChange) {
  return `${cell.rowId}\u0000${cell.column}`;
}

function plural(word: string, count: number) {
  return count === 1 ? word : `${word}s`;
}
```

- [ ] **Step 4: Run summary tests**

Run:

```bash
npm test -- src/client/src/changeSummary.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run all pure client module tests**

Run:

```bash
npm test -- src/client/src/csvTable.test.ts src/client/src/csvDiff.test.ts src/client/src/changeSummary.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit summary builder**

```bash
git add src/client/src/changeSummary.ts src/client/src/changeSummary.test.ts
git commit -m "feat: summarize csv diffs"
```

---

## Task 5: Wire Review State Into React

**Files:**
- Modify: `src/client/src/main.tsx`

- [ ] **Step 1: Replace inline parsing imports and local types**

In `src/client/src/main.tsx`, remove:

```ts
import Papa from "papaparse";
```

Add:

```ts
import { summarizeDiff, type ChangeSummaryItem } from "./changeSummary.js";
import { diffTables } from "./csvDiff.js";
import { parseCsvTable, type ParsedTable, rowIdColumn, visibleColumns } from "./csvTable.js";
```

Delete the local `ParsedTable` type and the helper functions `inferColumnTypes`, `inferType`, and `buildWarnings` from the bottom of the file.

- [ ] **Step 2: Add review state types**

Add near the other frontend types:

```ts
type ReviewState = {
  previousTable: ParsedTable;
  currentTable: ParsedTable;
  summary: ChangeSummaryItem[];
  activeSummaryId: string | null;
  activeGroup: string | null;
  highlightsCleared: boolean;
};
```

- [ ] **Step 3: Track previous table and compute diffs**

Inside `SessionView`, add state:

```ts
const [review, setReview] = useState<ReviewState | null>(null);
```

Replace the `parseCsv` function with:

```ts
function parseCsv(csv: string) {
  setParseError(null);
  try {
    const nextTable = parseCsvTable(csv);

    setTable((previousTable) => {
      if (!previousTable) {
        setReview(null);
        return nextTable;
      }

      const summary = summarizeDiff(diffTables(previousTable, nextTable));
      setReview({
        previousTable,
        currentTable: nextTable,
        summary,
        activeSummaryId: summary[0]?.id ?? null,
        activeGroup: null,
        highlightsCleared: false
      });
      return nextTable;
    });
  } catch (err) {
    setTable(null);
    setReview(null);
    setParseError(err instanceof Error ? err.message : "CSV parsing failed.");
  }
}
```

- [ ] **Step 4: Add review handlers**

Inside `SessionView`, add:

```ts
function setActiveSummary(id: string) {
  setReview((current) => (current ? { ...current, activeSummaryId: id, highlightsCleared: false } : current));
}

function setActiveGroup(group: string | null) {
  setReview((current) => (current ? { ...current, activeGroup: current.activeGroup === group ? null : group } : current));
}

function moveActiveSummary(direction: -1 | 1) {
  setReview((current) => {
    if (!current || !current.summary.length) {
      return current;
    }
    const activeIndex = Math.max(
      0,
      current.summary.findIndex((item) => item.id === current.activeSummaryId)
    );
    const nextIndex = (activeIndex + direction + current.summary.length) % current.summary.length;
    return { ...current, activeSummaryId: current.summary[nextIndex].id, highlightsCleared: false };
  });
}

function clearHighlights() {
  setReview((current) => (current ? { ...current, highlightsCleared: true } : current));
}
```

- [ ] **Step 5: Render summary bar above table**

Replace:

```tsx
{table ? (
  <TablePreview table={table} filename={csvEvent?.filename} />
) : (
```

with:

```tsx
{table ? (
  <>
    {review ? (
      <ChangeReviewBar
        review={review}
        onSetActiveSummary={setActiveSummary}
        onSetActiveGroup={setActiveGroup}
        onMoveActiveSummary={moveActiveSummary}
        onClearHighlights={clearHighlights}
      />
    ) : null}
    <TablePreview table={table} review={review} filename={csvEvent?.filename} />
  </>
) : (
```

- [ ] **Step 6: Add `ChangeReviewBar` component**

Add below `Metric`:

```tsx
function ChangeReviewBar({
  review,
  onSetActiveSummary,
  onSetActiveGroup,
  onMoveActiveSummary,
  onClearHighlights
}: {
  review: ReviewState;
  onSetActiveSummary: (id: string) => void;
  onSetActiveGroup: (group: string | null) => void;
  onMoveActiveSummary: (direction: -1 | 1) => void;
  onClearHighlights: () => void;
}) {
  const activeIndex = Math.max(
    0,
    review.summary.findIndex((item) => item.id === review.activeSummaryId)
  );
  const visibleDetails = review.activeGroup ? review.summary.filter((item) => groupForSummary(item.kind) === review.activeGroup) : review.summary;

  return (
    <section className={`change-review ${review.highlightsCleared ? "change-review--cleared" : ""}`} aria-label="CSV change review">
      <div className="change-review__top">
        <span className="change-review__updated">Changes from previous upload</span>
        <div className="change-review__chips">
          {review.summary.map((item) => {
            const group = groupForSummary(item.kind);
            return (
              <button
                className={`change-chip change-chip--${group}`}
                data-active={review.activeGroup === group}
                key={item.id}
                type="button"
                onClick={() => onSetActiveGroup(group)}
              >
                {chipLabel(item)}
              </button>
            );
          })}
        </div>
        <div className="change-review__nav">
          <button className="icon-button" type="button" title="Previous change" onClick={() => onMoveActiveSummary(-1)}>
            ‹
          </button>
          <span>{review.summary.length ? `${activeIndex + 1} of ${review.summary.length}` : "0 of 0"}</span>
          <button className="icon-button" type="button" title="Next change" onClick={() => onMoveActiveSummary(1)}>
            ›
          </button>
          <button className="clear-button" type="button" onClick={onClearHighlights}>
            Clear Highlights
          </button>
        </div>
      </div>
      {review.highlightsCleared ? <p className="change-review__cleared">Highlights cleared. The table is showing the current Working CSV Version.</p> : null}
      <div className="change-review__details">
        {visibleDetails.map((item) => (
          <button
            className="change-detail"
            data-active={review.activeSummaryId === item.id}
            key={item.id}
            type="button"
            onClick={() => onSetActiveSummary(item.id)}
          >
            <span>{item.label}</span>
            <strong>{detailBadge(item.kind)}</strong>
          </button>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 7: Add summary helper functions**

Add near formatting helpers:

```ts
function groupForSummary(kind: ChangeSummaryItem["kind"]) {
  if (kind === "column_added") {
    return "schema";
  }
  if (kind === "column_removed" || kind === "rows_removed") {
    return "delete";
  }
  if (kind === "rows_added") {
    return "add";
  }
  if (kind === "column_modified" || kind === "cells_modified") {
    return "modify";
  }
  return "neutral";
}

function chipLabel(item: ChangeSummaryItem) {
  if (item.kind === "column_added") {
    return `+${item.count} ${item.count === 1 ? "column" : "columns"}`;
  }
  if (item.kind === "column_removed") {
    return `-${item.count} ${item.count === 1 ? "column" : "columns"}`;
  }
  if (item.kind === "rows_added") {
    return `+${item.count} ${item.count === 1 ? "row" : "rows"}`;
  }
  if (item.kind === "rows_removed") {
    return `-${item.count} ${item.count === 1 ? "row" : "rows"}`;
  }
  if (item.kind === "column_modified") {
    return `${item.count} ${item.count === 1 ? "cell" : "cells"} in column groups`;
  }
  if (item.kind === "cells_modified") {
    return `${item.count} ${item.count === 1 ? "cell" : "cells"} modified`;
  }
  return item.label;
}

function detailBadge(kind: ChangeSummaryItem["kind"]) {
  if (kind === "column_added") {
    return "schema";
  }
  if (kind === "rows_added") {
    return "add";
  }
  if (kind === "column_removed" || kind === "rows_removed") {
    return "delete";
  }
  if (kind === "column_modified" || kind === "cells_modified") {
    return "modify";
  }
  return "info";
}
```

- [ ] **Step 8: Run typecheck and fix import/type errors**

Run:

```bash
npm run typecheck
```

Expected: PASS after resolving any unused imports from removing `Papa`.

- [ ] **Step 9: Commit React review state wiring**

```bash
git add src/client/src/main.tsx
git commit -m "feat: wire csv review state"
```

---

## Task 6: Table Review Overlay Rendering

**Files:**
- Modify: `src/client/src/main.tsx`

- [ ] **Step 1: Add target lookup helpers**

Add these functions near `detailBadge`:

```ts
function activeSummary(review: ReviewState | null) {
  return review?.summary.find((item) => item.id === review.activeSummaryId) ?? null;
}

function isColumnTarget(review: ReviewState | null, column: string) {
  if (!review || review.highlightsCleared) {
    return false;
  }
  return review.summary.some((item) => item.targets.some((target) => target.kind === "column" && target.column === column));
}

function isActiveColumnTarget(review: ReviewState | null, column: string) {
  const active = activeSummary(review);
  return Boolean(active?.targets.some((target) => target.kind === "column" && target.column === column));
}

function cellClass(review: ReviewState | null, rowId: string, column: string, baseClass = "") {
  if (!review || review.highlightsCleared) {
    return baseClass;
  }

  const classes = [baseClass];
  for (const item of review.summary) {
    if (item.targets.some((target) => target.kind === "cell" && target.rowId === rowId && target.column === column)) {
      classes.push(`review-cell review-cell--${groupForSummary(item.kind)}`);
    }
    if (item.targets.some((target) => target.kind === "column" && target.column === column)) {
      classes.push(`review-cell review-cell--${groupForSummary(item.kind)}`);
    }
  }

  const active = activeSummary(review);
  if (
    active?.targets.some(
      (target) =>
        (target.kind === "cell" && target.rowId === rowId && target.column === column) ||
        (target.kind === "column" && target.column === column)
    )
  ) {
    classes.push("review-cell--active");
  }

  return classes.filter(Boolean).join(" ");
}
```

- [ ] **Step 2: Update `TablePreview` signature**

Replace:

```tsx
function TablePreview({ table, filename }: { table: ParsedTable; filename?: string | null }) {
```

with:

```tsx
function TablePreview({ table, review, filename }: { table: ParsedTable; review: ReviewState | null; filename?: string | null }) {
  const columns = visibleColumns(table);
```

- [ ] **Step 3: Hide `_row_id` in headings and body**

Inside `TablePreview`, replace all `table.columns.map(...)` display loops with `columns.map(...)`.

For the type list, replace:

```tsx
<p>{table.columns.map((column) => `${column}: ${table.types[column]}`).join(" · ")}</p>
```

with:

```tsx
<p>{columns.map((column) => `${column}: ${table.types[column]}`).join(" · ")}</p>
```

- [ ] **Step 4: Add header review classes**

Replace the header column render:

```tsx
{columns.map((column) => (
  <th key={column}>
    <span>{column}</span>
    <small>{table.types[column]}</small>
  </th>
))}
```

with:

```tsx
{columns.map((column) => (
  <th
    className={[
      isColumnTarget(review, column) ? "review-cell" : "",
      isActiveColumnTarget(review, column) ? "review-cell--active" : ""
    ]
      .filter(Boolean)
      .join(" ")}
    key={column}
  >
    <span>{column}</span>
    <small>{table.types[column]}</small>
  </th>
))}
```

- [ ] **Step 5: Add body review classes**

Replace the row render body:

```tsx
{table.rows.map((row, index) => (
  <tr key={index}>
    <td className="row-number">{index + 1}</td>
    {columns.map((column) => (
      <td key={column}>{String(row[column] ?? "")}</td>
    ))}
  </tr>
))}
```

with:

```tsx
{table.rows.map((row, index) => {
  const rowId = String(row[rowIdColumn] ?? "");
  return (
    <tr key={rowId || index}>
      <td className="row-number">{index + 1}</td>
      {columns.map((column) => (
        <td className={cellClass(review, rowId, column)} key={column}>
          {String(row[column] ?? "")}
        </td>
      ))}
    </tr>
  );
})}
```

- [ ] **Step 6: Defer ghost rows and columns to a follow-up task**

Do not add deleted ghost rows/columns in this task. Commit the in-place highlights first, then add ghost rendering after the CSS and summary controls are visible. This keeps the checkpoint small and testable.

- [ ] **Step 7: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit table overlay classes**

```bash
git add src/client/src/main.tsx
git commit -m "feat: highlight csv review targets"
```

---

## Task 7: Summary and Batch Ripple Styling

**Files:**
- Modify: `src/client/src/styles.css`

- [ ] **Step 1: Add summary bar styles**

Append to `src/client/src/styles.css` before `.spin`:

```css
.change-review {
  display: grid;
  gap: 10px;
  margin-bottom: 14px;
  padding: 14px;
  border: 1px solid #dce2dc;
  border-radius: 8px;
  background: #ffffff;
}

.change-review__top {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 12px;
  align-items: center;
}

.change-review__updated {
  color: #5a6864;
  font-size: 0.84rem;
  font-weight: 800;
  white-space: nowrap;
}

.change-review__chips,
.change-review__details,
.change-review__nav {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.change-review__nav {
  align-items: center;
  justify-content: flex-end;
}

.change-review__nav span {
  min-width: 58px;
  color: #5c6b66;
  font-size: 0.82rem;
  font-weight: 850;
  text-align: center;
}

.change-chip,
.clear-button,
.change-detail {
  border: 1px solid transparent;
  border-radius: 8px;
  background: #ffffff;
}

.change-chip {
  min-height: 32px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 0.82rem;
  font-weight: 850;
}

.change-chip[data-active="true"] {
  border-color: currentColor;
}

.change-chip--schema {
  color: #254b75;
  background: #e3f0ff;
}

.change-chip--add {
  color: #0b6541;
  background: #dff6e9;
}

.change-chip--delete {
  color: #8d1d29;
  background: #ffe2e5;
}

.change-chip--modify {
  color: #7c5a00;
  background: #fff0ba;
}

.clear-button {
  min-height: 32px;
  padding: 0 11px;
  border-color: #cfd9d4;
  color: #1c4236;
  font-size: 0.8rem;
  font-weight: 850;
}

.change-detail {
  display: flex;
  min-height: 42px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: min(360px, 100%);
  padding: 8px 10px;
  border-color: #e1e7e3;
  color: #24322e;
  text-align: left;
}

.change-detail[data-active="true"] {
  border-color: #2478cf;
  background: #f2f7ff;
  box-shadow: 0 0 0 3px rgba(36, 120, 207, 0.12);
}

.change-detail span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.change-detail strong {
  flex: 0 0 auto;
  padding: 4px 7px;
  border-radius: 999px;
  color: #53635e;
  background: #eef3ef;
  font-size: 0.68rem;
  text-transform: uppercase;
}

.change-review__cleared {
  margin: 0;
  color: #53635e;
  font-size: 0.86rem;
  font-weight: 750;
}
```

- [ ] **Step 2: Add review cell styles and animations**

Append after the summary styles:

```css
.review-cell {
  position: relative;
}

.review-cell--schema,
.review-cell--add {
  background: #e8f8ef !important;
  box-shadow: inset 0 0 0 1px rgba(25, 148, 94, 0.22);
}

.review-cell--delete {
  color: #7d2931;
  background: #fff0f1 !important;
  box-shadow: inset 0 0 0 1px rgba(200, 42, 55, 0.2);
}

.review-cell--modify {
  background: #fff8da !important;
  box-shadow: inset 0 0 0 1px rgba(193, 146, 15, 0.28);
}

.review-cell--active::after {
  position: absolute;
  inset: 4px;
  z-index: 3;
  border: 2px solid #2478cf;
  border-radius: 7px;
  content: "";
  pointer-events: none;
}

.review-cell::before {
  position: absolute;
  top: 6px;
  right: 5px;
  bottom: 6px;
  width: 5px;
  border-radius: 999px;
  content: "";
  opacity: 0;
  transform: translateY(2px);
  animation: review-spark 3.8s ease-in-out 1 both;
}

.review-cell--schema::before,
.review-cell--add::before {
  left: 5px;
  right: auto;
  background: #16965f;
}

.review-cell--delete::before {
  background: #c82a37;
}

.review-cell--modify::before {
  background: #c9971a;
}

@keyframes review-spark {
  0%,
  12%,
  100% {
    opacity: 0;
    transform: translateY(2px);
  }

  24%,
  62% {
    opacity: 1;
    transform: translateY(0);
  }

  78% {
    opacity: 0.35;
  }
}
```

- [ ] **Step 3: Add responsive styles**

Inside the existing `@media (max-width: 720px)` block, add:

```css
  .change-review__top {
    grid-template-columns: 1fr;
  }

  .change-review__nav {
    justify-content: flex-start;
  }

  .change-detail {
    width: 100%;
  }
```

- [ ] **Step 4: Run typecheck and build**

Run:

```bash
npm run typecheck
npm run build
```

Expected: both PASS.

- [ ] **Step 5: Commit styling**

```bash
git add src/client/src/styles.css
git commit -m "style: add csv review overlay styling"
```

---

## Task 8: Deleted Ghost Rows and Columns

**Files:**
- Modify: `src/client/src/main.tsx`
- Modify: `src/client/src/styles.css`

- [ ] **Step 1: Add removed column list helper**

In `main.tsx`, add:

```ts
function removedColumns(review: ReviewState | null) {
  if (!review || review.highlightsCleared) {
    return [];
  }
  return review.summary.flatMap((item) =>
    item.kind === "column_removed"
      ? item.targets.flatMap((target) => (target.kind === "column" ? [target.column] : []))
      : []
  );
}

function removedRows(review: ReviewState | null) {
  if (!review || review.highlightsCleared) {
    return [];
  }
  const removedIds = new Set(
    review.summary.flatMap((item) =>
      item.kind === "rows_removed" ? item.targets.flatMap((target) => (target.kind === "row" ? [target.rowId] : [])) : []
    )
  );
  return review.previousTable.rows.filter((row) => removedIds.has(String(row[rowIdColumn] ?? "")));
}

function previousRowById(review: ReviewState | null, rowId: string) {
  return review?.previousTable.rows.find((row) => String(row[rowIdColumn] ?? "") === rowId) ?? null;
}
```

- [ ] **Step 2: Merge columns in `TablePreview`**

Inside `TablePreview`, replace:

```ts
const columns = visibleColumns(table);
```

with:

```ts
const removedColumnNames = removedColumns(review);
const columns = [...visibleColumns(table), ...removedColumnNames.filter((column) => !visibleColumns(table).includes(column))];
```

- [ ] **Step 3: Render ghost removed rows**

In the `<tbody>`, after rendering current `table.rows`, append:

```tsx
{removedRows(review).map((row, index) => {
  const rowId = String(row[rowIdColumn] ?? "");
  return (
    <tr className="review-row--removed" key={`removed:${rowId || index}`}>
      <td className="row-number">−</td>
      {columns.map((column) => (
        <td className="review-cell review-cell--delete" key={column}>
          {String(row[column] ?? "")}
        </td>
      ))}
    </tr>
  );
})}
```

- [ ] **Step 4: Make removed columns red**

In the header class list for each column, add:

```ts
removedColumnNames.includes(column) ? "review-cell review-cell--delete review-column--removed" : ""
```

In body `cellClass`, if `removedColumnNames.includes(column)`, pass a base class:

```tsx
<td className={cellClass(review, rowId, column, removedColumnNames.includes(column) ? "review-cell review-cell--delete review-column--removed" : "")} key={column}>
```

For the displayed value in that same cell, use previous table data when the column is removed:

```tsx
{String(removedColumnNames.includes(column) ? previousRowById(review, rowId)?.[column] ?? "" : row[column] ?? "")}
```

- [ ] **Step 5: Add ghost styles**

Append to `styles.css`:

```css
.review-row--removed td,
.review-column--removed {
  opacity: 0.76;
  text-decoration: line-through;
  text-decoration-thickness: 1.5px;
}
```

- [ ] **Step 6: Run checks**

Run:

```bash
npm run typecheck
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit ghost overlay rendering**

```bash
git add src/client/src/main.tsx src/client/src/styles.css
git commit -m "feat: show removed csv data as ghosts"
```

---

## Task 9: Manual Browser Smoke Test

**Files:**
- No source edits expected.

- [ ] **Step 1: Start dev server**

Run:

```bash
PORT=3103 npm run dev
```

Expected: server prints `CSV Companion Website listening on http://localhost:3103`.

- [ ] **Step 2: Create smoke CSV files**

Create `/tmp/csv-review-v1.csv`:

```csv
latitude,longitude,total_rooms,median_income,quality_score
37.88,-122.23,880,5.64,72
37.86,-122.22,945,3.48,61
37.85,-122.25,1274,4.23,68
37.84,-122.25,1627,6.12,91
```

Create `/tmp/csv-review-v2.csv` after downloading the normalized v1 in Step 4. The final v2 should:

- Preserve `_row_id` for existing rows.
- Remove `longitude`.
- Add `income_per_room`.
- Remove one existing row.
- Add one new row with the next id.
- Modify `median_income`, `total_rooms`, or `quality_score`.

- [ ] **Step 3: Open the app**

Open:

```text
http://localhost:3103
```

Create a new Upload Session.

- [ ] **Step 4: Upload v1 and download normalized working CSV**

Use the generated session id:

```bash
curl -X PUT -H 'Content-Type: text/csv' --data-binary @/tmp/csv-review-v1.csv http://localhost:3103/api/sessions/<SESSION_ID>/upload
curl -o /tmp/csv-review-working.csv http://localhost:3103/api/sessions/<SESSION_ID>/csv
```

Expected: downloaded file contains `_row_id`.

- [ ] **Step 5: Upload v2**

After editing `/tmp/csv-review-working.csv` into `/tmp/csv-review-v2.csv`, run:

```bash
curl -X PUT -H 'Content-Type: text/csv' --data-binary @/tmp/csv-review-v2.csv http://localhost:3103/api/sessions/<SESSION_ID>/upload
```

Expected: UI shows summary chips and highlighted table.

- [ ] **Step 6: Verify interactions**

In the browser:

- Click each summary chip.
- Click detail rows.
- Use previous/next.
- Confirm deleted column and row are red ghosts.
- Click `Clear Highlights`.
- Confirm ghosts disappear and highlights quiet.

- [ ] **Step 7: Stop server and commit final fixes**

If browser smoke revealed fixes, apply them and run:

```bash
npm test
npm run typecheck
npm run build
```

Expected: all PASS.

Commit final fixes:

```bash
git add src
git commit -m "fix: polish csv review overlay"
```

If no fixes were needed, do not create an empty commit.

---

## Task 10: Final Verification

**Files:**
- No source edits expected.

- [ ] **Step 1: Run full verification**

Run:

```bash
npm test
npm run typecheck
npm run build
```

Expected: all PASS.

- [ ] **Step 2: Inspect git history**

Run:

```bash
git log --oneline -8
git status --short
```

Expected:

- Recent commits include backend normalization, client parser, diff engine, summary builder, review state, styling, and ghost overlays.
- `git status --short` contains no unexpected source changes.
- Existing unrelated `AGENTS.md` user change may still appear and must not be reverted.
