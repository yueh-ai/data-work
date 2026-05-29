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
