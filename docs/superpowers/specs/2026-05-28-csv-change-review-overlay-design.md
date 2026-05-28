# CSV Change Review Overlay Design

## Purpose

The Companion Website should make each uploaded Working CSV Version feel alive while staying deterministic and trustworthy. When a new CSV arrives after the first upload, the UI should show what changed from the previous version with a compact mechanical summary, table highlights, and Batch Ripple animations.

This design intentionally avoids data-science intent inference. The system reports what changed in the CSV, not why it changed.

## Goals

- Show users which parts of the data changed after each upload.
- Use deterministic frontend diffing based on stable row identity.
- Keep animations expressive but grounded in exact changed cells, rows, and columns.
- Let the AI agent continue working without waiting for user approval.
- Keep the first implementation testable with pure TypeScript diff and summary functions.

## Non-Goals

- Inferring semantic data-work meaning such as imputation, encoding, leakage removal, or feature engineering intent.
- Durable CSV version history.
- Server-side diff computation.
- Virtualized table rendering.
- User approval gates for agent workflow.
- Showing `_row_id` in the table.

## Row Identity

The backend owns row identity normalization.

- On the first upload for a session, if `_row_id` is missing, the backend adds it.
- On the first upload for a session, if `_row_id` already exists, the backend validates it and keeps it.
- On later uploads, `_row_id` is required.
- `_row_id` values must be non-empty and unique within the CSV.
- The first generated ids use sequential values in file order: `row_000001`, `row_000002`, `row_000003`.
- When the AI agent adds rows later, it should continue from the max existing id, such as `row_000241`.
- Row order and row identity are separate. Inserted rows still receive new ids at the end of the sequence.
- `_row_id` is hidden from the UI and excluded from summaries.

The backend decides whether an upload is first or later from session state:

```ts
const isFirstUpload = !session.latestCsv;
```

If a later upload is missing `_row_id`, the backend rejects it with a diagnostic agent-facing error:

```json
{
  "error": "missing_row_id",
  "message": "Upload rejected: missing required _row_id column.",
  "detail": "This session already has a normalized Working CSV Version with _row_id. The uploaded CSV appears to be an original or reset file rather than a continuation of the current Working CSV Version."
}
```

## Diff Pipeline

Use a layered pipeline so detection, summary, and animation remain separate.

```ts
parseCsv(csv) -> ParsedTable
diffTables(previousTable, nextTable) -> CsvDiff
summarizeDiff(diff) -> ChangeSummaryItem[]
planAnimations(diff, summary) -> AnimationPlan
```

### Backend Normalization

The backend parses uploaded CSV enough to validate or add `_row_id`, then stores and broadcasts the normalized CSV. The latest download endpoint returns the normalized Working CSV Version, so the AI agent can continue editing from the canonical session file.

### Frontend Parse

The frontend continues to parse CSV text with PapaParse. It keeps both the previous parsed table and the current parsed table in memory while computing a diff.

First upload behavior:

- Parse and display the normalized table.
- Do not show a change summary because there is no previous version.

Later upload behavior:

- Parse the new normalized table.
- Diff it against the previous table by `_row_id`.
- Enter Review Overlay Mode.

### Diff Rules

- Match rows by `_row_id`.
- Ignore `_row_id` for display, summaries, and animation.
- Added row: `_row_id` exists in the new table but not the previous table.
- Removed row: `_row_id` exists in the previous table but not the new table.
- Added column: visible column exists in the new table but not the previous table.
- Removed column: visible column exists in the previous table but not the new table.
- Modified cell: same `_row_id`, same visible column, normalized value changed.
- Cells in added columns are not also counted as modified cells.
- Cells in removed columns are not also counted as modified cells.
- Empty string and missing value compare as the same value. For comparison, use `String(value ?? "")`.

Renames are deferred. A renamed column appears as one removed column and one added column.

## Summary Builder

The summary builder is mechanical and hierarchical. It groups big changes before reporting individual cells.

Summary order:

1. Schema changes: added columns, removed columns.
2. Row changes: added rows, removed rows.
3. Column-level modifications.
4. Scattered cell modifications.
5. No visible data changes.

Column-level modification rule:

- For each visible column, count matched rows and modified cells.
- If at least 50% of matched rows changed in that column, emit a column-level modification summary.
- If all matched rows changed, label it as all matched rows.
- Only actually changed cells become animation targets.

