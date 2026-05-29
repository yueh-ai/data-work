# CSV Data Work

Use this skill when a user asks an AI agent to inspect, clean, transform, feature-engineer, summarize, reshape, join, filter, normalize, encode, or otherwise work with CSV data while keeping a hosted Companion Website preview synchronized.

## Core Rules

- Do not edit CSV contents by hand.
- Always inspect and transform CSV data by writing and running Python code in the Python Workspace.
- Keep the original CSV unchanged unless the user explicitly asks to overwrite it.
- Save each transformed output as a new Working CSV Version or as the current working CSV file.
- Upload the current Working CSV Version to the Companion Website after each meaningful completed transformation.
- Verify every written CSV by reading it back with Python before reporting success.
- Report important row counts, column counts, changed columns, dropped rows, newly missing values, and data-loss risks.
- Ask before destructive operations when intent is ambiguous, including dropping rows, overwriting columns, deleting columns, deduplicating records, or replacing many values.
- If Companion Website upload fails, preserve the Working CSV Version in the Python Workspace and tell the user the local path.

## Companion Website Session

1. Always create or open an Upload Session before the preview loop.
2. Capture the Viewer URL, Working Upload URL, Handoff Download URL, and Handoff Confirm URL.
3. Open or provide the Viewer URL so the user can see the Companion Website.
4. Treat the Companion Website as preview-only. It must not be used to transform data.
5. Treat the backend as a relay and short-lived UI handoff shelf, not as storage for the latest Working CSV Version.

## Upload Command

Upload a Working CSV Version with:

```sh
WORKING_CSV_PATH=working.csv
COMPANION_WEBSITE_ORIGIN=http://localhost:3000
SESSION_ID="${SESSION_ID:?Set SESSION_ID from the session response}"

curl -X PUT \
  -H 'Content-Type: text/csv' \
  --data-binary @"$WORKING_CSV_PATH" \
  "$COMPANION_WEBSITE_ORIGIN/api/sessions/$SESSION_ID/working"
```

## Handoff Import

When the agent has no source CSV yet, wait for the user to upload in the UI, then import the pending handoff:

```sh
SOURCE_CSV_PATH=source.csv
COMPANION_WEBSITE_ORIGIN=http://localhost:3000
SESSION_ID="${SESSION_ID:?Set SESSION_ID from the session response}"

curl -f -o "$SOURCE_CSV_PATH" \
  "$COMPANION_WEBSITE_ORIGIN/api/sessions/$SESSION_ID/handoff/csv"
```

After saving and reading the file successfully in Python, confirm import:

```sh
COMPANION_WEBSITE_ORIGIN=http://localhost:3000
SESSION_ID="${SESSION_ID:?Set SESSION_ID from the session response}"

curl -X POST \
  "$COMPANION_WEBSITE_ORIGIN/api/sessions/$SESSION_ID/handoff/confirm"
```

## Row Identity Helpers

