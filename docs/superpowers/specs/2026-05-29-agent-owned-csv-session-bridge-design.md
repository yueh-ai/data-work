# Agent-Owned CSV Session Bridge Design

## Purpose

Redesign the Companion Website architecture so the backend is a session bridge, not the owner of the current Working CSV Version. The agent workspace owns working data, the UI owns rendered preview state, and the backend only coordinates sessions, relays agent previews to connected viewers, and temporarily holds UI-origin handoff CSVs.

This replaces the older POC assumption that the backend stores `latestCsv` for a session.

## Goals

- Keep the backend from storing the latest/current agent Working CSV Version.
- Support both starting modes:
  - the agent already has data in its workspace,
  - the user uploads the starting CSV through the UI.
- Keep UI-origin uploads previewable immediately after backend row identity normalization.
- Give the agent a simple handoff import flow with explicit confirmation.
- Preserve stable `_row_id` behavior for deterministic UI diffing.
- Update the CSV data-work skill so future agents follow the new ownership model.

## Non-Goals

- Backward compatibility with the current `/api/sessions/:id/upload` and `/api/sessions/:id/csv` behavior.
- Durable backend storage, databases, S3, or version history.
- Backend data cleaning, feature engineering, or dataframe operations.
- Browser-created persistent row identity.
- WebSocket transfer. Server-Sent Events remain sufficient for preview relay.

## Ownership Model

Every workflow uses a Companion Website Upload Session, but the session is a live coordination channel, not a data store.

- **Agent workspace**: authoritative owner of Working CSV Versions after import or agent-side preparation.
- **UI/browser**: owner of the latest rendered preview state and parsed table data while the browser is alive.
- **Backend**: owner of session metadata, active viewer connections, and optional pending UI handoff CSV.
- **Backend memory**: may contain only a pending UI-uploaded handoff CSV, with a default 30-minute expiration and immediate deletion on agent confirmation.

The backend must not retain CSV bytes from agent Working CSV uploads after those bytes have been validated and relayed to currently connected UI viewers.

## Starting Flow: Agent Already Has Data

1. Agent creates or opens a Companion Website Upload Session.
2. Agent opens or provides the Viewer URL so the user can see the preview UI.
3. Agent loads the source CSV in the Python Workspace.
4. Agent creates `_row_id` if missing, or validates and preserves `_row_id` if present.
5. Agent saves and verifies the first Working CSV Version locally.
6. Agent uploads the Working CSV Version to `PUT /api/sessions/:sessionId/working`.
7. Backend validates `_row_id`, emits a preview event to connected viewers, and discards the CSV bytes.
8. UI parses and renders the preview, hiding `_row_id`.

## Starting Flow: Agent Has No Data

1. Agent creates or opens a Companion Website Upload Session.
2. Agent opens or provides the Viewer URL so the user can upload a CSV in the UI.
3. User uploads a source CSV through the UI.
4. UI waits while the backend prepares the preview.
5. Backend validates the CSV enough for preview coordination, adds `_row_id` if missing, preserves and validates `_row_id` if present, and stores the normalized pending handoff in memory.
6. Backend sets `expiresAt` to 30 minutes after upload and emits a CSV event to connected viewers.
7. UI renders the normalized handoff preview, hiding `_row_id`, and shows that the source file is waiting for agent import.
8. Agent polls or requests `GET /api/sessions/:sessionId/handoff/csv`.
9. Agent saves the normalized handoff CSV into the Python Workspace and verifies it can be read.
10. Agent calls `POST /api/sessions/:sessionId/handoff/confirm`.
11. Backend deletes the pending handoff CSV immediately.
12. Agent continues cleaning or feature engineering from the local workspace file and sends future previews through `PUT /api/sessions/:sessionId/working`.

## Backend API

Create a session:

```http
POST /api/sessions
```

Response includes:

