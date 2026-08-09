import assert from "node:assert/strict";
import test from "node:test";

import { parseCsvTable } from "./csvTable.js";
import {
  buildOutstandingReview,
  emptyReviewLifecycle,
  receiveLatestTable,
  verifyLatestTable
} from "./reviewLifecycle.js";

const tableA = parseCsvTable(
  "_row_id,name,score\nrow_000001,Ada,10\nrow_000002,Grace,20\nrow_000003,Katherine,30\n"
);
const tableB = parseCsvTable(
  "_row_id,name,score\nrow_000001,Ada,11\nrow_000002,Grace,20\nrow_000003,Katherine,30\n"
);
const tableC = parseCsvTable(
  "_row_id,name,score\nrow_000001,Ada,10\nrow_000002,Grace,22\nrow_000003,Katherine,30\n"
);
const tableD = parseCsvTable(
  "_row_id,name,score\nrow_000001,Ada,10\nrow_000002,Grace,22\nrow_000003,Katherine,33\n"
);

test("first preview establishes both lifecycle tables without a review", () => {
  const state = receiveLatestTable(emptyReviewLifecycle(), tableA);

  assert.strictEqual(state.verifiedBaseline, tableA);
  assert.strictEqual(state.latestTable, tableA);
  assert.equal(buildOutstandingReview(state), null);
});

test("later previews coalesce from the verified baseline to the latest table", () => {
  let state = receiveLatestTable(emptyReviewLifecycle(), tableA);
  state = receiveLatestTable(state, tableB);
  state = receiveLatestTable(state, tableC);

  assert.strictEqual(state.verifiedBaseline, tableA);
  assert.strictEqual(state.latestTable, tableC);

  const review = buildOutstandingReview(state);
  assert.ok(review);
  assert.strictEqual(review.previousTable, tableA);
  assert.strictEqual(review.currentTable, tableC);
  assert.deepEqual(review.summary.map((item) => item.label), ["1 individual cell modified"]);
  assert.deepEqual(review.summary[0].targets, [
    { kind: "cell", rowId: "row_000002", column: "score", rowIndex: 1 }
  ]);
});

test("verification promotes the latest table and starts the next comparison there", () => {
  let state = receiveLatestTable(emptyReviewLifecycle(), tableA);
  state = receiveLatestTable(state, tableC);
  state = verifyLatestTable(state);

  assert.strictEqual(state.verifiedBaseline, tableC);
  assert.strictEqual(state.latestTable, tableC);
  assert.equal(buildOutstandingReview(state), null);

  state = receiveLatestTable(state, tableD);
  const review = buildOutstandingReview(state);
  assert.ok(review);
  assert.strictEqual(review.previousTable, tableC);
  assert.strictEqual(review.currentTable, tableD);
  assert.deepEqual(review.summary.map((item) => item.label), ["1 individual cell modified"]);
});

test("no-change and reversal previews leave the verified baseline unchanged", () => {
  const equivalentA = parseCsvTable(
    "_row_id,name,score\nrow_000001,Ada,10\nrow_000002,Grace,20\nrow_000003,Katherine,30\n"
  );

  let state = receiveLatestTable(emptyReviewLifecycle(), tableA);
  state = receiveLatestTable(state, equivalentA);
  assert.strictEqual(state.verifiedBaseline, tableA);
  assert.strictEqual(state.latestTable, equivalentA);
  assert.equal(buildOutstandingReview(state), null);

  state = verifyLatestTable(state);
  assert.strictEqual(state.verifiedBaseline, tableA);

  state = receiveLatestTable(state, tableB);
  assert.ok(buildOutstandingReview(state));
  state = receiveLatestTable(state, equivalentA);
  assert.strictEqual(state.verifiedBaseline, tableA);
  assert.equal(buildOutstandingReview(state), null);
});

test("empty lifecycle resets both tables", () => {
  const populated = receiveLatestTable(emptyReviewLifecycle(), tableA);
  assert.ok(populated.latestTable);

  assert.deepEqual(emptyReviewLifecycle(), {
    verifiedBaseline: null,
    latestTable: null
  });
});
