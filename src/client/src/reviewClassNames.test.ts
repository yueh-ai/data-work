import assert from "node:assert/strict";
import test from "node:test";

import { activeCellClass, firstReviewScrollTarget, removedGhostCellClass } from "./reviewClassNames.js";

test("removedGhostCellClass marks active removed rows", () => {
  assert.equal(
    removedGhostCellClass({ isActiveRow: true, isRemovedColumn: false }),
    "review-cell review-cell--delete review-cell--active"
  );
});

test("activeCellClass does not draw active rings for column-level summaries", () => {
  assert.equal(activeCellClass({ isActiveCell: false, isActiveColumn: true, isActiveRow: false }), "");
  assert.equal(activeCellClass({ isActiveCell: true, isActiveColumn: false, isActiveRow: false }), "review-cell--active");
});

test("firstReviewScrollTarget returns the first target for the active summary", () => {
  assert.deepEqual(
    firstReviewScrollTarget(
      [
        {
          id: "columns-added",
          kind: "column_added",
          label: "2 columns added",
          count: 2,
          targets: [
            { kind: "column", column: "rooms_per_household" },
            { kind: "column", column: "bedrooms_per_room" }
          ]
        },
        {
          id: "cells-modified",
          kind: "cells_modified",
          label: "1 individual cell modified",
          count: 1,
          targets: [{ kind: "cell", rowId: "row_000003", column: "score", rowIndex: 2 }]
        }
      ],
      "cells-modified"
    ),
    { kind: "cell", rowId: "row_000003", column: "score", rowIndex: 2 }
  );
});