```ts
type CreateSessionResponse = {
  sessionId: string;
  uploadToken: string;
  viewerUrl: string;
  workingUploadUrl: string;
  handoffDownloadUrl: string;
  handoffConfirmUrl: string;
  workingUploadCommand: string;
};
```

The browser can derive the handoff upload endpoint from `sessionId`; it does not need to be included as an agent-facing session field.

Fetch session metadata:

```http
GET /api/sessions/:sessionId
```

Response includes metadata only, not CSV bytes:

```ts
type SessionResponse = {
  sessionId: string;
  createdAt: string;
  activeViewers: number;
  pendingHandoff: null | {
    uploadedAt: string;
    expiresAt: string;
    filename: string | null;
    bytes: number;
  };
};
```

Connect to live preview events:

```http
GET /api/sessions/:sessionId/events
```

Upload a UI-origin handoff CSV:

```http
PUT /api/sessions/:sessionId/handoff
```

Behavior:

- Accepts raw CSV bytes from the browser.
- Rejects empty or unparsable CSVs.
- Adds `_row_id` if missing.
- Preserves and validates `_row_id` if present.
- Replaces any existing pending handoff for the session.
- Stores the normalized CSV in memory for 30 minutes.
- Emits a `handoff-preview` SSE event with the normalized handoff CSV and `expiresAt`.

Download the pending handoff CSV:

```http
GET /api/sessions/:sessionId/handoff/csv
```

Behavior:

- Returns the normalized pending handoff CSV.
- Returns `404` if there is no pending handoff or the handoff expired.
- Does not return agent Working CSV Versions.

Confirm handoff import:

```http
POST /api/sessions/:sessionId/handoff/confirm
```

Behavior:

- Intended for the agent after it saves and verifies the handoff CSV in the Python Workspace.
- Deletes the pending handoff CSV immediately.
- Is idempotent for agent ergonomics. If no handoff is pending, it returns success with a `no_pending_handoff` status.

Upload an agent Working CSV Version:

```http
PUT /api/sessions/:sessionId/working
```

Behavior:

- Accepts CSV bytes from the agent.
- Requires `_row_id`.
- Validates `_row_id` values are present and unique.
- Emits a `working-preview` SSE event with the Working CSV.
- Discards CSV bytes after the request has been handled.

## SSE Events

The backend sends session metadata first:

```ts
type SessionEvent = {
  sessionId: string;
  createdAt: string;
  pendingHandoff: boolean;
};
```

Preview events carry renderable CSV bytes to connected viewers. The backend uses separate event names so the UI can show handoff and working states without inspecting payload fields.

Pending UI-uploaded source files use `handoff-preview`:

```ts
type HandoffPreviewEvent = {
  uploadedAt: string;
  expiresAt: string;
  filename: string | null;
  bytes: number;
  csv: string;
};
```

Agent Working CSV Versions use `working-preview`:

```ts
type WorkingPreviewEvent = {
  uploadedAt: string;
  filename: string | null;
  bytes: number;
  csv: string;
};
```

On reconnect, the backend may replay a pending handoff CSV because it still owns that temporary handoff copy. It must not replay the latest agent Working CSV Version because those bytes are not retained.

## Row Identity

The persistent row identity column remains `_row_id`.

Rules:

- UI never creates persistent `_row_id`.
- Backend creates `_row_id` only for UI-origin handoff uploads when the source CSV does not already have it.
- Agent creates `_row_id` for agent-origin source data before the first Working CSV upload.
- Agent preserves `_row_id` in all later transformations.
- Agent assigns new row IDs when adding rows.
- Backend validates `_row_id` on all handoff and working uploads.
- Backend rejects Working CSV uploads that are missing `_row_id`.
- UI hides `_row_id` from display and uses it for diffing.

The CSV skill should include copyable Python helper functions in Markdown, not separate scripts, for:

- validating `_row_id`,
- creating `_row_id` when missing,
- computing the next sequential row ID,
- assigning IDs to new rows,
- writing and reading back a verified Working CSV Version.

