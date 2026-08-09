# User-Focused Session View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove agent-operational cards from every Viewer page, keep browser source upload as a compact header action, and preserve both agent-first and browser-first session workflows.

**Architecture:** Extract the session header into a small React component that owns the Browser Upload action and connection indicator, then delete the operational control band and its client-only persistence/copy machinery from `SessionView`. Keep the backend session response and endpoint contract unchanged; update agent and project documentation so a browser-created session can be joined from its Viewer URL.

**Tech Stack:** TypeScript 5.9, React 19, React DOM server rendering for component tests, Lucide React, CSS, Node's built-in test runner through `tsx --test`, Vite 7.

## Global Constraints

- Remove Viewer URL, Upload Token, Handoff Download, Confirm Import, and Upload Command from every `/session/:sessionId` Viewer page.
- Keep Browser Upload visible whether or not a table is displayed.
- Put Browser Upload in a compact header action group next to connection status.
- Preserve agent-first and browser-first session behavior.
- Do not change `POST /api/sessions` or any upload, handoff, or SSE endpoint.
- Do not add authentication or change the placeholder Upload Token contract.
- Do not change CSV parsing, preview ingestion, review lifecycle, or `Verify Changes` behavior.
- Do not add dependencies.
- Remove local storage, clipboard, helpers, icons, components, and CSS only when they have no remaining consumer.
- Reference `docs/superpowers/specs/2026-08-09-user-focused-session-view-design.md` for the approved behavior.

## File Structure

- Create `src/client/src/sessionHeader.tsx`: focused session header containing product identity, Browser Upload, and connection status.
- Create `src/client/src/sessionHeader.test.ts`: server-rendered markup tests for user-facing header content and upload state.
- Modify `src/client/src/main.tsx`: consume `SessionHeader`; remove agent controls, secret persistence, clipboard state, and generated operational URLs.
- Modify `src/client/src/styles.css`: add the compact header action layout and remove styles used only by deleted controls.
- Modify `skills/csv-data-work/SKILL.md`: explain how an agent joins from a Viewer URL and derives operational endpoints.
- Modify `README.md`: document the clean Viewer and the Viewer-URL-to-session-ID workflow.
- Modify `pickup.md`: replace the stale claim that the Viewer displays agent URLs and commands.
- Modify `docs/demos/agent-first-client-demo-design.md`: remove the stale short-viewport warning about the deleted control band.

---

### Task 1: User-Focused Session Header and Viewer Cleanup

**Files:**
- Create: `src/client/src/sessionHeader.tsx`
- Create: `src/client/src/sessionHeader.test.ts`
- Modify: `src/client/src/main.tsx:3-40,118-175,199-259,316-421,482-520,750-809`
- Modify: `src/client/src/styles.css:20-38,120-217,678-710`

**Interfaces:**
- Consumes: `connection: ConnectionState`, `uploading: boolean`, and `onUploadFile(file: File | null): void` from `SessionView`.
- Produces: `SessionHeader` and exported `ConnectionState = "idle" | "connecting" | "live" | "error"`.
- Keeps: the existing `uploadFile(file)` handler, `PUT /api/sessions/:sessionId/handoff`, connection state transitions, and Browser Upload labels `Browser Upload` / `Uploading`.

- [ ] **Step 1: Write the failing session-header tests**

Create `src/client/src/sessionHeader.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { SessionHeader } from "./sessionHeader.js";

const agentControlLabels = [
  "Viewer URL",
  "Upload Token",
  "Handoff Download",
  "Confirm Import",
  "Upload Command"
];

test("session header exposes browser upload and live connection without agent controls", () => {
  const markup = renderToStaticMarkup(
    createElement(SessionHeader, {
      connection: "live",
      uploading: false,
      onUploadFile: () => undefined
    })
  );

  assert.match(markup, /CSV Companion/);
  assert.match(markup, /Upload Session/);
  assert.match(markup, /Browser Upload/);
  assert.match(markup, /Live/);
  assert.match(markup, /type="file"/);
  assert.match(markup, /accept="\.csv,text\/csv"/);

  for (const label of agentControlLabels) {
    assert.equal(markup.includes(label), false, `unexpected agent control: ${label}`);
  }
});

test("session header shows and disables the browser upload while uploading", () => {
  const markup = renderToStaticMarkup(
    createElement(SessionHeader, {
      connection: "connecting",
      uploading: true,
      onUploadFile: () => undefined
    })
  );

  assert.match(markup, /Uploading/);
  assert.match(markup, /Connecting/);
  assert.match(markup, /disabled=""/);
});
```

