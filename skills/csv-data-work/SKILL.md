# CSV Data Work

Use this skill when a user asks an AI agent to inspect, clean, transform, feature-engineer, summarize, reshape, join, filter, normalize, encode, or otherwise work with CSV data while keeping a hosted Companion Website preview synchronized.

## Core Rules

- Do not edit CSV contents by hand.
- Always inspect and transform CSV data by writing and running Python code in the Python Workspace.
- Keep the original CSV unchanged unless the user explicitly asks to overwrite it.
- Save each transformed output as a new Working CSV Version or as the current working CSV file.
- Upload the latest Working CSV Version to the Companion Website after each meaningful completed transformation.
- Verify every written CSV by reading it back with Python before reporting success.
- Report important row counts, column counts, changed columns, dropped rows, newly missing values, and data-loss risks.
- Ask before destructive operations when intent is ambiguous, including dropping rows, overwriting columns, deleting columns, deduplicating records, or replacing many values.
- If Companion Website upload fails, preserve the Working CSV Version in the Python Workspace and tell the user the local path.

## Companion Website Session

1. Open or create an Upload Session in the hosted Companion Website.
2. Capture the Viewer URL, Upload URL, and Current CSV download URL.
3. Treat the Upload Token as a POC placeholder unless backend auth is re-enabled.
4. Treat the Companion Website as preview-only. It must not be used to transform data.

## Upload Command

Upload a Working CSV Version with:

```sh
curl -X PUT \
  -H 'Content-Type: text/csv' \
  --data-binary @<WORKING_CSV_PATH> \
  <COMPANION_WEBSITE_ORIGIN>/api/sessions/<SESSION_ID>/upload
```

If the Companion Website shows a generated command, prefer that exact command and replace only the file path.

Download the latest Working CSV Version from an Upload Session with:

```sh
curl -o <WORKING_CSV_PATH> \
  <COMPANION_WEBSITE_ORIGIN>/api/sessions/<SESSION_ID>/csv
```

## Edit Loop

For each user request:

1. Restate the intended transformation in plain language when the request is non-trivial.
2. Inspect the current CSV with Python: schema, shape, sample rows, missing values, types, and relevant quality issues.
3. Write Python code for the smallest reviewable transformation that satisfies the request.
4. Run the code and save a Working CSV Version.
5. Read the saved Working CSV Version back with Python.
6. Compare before and after row counts, column counts, key columns, and any requested metrics.
7. Upload the Working CSV Version to the Companion Website.
8. Tell the user what changed, what was verified, and whether the preview upload succeeded.

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
- The latest Working CSV Version was uploaded to the Companion Website, or the upload failure was reported with the local file path.