```python
from pathlib import Path
import re

import pandas as pd


ROW_ID_COLUMN = "_row_id"
ROW_ID_RE = re.compile(r"^row_(\d+)$")


def format_row_id(value: int) -> str:
    return f"row_{value:06d}"


def validate_row_id(df: pd.DataFrame) -> None:
    if ROW_ID_COLUMN not in df.columns:
        raise ValueError(f"Missing required {ROW_ID_COLUMN!r} column")

    row_ids = df[ROW_ID_COLUMN].astype("string")
    missing = row_ids.isna() | row_ids.str.strip().eq("")
    if missing.any():
        examples = df.index[missing].tolist()[:10]
        raise ValueError(f"Found empty {ROW_ID_COLUMN} values at rows: {examples}")

    invalid = ~row_ids.str.match(ROW_ID_RE)
    if invalid.any():
        examples = row_ids[invalid].head(10).tolist()
        raise ValueError(f"Found invalid {ROW_ID_COLUMN} values: {examples}")

    duplicated = row_ids.duplicated(keep=False)
    if duplicated.any():
        examples = row_ids[duplicated].head(10).tolist()
        raise ValueError(f"Found duplicate {ROW_ID_COLUMN} values: {examples}")


def next_row_id(df: pd.DataFrame) -> str:
    if ROW_ID_COLUMN not in df.columns or df.empty:
        return format_row_id(1)

    max_id = 0
    for value in df[ROW_ID_COLUMN].dropna().astype(str):
        match = ROW_ID_RE.match(value)
        if match:
            max_id = max(max_id, int(match.group(1)))
    return format_row_id(max_id + 1)


def ensure_row_id(df: pd.DataFrame) -> pd.DataFrame:
    result = df.copy()
    if ROW_ID_COLUMN not in result.columns:
        result.insert(0, ROW_ID_COLUMN, [format_row_id(i) for i in range(1, len(result) + 1)])
    validate_row_id(result)
    return result


def assign_row_ids_to_new_rows(existing_df: pd.DataFrame, new_rows_df: pd.DataFrame) -> pd.DataFrame:
    validate_row_id(existing_df)
    result = new_rows_df.copy()

    if ROW_ID_COLUMN in result.columns:
        row_ids = result[ROW_ID_COLUMN].astype("string")
        if row_ids.notna().any() and row_ids.str.strip().ne("").any():
            validate_row_id(result)
            combined_ids = pd.concat(
                [existing_df[ROW_ID_COLUMN].astype("string"), result[ROW_ID_COLUMN].astype("string")],
                ignore_index=True,
            )
            if combined_ids.duplicated().any():
                examples = combined_ids[combined_ids.duplicated(keep=False)].head(10).tolist()
                raise ValueError(f"New rows reuse existing {ROW_ID_COLUMN} values: {examples}")
            return result

    start = int(ROW_ID_RE.match(next_row_id(existing_df)).group(1))
    assigned = [format_row_id(i) for i in range(start, start + len(result))]
    if ROW_ID_COLUMN in result.columns:
        result[ROW_ID_COLUMN] = assigned
    else:
        result.insert(0, ROW_ID_COLUMN, assigned)
    validate_row_id(pd.concat([existing_df, result], ignore_index=True))
    return result


def write_verified_csv(df: pd.DataFrame, output_path: str | Path, **to_csv_kwargs) -> Path:
    output_path = Path(output_path)
    validate_row_id(df)
    df.to_csv(output_path, index=False, **to_csv_kwargs)

    verified = pd.read_csv(output_path, dtype={ROW_ID_COLUMN: "string"})
    validate_row_id(verified)
    if verified.shape != df.shape:
        raise ValueError(f"Verified CSV shape {verified.shape} does not match expected {df.shape}")
    return output_path
```

## Edit Loop

For each user request:

1. Ensure there is an Upload Session and the user can see the Viewer URL.
2. Establish the local source CSV:
   - If the agent already has a CSV path, read it from the Python Workspace.
   - If the agent has no CSV path, wait for the user to upload through the UI, download `/handoff/csv`, read it with Python, then confirm `/handoff/confirm`.
3. Inspect the current local CSV with Python: schema, shape, sample rows, missing values, types, and relevant quality issues.
4. Ensure or validate `_row_id` before the first Working CSV upload.
5. Write Python code for the smallest reviewable transformation that satisfies the request.
6. Save a Working CSV Version locally and verify it by reading it back.
7. Compare before and after row counts, column counts, key columns, and requested metrics.
8. Upload the Working CSV Version to `/working`.
9. Tell the user what changed, what was verified, and whether the preview upload succeeded.

## Python Workflow

- Prefer `pandas` for tabular transforms when available.
- Use explicit input and output paths.
- Preserve column names unless the user asks to rename them.
- Keep transformation code in a script or notebook cell that can be rerun.
- Avoid chained, opaque transformations when separate named steps would be clearer.
- Use safe parsing options for known delimiters, encodings, and date columns when discovered.
- For large files, inspect samples and schema first, then choose chunking only when necessary.

## Verification Checklist

Before saying a transformation is done:

- The original CSV still exists unchanged, unless overwrite was explicitly requested.
- The Working CSV Version exists at the reported path.
- Python successfully read the Working CSV Version after writing it.
- Row count and column count were checked.
- Requested column changes or computed features were spot-checked.
- Missing values, duplicates, or dropped rows introduced by the change were checked when relevant.
- The current Working CSV Version was uploaded to the Companion Website, or the upload failure was reported with the local file path.
