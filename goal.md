# Goal: CSV Data Work Skill

Build a single-file Markdown skill that helps a user chat with an AI agent to process, clean, transform, and feature-engineer CSV files.

The core experience is an AI-assisted CSV editing loop where the agent uses Python code in a sandbox to modify data, then keeps a companion website updated so the user can see the latest CSV state visually.

## User Experience

1. The user provides or points to a CSV file.
2. The agent loads the CSV into the sandbox and inspects it with Python.
3. The agent submits/uploads the CSV to the companion website.
4. The website is opened side-by-side so the user can visually inspect the current data.
5. The user chats with the agent to request data processing or feature engineering.
6. For every data change, the agent writes and runs Python code against the CSV.
7. The agent saves the updated CSV as the current working version.
8. The agent reuploads the updated CSV to the website.
9. The user sees the website refresh or update with the latest transformed data.
10. The loop continues until the user is satisfied.

## What The Skill Should Enable

- Inspect CSV schema, shape, column types, missing values, sample rows, and obvious data quality issues.
- Clean data using reproducible Python code.
- Create, rename, drop, or transform columns.
- Engineer features from existing columns.
- Filter, join, aggregate, normalize, encode, or reshape data when requested.
- Preserve a clear record of what code changed the data.
- Keep the website synchronized after each meaningful CSV edit.
- Explain transformations in user-friendly language before or after running them.
- Prefer small, reviewable transformations over large opaque edits.

## Core Guardrails

- Do not directly edit CSV contents by hand.
- Always modify CSV data by writing and running code in the sandbox.
- Keep the original CSV unchanged unless the user explicitly asks to overwrite it.
- Save transformed outputs as a new or working CSV file.
- Reupload the latest CSV to the website after each completed transformation.
- Verify the updated CSV after writing it by reading it back with Python.
- Report important row counts, column changes, or data-loss risks to the user.
- Ask before destructive operations such as dropping rows, overwriting columns, or removing many values when the intent is ambiguous.

## Website Integration Goal

The website is part of the workflow, not just a final export target.

The skill should instruct the agent to:

- Upload the initial CSV to the website before data editing begins.
- Open the website in a side-by-side browser view when possible.
- Reupload the updated CSV after each code-driven transformation.
- Use the website as the user-facing visual confirmation surface.
- Mention when the website upload or refresh fails, then continue to preserve the updated CSV locally.

## Expected Final Skill Shape

The final skill should be a single `SKILL.md` file.

It should include:

- Clear trigger conditions for CSV data processing and feature engineering.
- A concise step-by-step workflow for the agent.
- Rules for using Python in the sandbox.
- Rules for versioning or preserving CSV outputs.
- Instructions for initial website upload and repeated reupload.
- Verification steps after every transformation.
- A short checklist the agent can follow during each edit loop.

## Success Criteria

- A user can give the agent a CSV and ask natural-language data questions or edit requests.
- The agent reliably uses Python code to make every CSV change.
- The original file is protected by default.
- The companion website shows the initial data and every updated version.
- The user can visually inspect changes in the website while continuing to chat.
- Transformations are reproducible because the code used to make them is available.
- The workflow feels like an interactive data notebook plus a live web preview, without requiring the user to manage files manually.

## Open Questions

- What is the website URL or upload endpoint?
- Does the website accept direct file uploads, an API request, or browser-based drag-and-drop?
- Should each transformed CSV be saved as a timestamped version, a numbered version, or a stable working file?
- Should the skill also save the Python scripts used for each transformation?
- How should the agent handle very large CSV files that may be slow to upload or preview?
- Should the website refresh automatically after upload, or should the agent trigger a refresh?
