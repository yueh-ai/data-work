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

  assert.deepEqual(
    diff.rowsAdded.map((row) => row.rowId),
    ["row_000003"]
  );
  assert.deepEqual(
    diff.rowsRemoved.map((row) => row.rowId),
    ["row_000002"]
  );
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
  delete previous.rows[0].score;

  const diff = diffTables(previous, next);

  assert.deepEqual(diff.cellsModified, []);
});
