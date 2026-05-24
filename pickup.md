# Pickup: CSV Data Work POC

## Current Goal

Build a single-file Markdown skill and a hosted Companion Website POC for AI-assisted CSV data work. The proof is simple: an AI agent edits CSV data with Python, uploads the latest result, and the active UI shows the changed table.

Use `goal.md` as the current source for product scope.

## Files To Read First

- `goal.md` - updated POC goal and open questions.
- `CONTEXT.md` - glossary for the domain language.
- `docs/adr/0001-poc-hosted-csv-preview-architecture.md` - accepted POC architecture.
- `docs/adr/0002-defer-s3-version-history-for-poc.md` - accepted deferral of S3/history.
- `prototype_csv_memory_sizing_NOTES.md` - sizing evidence from the throwaway prototype.
- `prototype_csv_memory_sizing.py` - throwaway estimator; keep or delete once the decision trail is no longer needed.

## Decisions Made

- The Companion Website is hosted, not local-only.
- The AI agent runs in a separate Agent Website.
- CSV transformations happen only in the Python Workspace.
- The Companion Website is preview-only.
- Upload Sessions are anonymous and token-scoped.
- User accounts are out of scope for POC.
- The backend should be TypeScript.
- The POC focuses only on the current CSV state for a session.
- S3-backed Version History is deferred.
- Databases are deferred.
- Losing current uploaded data is acceptable in the POC.
- The frontend may store the current parsed table data instead of storing the raw CSV as durable state.
- The POC can attempt to show the whole table; no pagination, virtualization, or preview cell cap yet.

## Latest Architecture Direction

POC runtime shape:

1. User opens the hosted Companion Website.
2. Companion Website creates an anonymous Upload Session.
3. User gives the Upload Token or upload instructions to the AI agent.
4. Agent edits the CSV using Python in its sandbox.
5. Agent uploads the latest CSV after each meaningful edit.
6. TypeScript backend authenticates the token and coordinates delivery to the active viewer.
7. Active frontend replaces its current parsed table data and renders the updated table.

For the POC, the frontend is allowed to be the only place that holds the current displayed table data. Backend/server state can be transient. Refresh, disconnect, or restart data loss is acceptable.

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

- Should upload-to-browser updates use polling, Server-Sent Events, WebSockets, or a manual refresh button for POC?
- Should the TypeScript backend parse CSV into JSON for the frontend, or should the frontend parse CSV text/blob data?
- Should the POC include direct browser file upload as a fallback path?
- What framework should be used for the hosted TypeScript app?
- Where should the final single-file `SKILL.md` live?

## Suggested Next Step

Start implementation planning from `goal.md`, then answer the update-path question first. The simplest likely implementation is a hosted TypeScript app with anonymous sessions, token-scoped upload, and either Server-Sent Events or a manual refresh path to move the latest uploaded data into the active frontend.