- [ ] **Step 2: Run the targeted test and verify it fails**

Run:

```bash
npx tsx --test src/client/src/sessionHeader.test.ts
```

Expected: FAIL because `./sessionHeader.js` does not exist.

- [ ] **Step 3: Implement the focused session header**

Create `src/client/src/sessionHeader.tsx`:

```tsx
import {
  Activity,
  AlertTriangle,
  FileSpreadsheet,
  LoaderCircle,
  Upload
} from "lucide-react";

export type ConnectionState = "idle" | "connecting" | "live" | "error";

export function SessionHeader({
  connection,
  uploading,
  onUploadFile
}: {
  connection: ConnectionState;
  uploading: boolean;
  onUploadFile: (file: File | null) => void;
}) {
  return (
    <header className="top-bar">
      <div className="product-lockup">
        <div className="brand-mark brand-mark--small" aria-hidden="true">
          <FileSpreadsheet size={22} />
        </div>
        <div>
          <p className="eyebrow">CSV Companion</p>
          <h1>Upload Session</h1>
        </div>
      </div>

      <div className="session-actions">
        <label className="file-upload">
          <input
            type="file"
            accept=".csv,text/csv"
            aria-label="Upload source CSV"
            disabled={uploading}
            onChange={(event) => onUploadFile(event.currentTarget.files?.[0] ?? null)}
          />
          {uploading ? <LoaderCircle className="spin" size={18} /> : <Upload size={18} />}
          <span>{uploading ? "Uploading" : "Browser Upload"}</span>
        </label>

        <div className={`status-pill status-pill--${connection}`}>
          {connection === "live" ? (
            <Activity size={15} />
          ) : connection === "connecting" ? (
            <LoaderCircle className="spin" size={15} />
          ) : (
            <AlertTriangle size={15} />
          )}
          <span>{connectionLabel(connection)}</span>
        </div>
      </div>
    </header>
  );
}

function connectionLabel(connection: ConnectionState) {
  if (connection === "live") {
    return "Live";
  }
  if (connection === "connecting") {
    return "Connecting";
  }
  if (connection === "error") {
    return "Disconnected";
  }
  return "Idle";
}
```

- [ ] **Step 4: Run the targeted test and verify it passes**

Run:

```bash
npx tsx --test src/client/src/sessionHeader.test.ts
```

Expected: 2 tests pass and 0 fail.

- [ ] **Step 5: Integrate `SessionHeader` and delete agent-control state and markup**

In `src/client/src/main.tsx`, reduce the Lucide imports to the icons still used by this file and import the extracted header:

```ts
import {
  Activity,
  AlertTriangle,
  FileSpreadsheet,
  LoaderCircle,
  Plus,
  RefreshCw
} from "lucide-react";

import { SessionHeader, type ConnectionState } from "./sessionHeader.js";
```

Reduce the create response type to the only response field consumed by the browser after session creation:

```ts
type SessionCreateResponse = {
  viewerUrl: string;
};
```

In `CreateSession.createSession()`, remove `saveSessionSecrets(data)` so the success path becomes:

```ts
if (!response.ok) {
  throw new Error("Session creation failed.");
}

window.history.pushState(null, "", data.viewerUrl);
window.dispatchEvent(new PopStateEvent("popstate"));
```

In `SessionView`:

- delete the local `ConnectionState` type,
- delete `copyState`, `secrets`, and the `setCopyState(null)` reset,
- retain only `const handoffUploadUrl = `/api/sessions/${sessionId}/handoff`;`,
- delete `workingUploadUrl`, `handoffDownloadUrl`, `handoffConfirmUrl`, `viewerUrl`, and `command`, and
- delete the `copy(label, value)` function.

Replace the existing `<header>` and the entire `<section className="control-band">` with:

```tsx
<SessionHeader
  connection={connection}
  uploading={uploading}
  onUploadFile={uploadFile}
/>
```

Delete the now-unused `InfoBlock`, `saveSessionSecrets`, `getSessionSecrets`, and `connectionLabel` functions. Do not change `uploadFile`, preview ingestion, notices, metadata, table rendering, or review behavior.