Examples:

- `1 column added: income_per_room`
- `1 column removed: longitude`
- `3 rows added`
- `1 row removed`
- `median_income modified in 58% of matched rows`
- `median_income modified in all matched rows`
- `7 individual cells modified`
- `No visible data changes detected`

If there are zero matched rows, column-level modification cannot be computed. In that case, summaries should focus on schema and row changes.

Suggested item shape:

```ts
type ChangeSummaryItem = {
  kind:
    | "column_added"
    | "column_removed"
    | "rows_added"
    | "rows_removed"
    | "column_modified"
    | "cells_modified"
    | "no_change";
  label: string;
  count: number;
  targets: ChangeTarget[];
};
```

## Review Overlay Mode

After a later upload, the table enters Review Overlay Mode.

- Current CSV data is displayed.
- Added rows and columns are highlighted in green.
- Modified values are highlighted in yellow.
- Removed rows and columns are retained as red ghost overlays.
- Deleted ghosts remain until the user clicks `Clear Highlights`.
- Summary items can navigate to every change type, including deletions.
- `Clear Highlights` dismisses review markers and removes ghosts. It does not approve the data, block the AI agent, alter CSV contents, or update backend state.

This mode should be presented as a temporary visual overlay, not as pending data.

## Summary UI

The summary appears above the table after every upload that has a previous version.

Top row:

- Updated timestamp.
- Mechanical summary chips:
  - `+1 column`
  - `-1 column`
  - `+3 rows`
  - `2 columns modified`
  - `7 cells modified`
- Previous and next controls.
- `Clear Highlights`.

Expanded detail row:

- Clicking a chip filters the detail list to that category.
- Clicking a detail item jumps to that change group.
- Previous and next navigate between summary detail items, not raw cells.
- If a detail item has many targets, navigation jumps to a representative target and highlights visible targets.

The first implementation does not require a compact change map. The required controls are summary chips, detail items, previous/next, and `Clear Highlights`.

## Animation

Use Batch Ripple Cell Sparks as the core motion.

Colors:

- Green: added rows and columns.
- Red: removed rows and columns.
- Yellow: modified cells.

Behavior:

- Added column: green vertical reveal on the added column.
- Removed column: red vertical ghost ripple.
- Added row: green horizontal row ripple.
- Removed row: red ghost row ripple.
- Column-level modified: yellow batch ripple down the column, but only changed cells light up.
- Scattered cells: yellow individual sparks.

The animation should move in small batches, such as 2-5 targets at a time, rather than one cell at a time. This keeps the data feeling alive while avoiding an expensive animation queue.

For large changes:

- Summary counts reflect the full diff.
- Animation targets only rendered or visible cells in the first implementation.
- Large groups should animate representative visible targets instead of every changed cell.

## Error Handling

Backend upload diagnostics:

- `missing_row_id`: later upload lacks `_row_id`.
- `duplicate_row_id`: `_row_id` values are not unique.
- `empty_row_id`: one or more rows have empty `_row_id`.
- CSV parse failures should return the existing parse/upload error pattern.

The UI should display these as workflow contract diagnostics. They should not blame the human user.

## Testing

Backend tests:

- First upload without `_row_id` adds sequential ids.
- First upload with valid `_row_id` preserves ids.
- Later upload without `_row_id` is rejected.
- Duplicate `_row_id` values are rejected.
- Empty `_row_id` values are rejected.
- Download endpoint returns the normalized Working CSV Version.

Diff tests:

- Added and removed columns are detected.
- Added and removed rows are detected by `_row_id`.
- Modified cells are detected only for matched rows and shared visible columns.
- `_row_id` is excluded.
- Added and removed columns do not produce extra modified cell counts.
- Column-level modification grouping starts at 50% of matched rows.
- Zero matched rows do not produce column-level modification summaries.

UI and integration tests:

- First upload displays table without a change summary.
- Later upload displays summary chips and review overlays.
- Deleted rows and columns remain as ghosts until `Clear Highlights`.
- `Clear Highlights` removes ghost overlays and quiets highlights.
- Summary detail navigation targets the expected changed group.

Browser smoke:

- Upload version one.
- Upload version two with added column, removed column, added row, removed row, and modified cells.
- Verify the summary and highlighted table appear.
