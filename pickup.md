# Pickup: CSV Data Work POC

## Current Goal

Build a single-file Markdown skill and a hosted Companion Website POC for AI-assisted CSV data work. The proof is simple: an AI agent edits CSV data with Python, uploads Working CSV previews from the Python Workspace, and the active UI shows the changed table. The backend is a live bridge and short-lived UI handoff shelf, not storage for the latest Working CSV Version.

Use `goal.md` as the current source for product scope.

## Latest Implementation Status

- Added a hosted TypeScript Companion Website POC.
- Added an Express backend with anonymous Upload Session creation, pending UI handoff endpoints, agent Working CSV relay, and Server-Sent Events viewer updates.
- Added a Vite React frontend that creates sessions, provides a user-focused Viewer with connection status and browser source upload, parses relayed CSV previews in the browser, infers lightweight column types, and renders a spreadsheet-like table. Agent-facing URLs and commands come from the session API rather than the Viewer.
- Added direct browser source upload as a Pending Handoff CSV path when the agent does not yet have source data.
- Added the single-file skill at `skills/csv-data-work/SKILL.md`.
- Added run/build notes in `README.md`.
- Verified `npm run typecheck`, `npm run build`, API upload/SSE flow, and desktop/mobile browser rendering.

Current local preview server used for verification:

```sh
PORT=4173 npm run start
```

## Files To Read First

- `goal.md` - updated POC goal and open questions.
- `CONTEXT.md` - glossary for the domain language.
- `docs/adr/0003-agent-owned-working-csv.md` - current ownership decision for Working CSV Versions and Pending Handoff CSVs.
- `docs/adr/0001-poc-hosted-csv-preview-architecture.md` - earlier POC architecture, superseded in part by ADR 0003.
- `docs/adr/0002-defer-s3-version-history-for-poc.md` - earlier S3/history deferral, superseded in part by ADR 0003.
- `prototype_csv_memory_sizing_NOTES.md` - sizing evidence from the throwaway prototype.
- `prototype_csv_memory_sizing.py` - throwaway estimator; keep or delete once the decision trail is no longer needed.

## Decisions Made

- The Companion Website is hosted, not local-only.
- The AI agent runs in a separate Agent Website.
- CSV transformations happen only in the Python Workspace.
- The Companion Website is preview-only.
- Upload Sessions are anonymous; the Upload Token remains a POC placeholder.
- User accounts are out of scope for POC.
- The backend should be TypeScript.
- The POC focuses on active browser Current Table Data and optional Pending Handoff CSVs.
- S3-backed Version History is deferred.
- Databases are deferred.
- Losing active browser preview data is acceptable in the POC; the agent can re-upload the current local Working CSV Version.
- The frontend may store the current parsed table data instead of storing the raw CSV as durable state.
- The POC can attempt to show the whole table; no pagination, virtualization, or preview cell cap yet.
- Agent Working CSV Versions live in the Python Workspace, not backend memory.

## Latest Architecture Direction

POC runtime shape:

1. In the current agent-first focus, the agent creates an anonymous Upload Session with `POST /api/sessions`.
2. The session response gives the agent the Viewer URL and agent-facing session URLs; the agent provides the Viewer URL to the user and retains the operational URLs.
3. In the supported browser-created path, the user creates the Upload Session and shares only its Viewer URL. The agent derives the Companion Website origin, session ID, and agent endpoints from that URL.
4. The user opens the Viewer URL and connects to the live preview stream.
5. If the user uploads the source CSV through the UI, the backend normalizes it as a Pending Handoff CSV until the agent imports and confirms it.
6. Agent edits the CSV using Python in its sandbox and preserves `_row_id`.
7. Agent uploads the current Working CSV Version to `/working` after each meaningful edit.
8. TypeScript backend validates and relays the preview to active viewers, then discards agent working bytes.
9. Active frontend replaces its current parsed table data and renders the updated table.

For the POC, the frontend is allowed to be the only place that holds the current displayed table data. Backend/server state can contain pending UI handoff CSVs for up to 30 minutes, but not ongoing agent working data. Refresh, disconnect, or restart can lose the active preview; the agent can re-upload from the Python Workspace.

## Scale Findings

The prototype showed that production-scale previewing can get expensive quickly:

- `1,000,000 x 100` estimated around `1.3 GiB` raw CSV and `4.8 GiB` backend full-parse peak.
- `500,000 x 500` estimated around `3.2 GiB` raw CSV and `11.9 GiB` backend full-parse peak.
- `100,000 x 500` preview state can be several GiB in the browser.

Despite this, the POC deliberately accepts operator-trusted limits:

- Uploads may target up to `1 GB`.
- Column count may target up to `500`.
- Users should not use files that are too large for their browser to render comfortably.

## Important Tradeoff

Earlier architecture discussion favored S3 object-per-version storage plus a manifest. That is still the likely future shape, but it is not POC scope anymore.

For now, prove the loop before building durability:

- No S3 implementation.
- No Version History UI.
- No database.
- No backend preview artifact storage.
- No production-scale table rendering.

## Open Questions For Next Session

- What deployment target should host the TypeScript backend and frontend?
- What production retention and cleanup policy should replace the POC's in-memory Pending Handoff CSV shelf?
- When should S3-backed Version History be added?
- What packaging should make the final `skills/csv-data-work/SKILL.md` discoverable to future agents?

## Suggested Next Step

Start from `README.md`, `CONTEXT.md`, and ADR 0003 for current behavior. For follow-up work, preserve the agent-owned model: Working CSV Versions stay in the Python Workspace, UI-origin handoffs are short-lived imports, and the backend relays previews without becoming current-data storage.