- [ ] **Step 6: Replace the control-band CSS with compact header actions**

In `src/client/src/styles.css`, delete:

- the global `code` rule,
- `.control-band`,
- `.info-block`,
- `.command-block`,
- `.block-heading` and `.block-heading span`,
- `.file-upload--disabled`,
- the entire `@media (max-width: 1200px)` block, and
- `.control-band` / `.command-block` rules from the narrow-screen media query.

Add this immediately after `.product-lockup h1`:

```css
.session-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}
```

Keep the existing `.file-upload`, `.status-pill`, and `.icon-button` rules. Add this inside `@media (max-width: 720px)` after `.top-bar`:

```css
.session-actions {
  width: 100%;
  justify-content: flex-start;
}
```

- [ ] **Step 7: Run targeted and full automated verification**

Run:

```bash
npx tsx --test src/client/src/sessionHeader.test.ts
npm test
npm run typecheck
npm run build
```

Expected:

- targeted header tests: 2 pass, 0 fail,
- full suite: all tests pass, including the 2 new header tests,
- typecheck exits 0, and
- production build exits 0.

- [ ] **Step 8: Prove the deleted controls have no client source remnants**

Run:

```bash
if rg -n 'Viewer URL|Upload Token|Handoff Download|Confirm Import|Upload Command|control-band|info-block|command-block|block-heading|saveSessionSecrets|getSessionSecrets' src/client/src/main.tsx src/client/src/sessionHeader.tsx src/client/src/styles.css; then
  echo "stale agent-control source remains" >&2
  exit 1
fi
```

Expected: no matches and exit 0.

- [ ] **Step 9: Commit the tested client cleanup**

```bash
git add src/client/src/sessionHeader.tsx src/client/src/sessionHeader.test.ts src/client/src/main.tsx src/client/src/styles.css
git commit -m "feat: focus session view on csv review"
```

---

### Task 2: Align Agent and Project Documentation

**Files:**
- Modify: `skills/csv-data-work/SKILL.md:17-60`
- Modify: `README.md:14-49,64-73`
- Modify: `pickup.md:9-18`
- Modify: `docs/demos/agent-first-client-demo-design.md:161-175`
- Reference: `docs/superpowers/specs/2026-08-09-user-focused-session-view-design.md`

**Interfaces:**
- Consumes: Viewer URL shape `ORIGIN/session/SESSION_ID` and the unchanged endpoint shapes returned by `POST /api/sessions`.
- Produces: explicit instructions for deriving `COMPANION_WEBSITE_ORIGIN`, `SESSION_ID`, Working Upload URL, Handoff Download URL, and Handoff Confirm URL without Viewer-page controls.
- Keeps: agent-first session creation as the current product focus and browser-origin handoff as a supported path.

- [ ] **Step 1: Document how an agent joins from a Viewer URL**

In `skills/csv-data-work/SKILL.md`, replace the numbered `Companion Website Session` rules with:

```md
## Companion Website Session

1. Always create or open an Upload Session before the preview loop.
2. When creating a session with `POST /api/sessions`, capture the Viewer URL, Working Upload URL, Handoff Download URL, and Handoff Confirm URL from the response.
3. When joining a browser-created session, ask for the Viewer URL. Extract its origin and the session ID after `/session/`, then derive the agent endpoints from those two values. Do not ask the user to find agent controls on the Viewer page.
4. Open or provide the Viewer URL so the user can see the Companion Website.
5. Treat the Companion Website as preview-only. It must not be used to transform data.
6. Treat the backend as a relay and short-lived UI handoff shelf, not as storage for the latest Working CSV Version.
```

Insert this section immediately before `## Upload Command`:

````md
## Joining From a Viewer URL

If the user shares a Viewer URL such as `http://localhost:3000/session/<session-id>`, derive the session variables before using the upload or handoff commands:

```sh
VIEWER_URL="${VIEWER_URL:?Set VIEWER_URL to the shared Companion Website Viewer URL}"
COMPANION_WEBSITE_ORIGIN="${VIEWER_URL%%/session/*}"
SESSION_ID="${VIEWER_URL##*/session/}"

if [ "$COMPANION_WEBSITE_ORIGIN" = "$VIEWER_URL" ] || [ -z "$SESSION_ID" ]; then
  echo "Viewer URL must end with /session/<session-id>" >&2
  exit 1
fi
```

