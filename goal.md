# Goal: CSV Data Work Skill + Hosted Companion Website POC

Build a single-file Markdown skill and a hosted companion website POC that help a user chat with an AI agent to process, clean, transform, and feature-engineer CSV files.

The core experience is an AI-assisted CSV editing loop where the agent uses Python code in a sandboxed Python Workspace to modify data, then pushes the latest result to a hosted Companion Website so the user can visually confirm that the table changed.

The POC is intentionally about proving the live edit-and-preview loop. Durable storage, S3-backed version history, production-scale previewing, and robust large-file handling are deferred.

## POC User Experience

1. The user opens the hosted Companion Website.
2. The Companion Website creates an anonymous Upload Session with a Viewer URL and Upload Token.
3. The user gives the Upload Token or upload instructions to the AI agent running in the separate Agent Website.
4. The user provides or points to a CSV file.
5. The agent loads the CSV into the Python Workspace and inspects it with Python.
6. The agent uploads the initial CSV state to the Companion Website.
7. The Companion Website updates the active browser view with the current table data.
8. The user chats with the agent to request data processing or feature engineering.
9. For every data change, the agent writes and runs Python code against the CSV.
10. The agent saves the updated CSV as the current working version in the Python Workspace.
11. The agent uploads the latest CSV to the Companion Website.
12. The active browser view replaces its current table data so the user can inspect the change.
13. The loop continues until the user is satisfied.

## POC Architecture Direction

- The Companion Website is hosted, not a local-only app.
- The AI agent runs in a separate Agent Website.
- The Companion Website uses a TypeScript backend for anonymous session creation and token-scoped upload.
- The POC stores the current parsed table data in the active frontend browser state.
- The backend may act as a transient relay for uploads, but it should not be treated as durable storage.
- Losing the current uploaded data on refresh, disconnect, or backend restart is acceptable for the POC.
- The website displays the whole current table for POC simplicity.
- S3, databases, durable Version History, pagination, row virtualization, sampled preview, and server-generated preview artifacts are deferred.

## What The Skill Should Enable

- Inspect CSV schema, shape, column types, missing values, sample rows, and obvious data quality issues.
- Clean data using reproducible Python code.
- Create, rename, drop, or transform columns.
- Engineer features from existing columns.
- Filter, join, aggregate, normalize, encode, or reshape data when requested.
- Preserve a clear record of what code changed the data.
- Keep the Companion Website synchronized after each meaningful CSV edit.
- Explain transformations in user-friendly language before or after running them.
- Prefer small, reviewable transformations over large opaque edits.

## Core Guardrails

- Do not directly edit CSV contents by hand.
- Always modify CSV data by writing and running code in the Python Workspace.
- Keep the original CSV unchanged unless the user explicitly asks to overwrite it.
- Save transformed outputs as a new or working CSV file in the Python Workspace.
- Upload the latest CSV to the Companion Website after each completed transformation.
- Verify the updated CSV after writing it by reading it back with Python.
- Report important row counts, column changes, or data-loss risks to the user.
- Ask before destructive operations such as dropping rows, overwriting columns, or removing many values when the intent is ambiguous.
- If the Companion Website upload or refresh fails, preserve the updated CSV locally in the Python Workspace and tell the user.

## Companion Website POC Goal

Build a hosted preview surface for the current CSV state during the AI editing loop.

The website should:

- Create anonymous Upload Sessions.
- Provide a Viewer URL for the user.
- Provide an Upload Token or upload endpoint for the agent.
- Accept the initial CSV and repeated updated CSV uploads.
- Replace the current displayed table after each upload.
- Store the current table data in frontend browser state for the POC.
- Display the current CSV as a spreadsheet-like table.
- Show basic dataset metadata such as row count, column count, column names, and inferred column types when practical.
- Clearly show that the current view is ephemeral POC state.
- Handle upload or parse errors with visible, actionable messages.

The website does not perform data transformations itself. Python in the Python Workspace remains the source of truth for all data edits.

## POC Scale Guardrails

These are operator-trusted guardrails, not production guarantees:

- Intended maximum upload size: up to 1 GB.
- Intended maximum column count: up to 500 columns.
- The frontend attempts to render the whole current table.
- The team accepts that very large or very wide CSVs may be slow or fail in the browser during the POC.

## Deferred Production Work

- Store CSV Version history in S3.
- Add an S3 session manifest or database-backed session record.
- Retain multiple versions per Upload Session.
- Add version switching and comparison UI.
- Add pagination, virtualization, sampled preview, or preview cell caps.
- Add backend-generated metadata and preview artifacts.
- Add durable cleanup and retention policies.
- Add authenticated user accounts if the product needs them.

## Expected Final Skill Shape

The final skill should be a single `SKILL.md` file.

It should include:

- Clear trigger conditions for CSV data processing and feature engineering.
- A concise step-by-step workflow for the agent.
- Rules for using Python in the Python Workspace.
- Rules for preserving the original CSV and saving working outputs.
- Instructions for creating or joining an Upload Session.
- Instructions for initial website upload and repeated upload after each edit.
- Verification steps after every transformation.
- A short checklist the agent can follow during each edit loop.

## Expected Website Shape

The POC Companion Website should include:

- A hosted TypeScript app with clear run/deploy instructions.
- Anonymous Upload Session creation.
- Token-scoped upload for the agent.
- A spreadsheet-like preview of the current uploaded data.
- Lightweight metadata for the current table.
- Refresh or live-update behavior suitable for the iterative edit loop.
- Error states for invalid files, failed parsing, and empty data.

## Success Criteria

- A user can give the agent a CSV and ask natural-language data questions or edit requests.
- The agent reliably uses Python code to make every CSV change.
- The original file is protected by default.
- The Companion Website can create an anonymous session.
- The agent can upload the initial CSV and subsequent updated CSVs.
- The active Companion Website view shows the latest uploaded data.
- The user can visually inspect changes in the website while continuing to chat.
- Transformations are reproducible because the code used to make them is available.
- The POC proves the live workflow without requiring durable storage.

## Resolved Design Decisions

- Use a hosted Companion Website, not a local-only site.
- Use anonymous token-scoped Upload Sessions for v1.
- Use a TypeScript backend for session and upload coordination.
- Keep transformations out of the website; Python remains the transformation surface.
- Keep only the current CSV state in POC scope.
- Let the frontend hold current parsed table data for POC display.
- Defer S3-backed Version History until after the POC.

## Open Questions

- Should the upload-to-browser update path use polling, Server-Sent Events, WebSockets, or a simpler POC refresh button?
- Should the backend parse uploaded CSV into JSON for the frontend, or should the frontend parse the uploaded CSV payload?
- What deployment target should host the TypeScript backend and frontend?
- How should the final skill package or reference the Companion Website?