## UI Behavior

The UI has two upload/display states:

- **Source handoff preview**: the user uploaded a CSV in the browser; backend normalized it and the agent has not confirmed import yet.
- **Working preview**: the agent uploaded a Working CSV Version through `/working`.

For browser upload:

1. UI sends the raw file to `PUT /handoff`.
2. UI shows a preparation state and does not render the raw local file.
3. UI waits for the normalized `handoff-preview` SSE event.
4. UI renders the normalized CSV and hides `_row_id`.

For working preview:

1. UI receives the `working-preview` SSE event from `/working`.
2. UI parses and renders the CSV.
3. UI compares against the previous browser-held table when available.

If the browser refreshes after a working preview, the backend cannot restore that working CSV. The UI should say that the preview is live and may need the agent to upload again after refresh.

## Skill Updates

Update `skills/csv-data-work/SKILL.md` to teach the new flow.

Core rules to add:

- Always create or open a Companion Website Upload Session before the preview loop.
- If the agent already has data, ensure or validate `_row_id`, save a Working CSV Version, and upload it to `/working`.
- If the agent has no data, create/open a session, open or provide the Viewer URL, wait for the user to upload through the UI, download `/handoff/csv`, save and verify the file locally, then confirm via `/handoff/confirm`.
- Never rely on the backend to recover the latest agent Working CSV Version.
- Treat `/handoff/csv` as a short-lived source import, not as version history.
- Preserve the local Working CSV path in the Python Workspace and use it as the continuation point.

The skill should remove or replace the old instruction that the agent can download the latest Working CSV Version from `/api/sessions/:sessionId/csv`.

## Error Handling

Backend upload errors:

- `csv_parse_error`: CSV cannot be parsed or has no header row.
- `missing_row_id`: `/working` upload lacks `_row_id`.
- `empty_row_id`: `_row_id` is present but one or more values are empty.
- `duplicate_row_id`: `_row_id` has duplicate values.
- `handoff_not_found`: agent requested a missing or expired pending handoff.

Handoff expiration:

- Default expiration is 30 minutes after browser upload.
- Confirming import deletes the handoff immediately.
- Replacing a handoff clears the old timer and starts a new 30-minute timer.
- Expiration should clear CSV bytes and notify connected viewers with handoff metadata, but it should not clear the UI's already-rendered table.

## Testing

Backend tests:

- `PUT /handoff` adds `_row_id` when missing and stores a pending handoff.
- `PUT /handoff` preserves valid `_row_id`.
- `GET /handoff/csv` returns the normalized pending handoff.
- `POST /handoff/confirm` deletes the pending handoff and is idempotent.
- Expired handoff CSVs are not downloadable.
- A second handoff upload replaces the first.
- `PUT /working` rejects missing, empty, and duplicate `_row_id`.
- `PUT /working` emits to viewers but does not leave CSV bytes in session state.

Frontend tests or verification:

- Browser upload waits for backend-normalized preview instead of rendering the local file.
- Handoff preview status differs from working preview status.
- Working preview still drives the existing diff/review overlay when a prior table exists.
- Refresh after a working preview does not promise backend restoration.

Skill review:

- The Markdown includes copyable Python row ID helpers.
- The no-data flow directs the agent to create/open a session, open/provide the UI, download handoff, confirm import, and continue locally.
- The agent-owned-data flow directs the agent to ensure `_row_id` before `/working`.

## Tradeoffs

This design intentionally gives up backend replay of the latest agent Working CSV Version after browser refresh. That is the cost of removing backend current-CSV storage. The recovery path is for the agent to upload the current local Working CSV Version again.

The backend still holds UI-origin handoff CSVs in memory for up to 30 minutes. This is acceptable for the POC because those bytes exist only to transfer data from UI to agent, are deleted on confirm, and are not treated as durable storage.