The agent endpoints are:

- Working upload: `$COMPANION_WEBSITE_ORIGIN/api/sessions/$SESSION_ID/working`
- Handoff download: `$COMPANION_WEBSITE_ORIGIN/api/sessions/$SESSION_ID/handoff/csv`
- Handoff confirm: `$COMPANION_WEBSITE_ORIGIN/api/sessions/$SESSION_ID/handoff/confirm`
````

In all three existing shell examples, change the `SESSION_ID` guard text from `Set SESSION_ID from the session response` to `Set SESSION_ID from the session response or Viewer URL`.

- [ ] **Step 2: Align README, pickup, and demo guidance with the clean Viewer**

In `README.md`, replace the sentence after the local URL with:

```md
For an agent-first session, create the Upload Session with `POST /api/sessions` and use the returned Viewer URL and agent-facing URLs. If a user already created the session in the browser, use the session ID at the end of the shared `/session/:sessionId` Viewer URL to derive the endpoints below. The Viewer page intentionally does not display agent URLs, tokens, or shell commands.
```

Change each README shell guard to:

```sh
SESSION_ID="${SESSION_ID:?Set SESSION_ID from the session response or Viewer URL}"
```

In `pickup.md`, replace the frontend status bullet that claims the page shows Viewer URL, Upload Token, handoff URLs, and an upload command with:

```md
- Added a Vite React frontend that creates sessions, provides a user-focused Viewer with connection status and browser source upload, parses relayed CSV previews in the browser, infers lightweight column types, and renders a spreadsheet-like table. Agent-facing URLs and commands come from the session API rather than the Viewer.
```

In `docs/demos/agent-first-client-demo-design.md`, replace the short-viewport warning at the end of `Recovery and Limitations` with:

```md
The Viewer intentionally omits agent-facing URLs, tokens, and shell commands. The guide should confirm that the current preview or empty state begins directly below the compact header, notices, and metadata.
```

Do not rewrite `docs/observations/2026-08-09-agent-first-live-flow-test.md`; it is historical evidence for why this change exists.

- [ ] **Step 3: Scan active documentation for stale Viewer-control promises**

Run:

```bash
if rg -n 'shows Viewer URL / Upload Token|table may appear below session controls|Copy upload command' README.md pickup.md skills/csv-data-work/SKILL.md docs/demos/agent-first-client-demo-design.md; then
  echo "stale Viewer-control documentation remains" >&2
  exit 1
fi

rg -n 'Joining From a Viewer URL|session response or Viewer URL|intentionally does not display agent URLs' README.md skills/csv-data-work/SKILL.md
```

Expected:

- the stale-text check has no matches and exits 0, and
- the positive check finds the new Viewer URL derivation and clean-Viewer guidance.

- [ ] **Step 4: Run repository verification after documentation changes**

Run:

```bash
git diff --check
npm test
npm run typecheck
npm run build
```

Expected: no whitespace errors; all tests, typechecks, and builds pass.

- [ ] **Step 5: Commit the documentation alignment**

```bash
git add skills/csv-data-work/SKILL.md README.md pickup.md docs/demos/agent-first-client-demo-design.md
git commit -m "docs: move agent setup out of viewer"
```

---

### Task 3: End-to-End Viewer Verification

**Files:**
- Verify: `src/client/src/sessionHeader.tsx`
- Verify: `src/client/src/main.tsx`
- Verify: `src/client/src/styles.css`
- Verify: `skills/csv-data-work/SKILL.md`
- Reference: `docs/superpowers/specs/2026-08-09-user-focused-session-view-design.md`

**Interfaces:**
- Consumes: `POST /api/sessions`, `/session/:sessionId`, `PUT /api/sessions/:sessionId/working`, `PUT /api/sessions/:sessionId/handoff`, and the existing SSE stream.
- Produces: browser evidence that the clean Viewer works in agent-first and browser-created sessions without regressing upload or review behavior.
- Keeps: browser-local baseline semantics and the backend's relay-only ownership model.

- [ ] **Step 1: Run the final automated verification from a clean prompt**

Run:

```bash
npm test
npm run typecheck
npm run build
git diff --check
```

Expected: every command exits 0.

- [ ] **Step 2: Start the production build for browser verification**

Run in a persistent terminal:

```bash
PORT=4173 npm run start
```

