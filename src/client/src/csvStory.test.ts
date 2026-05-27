import assert from "node:assert/strict";
import test from "node:test";

import { buildDataStory } from "./csvStory.js";

test("builds a removed-column story with unchanged row count and focused preview columns", () => {
  const story = buildDataStory(
    {
      columns: ["longitude", "latitude", "housing_median_age", "total_rooms"],
      rowCount: 20640
    },
    {
      columns: ["latitude", "housing_median_age", "total_rooms"],
      rowCount: 20640
    }
  );

  assert.equal(story.kind, "column-removal");
  assert.deepEqual(story.removedColumns, ["longitude"]);
  assert.deepEqual(story.addedColumns, []);
  assert.equal(story.rowDelta, 0);
  assert.equal(story.columnDelta, -1);
  assert.equal(story.summary, "Removed longitude. Row count unchanged. Column count 4 -> 3.");
  assert.deepEqual(story.focusColumns, ["longitude", "latitude", "housing_median_age"]);
});

test("returns an initial story when there is no previous table", () => {
  const story = buildDataStory(null, {
    columns: ["latitude", "total_rooms"],
    rowCount: 2
  });

  assert.equal(story.kind, "initial");
  assert.equal(story.summary, "Initial upload with 2 rows and 2 columns.");
  assert.deepEqual(story.focusColumns, ["latitude", "total_rooms"]);
});
