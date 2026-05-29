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
