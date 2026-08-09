# User-Focused Session View Design

**Date:** 2026-08-09

**Status:** Approved during brainstorming

## Purpose

Make the Viewer page useful to the person reviewing CSV data by removing agent-operational session details that currently dominate the page and push the preview below the visible viewport.

The Viewer should emphasize connection state, browser source upload, current dataset metadata, change review, and the table itself. Agents continue receiving operational URLs from the session API rather than reading them from the Viewer.

## Problem

Every `/session/:sessionId` page currently displays five large agent-facing blocks:

- Viewer URL,
- Upload Token,
- Handoff Download URL,
- Confirm Import URL, and
- Working CSV upload command.

These values are not useful while a user is inspecting data. The Viewer URL repeats the page already open, the Upload Token is an unenforced POC placeholder, and the remaining endpoints and command are intended for agent automation. On short viewports, this control band can hide a successfully received preview below the fold and make the live update appear to have failed.

## Scope

This change will:

- remove all five agent-facing blocks from every Viewer page,
- keep browser source upload available as a compact action in the session header,
- remove client state, local storage, helpers, icons, components, and CSS used only by the removed blocks,
- preserve session creation and both agent-first and browser-first workflows, and
- update workflow documentation so an agent joining a browser-created session derives its endpoints from the shared Viewer URL.

This change will not:

- change the session API response,
- change upload, handoff, or SSE endpoints,
- add authentication or enforce the placeholder Upload Token,
- change CSV parsing, review lifecycle, or verification behavior,
- change browser upload semantics, or
- redesign the remaining notices, metadata cards, review controls, or table.

## Product Decisions

1. The session route is a Viewer, not an agent setup console.
2. Agent-facing URLs and shell commands never appear on `/session/:sessionId`, regardless of whether the session was created by an agent or in the browser.
3. The existing Browser Upload input remains available because browser-origin source handoff is a supported workflow.
4. Browser Upload becomes a compact header action next to the connection status. It remains visible whether or not a table is already displayed.
5. The session API continues returning the Viewer URL and agent-facing URLs. Agent-first callers already receive these values directly.
6. For a browser-created session, the user can share the current Viewer URL. The agent extracts the origin and session ID and derives:
   - `PUT /api/sessions/:sessionId/working`,
   - `GET /api/sessions/:sessionId/handoff/csv`, and
   - `POST /api/sessions/:sessionId/handoff/confirm`.
7. The frontend no longer stores session response fields in local storage because the Viewer does not consume them.

## UI Structure

The Viewer page is ordered as follows:

1. session header with product identity, compact Browser Upload, and connection status,
2. ephemeral-state and preview-arrival notices,
3. current CSV metadata,
4. outstanding change review when present, and
5. the current table or empty state.

The current `control-band`, `InfoBlock`, and command block are removed. The Browser Upload input moves into a small header action group with the connection status. On narrow screens, the existing stacked header behavior may wrap this action group below the product identity without introducing a separate panel.

## Application Behavior

### Agent-first session

1. The agent calls `POST /api/sessions` and keeps the returned operational URLs.
2. The agent gives the Viewer URL to the user.
3. The user opens a clean Viewer page without agent controls.
4. The agent uploads Working CSV previews exactly as before.

### Browser-created session

1. The user creates a session from the start page and is navigated to its Viewer URL.
2. The Viewer displays the Browser Upload action without agent control cards.
3. If the agent needs to join this session, the user shares the Viewer URL from the browser address bar.
4. The agent derives the operational endpoints from the URL and continues the existing handoff import flow.

## Error Handling

Existing behavior remains unchanged:

- a browser upload failure appears as the current parse/upload error message,
- an SSE connection failure changes the connection status,
- a malformed preview preserves the last successfully rendered table and review, and
- the Browser Upload action is disabled and shows its loading state while an upload is in progress.

Removing the operational cards introduces no new network or persistence failure modes.

## Implementation Boundaries

The client cleanup should remove code only when it has no remaining consumer. Expected removals include:

- clipboard copy state and helper,
- `InfoBlock`,
- locally stored session secrets and their read/write helpers,
- client-generated operational URLs and upload command,
- icons used only by those controls, and
- `control-band`, information-block, command-block, and block-heading styles.

The session response and backend endpoint tests remain unchanged. Documentation for agents should explicitly describe deriving session endpoints from a Viewer URL so browser-first handoff remains understandable without the removed UI.

## Verification

### Automated checks

- Run the existing test suite.
- Run TypeScript typechecking.
- Build the production client and server.

### Browser checks

1. Create a session from the API, open its Viewer URL, and confirm none of the five agent-facing controls are present.
2. Confirm Browser Upload and connection status remain visible in the header.
3. Upload a Working CSV from the agent and confirm the preview, metadata, review lifecycle, and `Verify Changes` behavior are unchanged.
4. Create a session from the browser start page and confirm it navigates to the same clean Viewer.
5. Upload a source CSV with Browser Upload and confirm the pending handoff preview still appears.
6. Confirm an agent can derive the handoff download, confirmation, and working upload endpoints from the shared Viewer URL.
7. Check a short desktop viewport and a narrow mobile viewport; the preview or empty state should begin substantially higher on the page, with no horizontal overflow.

## Success Criteria

- Users never see the Viewer URL, Upload Token, Handoff Download, Confirm Import, or Upload Command blocks on a Viewer page.
- Browser Upload remains functional and discoverable.
- Agent-first Working CSV uploads require no workflow or API changes.
- Browser-first source handoff remains functional using the Viewer URL as the shared session identifier.
- The current data preview is visible materially sooner on short viewports.