Expected: the Companion Website listens on `http://localhost:4173`.

- [ ] **Step 3: Create an agent-first session and capture its identifiers**

Run:

```bash
SMOKE_SESSION_JSON="$(curl -fsS -X POST http://localhost:4173/api/sessions)"
SMOKE_SESSION_ID="$(node -e 'const value = JSON.parse(process.argv[1]); process.stdout.write(value.sessionId)' "$SMOKE_SESSION_JSON")"
SMOKE_VIEWER_PATH="$(node -e 'const value = JSON.parse(process.argv[1]); process.stdout.write(value.viewerUrl)' "$SMOKE_SESSION_JSON")"
SMOKE_VIEWER_URL="http://localhost:4173$SMOKE_VIEWER_PATH"
printf '%s\n' "$SMOKE_VIEWER_URL"
```

Expected: the final line is `http://localhost:4173/session/<uuid>`.

- [ ] **Step 4: Verify the clean initial Viewer in a browser**

Open `$SMOKE_VIEWER_URL` and confirm:

- connection status becomes `Live`,
- `Browser Upload` is in the header,
- `No current CSV` is visible without scrolling on a short desktop viewport,
- there is no Viewer URL card,
- there is no Upload Token card,
- there is no Handoff Download card,
- there is no Confirm Import card, and
- there is no Upload Command card.

- [ ] **Step 5: Upload a baseline and changed Working CSV through the unchanged agent endpoint**

Run the first upload:

```bash
curl -fsS -X PUT \
  -H 'Content-Type: text/csv' \
  --data-binary $'_row_id,name,score\nrow_000001,Ada,10\nrow_000002,Grace,20\n' \
  "http://localhost:4173/api/sessions/$SMOKE_SESSION_ID/working"
```

Expected: HTTP success JSON reports `activeViewers: 1`; the table appears as the first baseline with no change-review controls.

Run the changed upload:

```bash
curl -fsS -X PUT \
  -H 'Content-Type: text/csv' \
  --data-binary $'_row_id,name,score\nrow_000001,Ada,11\nrow_000002,Grace,20\n' \
  "http://localhost:4173/api/sessions/$SMOKE_SESSION_ID/working"
```

Expected: the Viewer updates live, reports one modified cell, and shows `Verify Changes`.

- [ ] **Step 6: Verify review behavior is unchanged**

In the browser:

1. Click the modified-cell review item and confirm Ada's score cell is brought into view and highlighted.
2. Click `Verify Changes`.
3. Confirm the table stays visible while the review controls and highlights disappear.

- [ ] **Step 7: Verify browser-created session and handoff behavior**

Open `http://localhost:4173`, click `New Upload Session`, and capture the session ID from the resulting address-bar URL. Confirm the resulting page has the same clean header and Browser Upload action.

Click `Browser Upload` and choose the repository file `data/housing.csv` in the file chooser. Wait for the button to change from `Uploading` back to `Browser Upload`.

Expected:

- the Viewer receives a source handoff preview,
- `_row_id` is normalized by the backend,
- the Browser Upload action remains enabled after completion, and
- the page still contains none of the five deleted agent controls.

Use the captured session ID as `BROWSER_SESSION_ID`, then verify the documented derived endpoints:

```bash
BROWSER_SESSION_ID="${BROWSER_SESSION_ID:?Set BROWSER_SESSION_ID from the browser-created Viewer URL}"

curl -fsS "http://localhost:4173/api/sessions/$BROWSER_SESSION_ID/handoff/csv" | sed -n '1,3p'
curl -fsS -X POST "http://localhost:4173/api/sessions/$BROWSER_SESSION_ID/handoff/confirm"
```

Expected: the downloaded header begins with `_row_id,longitude,latitude`, and confirmation succeeds.

- [ ] **Step 8: Verify responsive layout**

At a narrow mobile viewport and a short desktop viewport, confirm:

- product identity remains readable,
- Browser Upload and connection status wrap together without horizontal overflow,
- notices and metadata begin immediately below the header,
- the preview or empty state begins materially higher than before, and
- table scrolling and review controls still operate normally.

- [ ] **Step 9: Record final repository state**

Run:

```bash
git status --short --branch
git log --oneline -3
```

Expected: no uncommitted implementation changes and the client-cleanup and documentation commits are the latest implementation commits after this plan.

Stop the local verification server after the checks are complete.
