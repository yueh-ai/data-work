# Agent-Owned CSV Session Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace backend-owned current CSV storage with an agent-owned working-data model where the backend only relays working previews and temporarily holds UI-uploaded handoff CSVs.

**Architecture:** The backend exposes separate handoff and working endpoints. Handoff uploads are normalized with `_row_id`, stored in memory for 30 minutes, replayable while pending, and deleted on agent confirm; working uploads require `_row_id`, are sent to connected viewers, and are discarded. The UI listens for `handoff-preview` and `working-preview`, while the CSV skill teaches agents how to create sessions, import handoffs, and preserve row identity.

**Tech Stack:** TypeScript, Express 5, Server-Sent Events, React 19, PapaParse, Node `node:test`, Vite.

---

## File Structure

- Modify `src/server/csvRows.ts`
  - Own CSV parsing, `_row_id` validation, handoff normalization, and working upload validation.
  - Export `normalizeHandoffCsv(csv)` and `validateWorkingCsv(csv)`.
- Modify `src/server/app.ts`
  - Replace `latestCsv/latestUpload` session state with optional `pendingHandoff`.
  - Add `/handoff`, `/handoff/csv`, `/handoff/confirm`, and `/working`.
  - Emit `handoff-preview` and `working-preview` SSE events.
  - Remove the old `/csv` download endpoint and old `/upload` behavior.
- Modify `src/server/index.test.ts`
  - Replace old upload/download tests with handoff, confirm, expiry, replacement, working validation, and SSE relay tests.
- Modify `src/client/src/main.tsx`
  - Update session response types, generated command, browser upload endpoint, SSE event listeners, and user-facing preview state.
  - Remove the old latest Working CSV download URL surface.
- Modify `src/client/src/styles.css`
  - Add or adjust small status styling only if the new handoff/working labels need it.
- Modify `skills/csv-data-work/SKILL.md`
  - Teach the new session-first, agent-owned workflow.
  - Add copyable Python helper functions for `_row_id`.
- Modify `README.md`
  - Document the new local commands and endpoint meanings.
- Modify `CONTEXT.md`
  - Update domain language so backend memory is a pending handoff shelf, not current working data.
- Optionally add `docs/adr/0003-agent-owned-working-csv.md`
  - Record the architecture decision if implementation reveals README/CONTEXT alone is not enough. If added, keep it short and link the spec.

---

## Task 1: Split Row-ID Parsing Into Handoff and Working Modes

**Files:**
- Modify: `src/server/csvRows.ts`
- Modify: `src/server/index.test.ts`

- [ ] **Step 1: Replace server row utility tests with mode-specific expectations**

Edit `src/server/index.test.ts` later in this task, but first write focused unit tests directly in a new section near the top so row utility behavior can fail before endpoint rewrites are complete:

```ts
import {
  CsvRowUploadError,
  normalizeHandoffCsv,
  validateWorkingCsv
} from "./csvRows.js";
```

Add these tests after helper functions are declared:

```ts
test("handoff normalization adds sequential row ids when missing", () => {
  const csv = "latitude,total_rooms\n37.88,880\n37.86,7099\n";

  assert.equal(
    normalizeHandoffCsv(csv),
    "_row_id,latitude,total_rooms\nrow_000001,37.88,880\nrow_000002,37.86,7099\n"
  );
});

test("handoff normalization preserves valid existing row ids", () => {
  const csv = "_row_id,latitude\nrow_000010,37.88\nrow_000011,37.86\n";

  assert.equal(normalizeHandoffCsv(csv), csv);
});

test("working validation rejects missing row ids", () => {
  assert.throws(
    () => validateWorkingCsv("latitude,total_rooms\n37.88,880\n"),
    (error) => error instanceof CsvRowUploadError && error.code === "missing_row_id"
  );
});

test("working validation returns valid csv unchanged apart from trailing newline", () => {
  assert.equal(validateWorkingCsv("_row_id,latitude\nrow_000001,37.88"), "_row_id,latitude\nrow_000001,37.88\n");
});
```

- [ ] **Step 2: Run row utility tests and verify they fail**

Run:

```bash
npm test -- src/server/index.test.ts
```

Expected: FAIL because `normalizeHandoffCsv` and `validateWorkingCsv` are not exported yet.

- [ ] **Step 3: Implement explicit row utility modes**

Replace the old `normalizeUploadedCsv(csv, isFirstUpload)` export in `src/server/csvRows.ts` with these exports and helpers:

```ts
import Papa from "papaparse";

export const rowIdColumn = "_row_id";

const missingWorkingRowIdDetail =
  "Working CSV uploads must include _row_id. If this is agent-origin data, create _row_id in the Python Workspace before uploading. If this is UI-origin data, import the normalized handoff CSV first.";

export type CsvRowUploadErrorCode = "missing_row_id" | "duplicate_row_id" | "empty_row_id" | "csv_parse_error";

export class CsvRowUploadError extends Error {
  constructor(
    public readonly code: CsvRowUploadErrorCode,
    message: string,
    public readonly detail?: string
  ) {
    super(message);
  }
}

type ParsedCsv = {
  fields: string[];
  rows: Record<string, string>[];
};

export function normalizeHandoffCsv(csv: string) {
  const parsed = parseCsv(csv);
  const hasRowId = parsed.fields.includes(rowIdColumn);
  const fields = hasRowId ? parsed.fields : [rowIdColumn, ...parsed.fields];
  const rows = hasRowId
    ? parsed.rows
    : parsed.rows.map((row, index) => ({
        [rowIdColumn]: formatRowId(index + 1),
        ...row
      }));

  validateRowIds(rows);
  return serializeCsv(fields, rows);
}

export function validateWorkingCsv(csv: string) {
  const parsed = parseCsv(csv);
  if (!parsed.fields.includes(rowIdColumn)) {
    throw new CsvRowUploadError("missing_row_id", "Upload rejected: missing required _row_id column.", missingWorkingRowIdDetail);
  }

  validateRowIds(parsed.rows);
  return serializeCsv(parsed.fields, parsed.rows);
}

function parseCsv(csv: string): ParsedCsv {
  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.trim()
  });

  if (parsed.errors.length) {
    const first = parsed.errors[0];
    throw new CsvRowUploadError("csv_parse_error", `${first.message}${first.row !== undefined ? ` at row ${first.row + 1}` : ""}.`);
  }

  const fields = parsed.meta.fields?.filter(Boolean) ?? [];
  if (!fields.length) {
    throw new CsvRowUploadError("csv_parse_error", "The CSV header row is empty.");
  }

  const rows = parsed.data.filter((row) => Object.values(row).some((value) => String(value ?? "").trim()));
  return { fields, rows };
}

function validateRowIds(rows: Record<string, string>[]) {
  const seen = new Set<string>();

  for (const row of rows) {
    const rowId = String(row[rowIdColumn] ?? "").trim();
    if (!rowId) {
      throw new CsvRowUploadError("empty_row_id", "Upload rejected: _row_id values must be non-empty.");
    }
    if (seen.has(rowId)) {
      throw new CsvRowUploadError("duplicate_row_id", `Upload rejected: duplicate _row_id value "${rowId}".`);
    }
    seen.add(rowId);
  }
}

function serializeCsv(fields: string[], rows: Record<string, string>[]) {
  return ensureTrailingNewline(
    Papa.unparse(
      {
        fields,
        data: rows
      },
      {
        columns: fields,
        header: true,
        newline: "\n"
      }
    )
  );
}

function formatRowId(value: number) {
  return `row_${String(value).padStart(6, "0")}`;
}

function ensureTrailingNewline(value: string) {
  return value.endsWith("\n") ? value : `${value}\n`;
}
```

- [ ] **Step 4: Run tests and confirm row utility tests pass or endpoint tests now fail for expected old API reasons**

Run:

```bash
npm test -- src/server/index.test.ts
```

Expected: row utility tests PASS; older endpoint tests may FAIL because `src/server/app.ts` still imports `normalizeUploadedCsv`.

- [ ] **Step 5: Commit row utility split**

```bash
git add src/server/csvRows.ts src/server/index.test.ts
git commit -m "refactor: split csv row identity modes"
```

---

## Task 2: Redesign Server Session State and Handoff API

**Files:**
- Modify: `src/server/app.ts`
- Modify: `src/server/index.test.ts`

- [ ] **Step 1: Replace old endpoint tests with handoff session tests**

In `src/server/index.test.ts`, remove tests that call `/api/sessions/:id/upload` and `/api/sessions/:id/csv`. Add helper functions:

```ts
async function uploadHandoffCsv(origin: string, sessionId: string, csv: string) {
  return fetch(`${origin}/api/sessions/${sessionId}/handoff`, {
    method: "PUT",
    headers: {
      "Content-Disposition": 'attachment; filename="source.csv"',
      "Content-Type": "text/csv"
    },
    body: csv
  });
}

async function downloadHandoffCsv(origin: string, sessionId: string) {
  const response = await fetch(`${origin}/api/sessions/${sessionId}/handoff/csv`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/csv/);
  return response.text();
}

async function confirmHandoff(origin: string, sessionId: string) {
  return fetch(`${origin}/api/sessions/${sessionId}/handoff/confirm`, { method: "POST" });
}
```

Add endpoint tests:

```ts
test("session response exposes agent working and handoff URLs", async () => {
  await withTestServer(async (origin) => {
    const response = await fetch(`${origin}/api/sessions`, { method: "POST" });
    assert.equal(response.status, 201);
    const session = (await response.json()) as {
      sessionId: string;
      viewerUrl: string;
      workingUploadUrl: string;
      handoffDownloadUrl: string;
      handoffConfirmUrl: string;
      workingUploadCommand: string;
    };

    assert.equal(session.viewerUrl, `/session/${session.sessionId}`);
    assert.equal(session.workingUploadUrl, `/api/sessions/${session.sessionId}/working`);
    assert.equal(session.handoffDownloadUrl, `/api/sessions/${session.sessionId}/handoff/csv`);
    assert.equal(session.handoffConfirmUrl, `/api/sessions/${session.sessionId}/handoff/confirm`);
    assert.match(session.workingUploadCommand, new RegExp(`/api/sessions/${session.sessionId}/working$`));
  });
});

test("handoff upload stores normalized csv for agent download", async () => {
  await withTestServer(async (origin) => {
    const session = await createSession(origin);

    const uploadResponse = await uploadHandoffCsv(origin, session.sessionId, "latitude,total_rooms\n37.88,880\n");
    assert.equal(uploadResponse.status, 200);

    assert.equal(await downloadHandoffCsv(origin, session.sessionId), "_row_id,latitude,total_rooms\nrow_000001,37.88,880\n");
  });
});

test("handoff confirm deletes pending handoff and is idempotent", async () => {
  await withTestServer(async (origin) => {
    const session = await createSession(origin);
    assert.equal((await uploadHandoffCsv(origin, session.sessionId, "latitude\n37.88\n")).status, 200);

    const firstConfirm = await confirmHandoff(origin, session.sessionId);
    assert.equal(firstConfirm.status, 200);
    assert.deepEqual(await firstConfirm.json(), { ok: true, status: "confirmed" });

    const downloadResponse = await fetch(`${origin}/api/sessions/${session.sessionId}/handoff/csv`);
    assert.equal(downloadResponse.status, 404);

    const secondConfirm = await confirmHandoff(origin, session.sessionId);
    assert.equal(secondConfirm.status, 200);
    assert.deepEqual(await secondConfirm.json(), { ok: true, status: "no_pending_handoff" });
  });
});

test("second handoff replaces the first pending handoff", async () => {
  await withTestServer(async (origin) => {
    const session = await createSession(origin);
    assert.equal((await uploadHandoffCsv(origin, session.sessionId, "latitude\n37.88\n")).status, 200);
    assert.equal((await uploadHandoffCsv(origin, session.sessionId, "latitude\n37.99\n")).status, 200);

    assert.equal(await downloadHandoffCsv(origin, session.sessionId), "_row_id,latitude\nrow_000001,37.99\n");
  });
});
```

- [ ] **Step 2: Run tests and verify handoff endpoint failures**

Run:

```bash
npm test -- src/server/index.test.ts
```

Expected: FAIL with 404 or compile errors because `/handoff` endpoints and response fields do not exist.

- [ ] **Step 3: Replace `Session` state in `src/server/app.ts`**

Update imports:

```ts
import { CsvRowUploadError, normalizeHandoffCsv, validateWorkingCsv } from "./csvRows.js";
```

Replace session-related types:

```ts
type Session = {
  id: string;
  createdAt: string;
  pendingHandoff?: PendingHandoff;
  viewers: Set<Response>;
};

type PendingHandoff = {
  uploadedAt: string;
  expiresAt: string;
  filename: string | null;
  bytes: number;
  csv: string;
  timer: ReturnType<typeof setTimeout>;
};

type PreviewNotice = {
  uploadedAt: string;
  filename: string | null;
  bytes: number;
  csv: string;
};
```

In `POST /api/sessions`, return the new fields:

```ts
res.status(201).json({
  sessionId: id,
  uploadToken: placeholderUploadToken,
  viewerUrl: `/session/${id}`,
  workingUploadUrl: `/api/sessions/${id}/working`,
  handoffDownloadUrl: `/api/sessions/${id}/handoff/csv`,
  handoffConfirmUrl: `/api/sessions/${id}/handoff/confirm`,
  workingUploadCommand: [
    "curl",
    "-X PUT",
    "-H 'Content-Type: text/csv'",
    "--data-binary @working.csv",
    absoluteUrl(req, `/api/sessions/${id}/working`)
  ].join(" ")
});
```

In `GET /api/sessions/:sessionId`, return metadata only:

```ts
res.json({
  sessionId: session.id,
  createdAt: session.createdAt,
  activeViewers: session.viewers.size,
  pendingHandoff: session.pendingHandoff ? pendingHandoffMetadata(session.pendingHandoff) : null
});
```

Remove `GET /api/sessions/:sessionId/csv`.

- [ ] **Step 4: Implement handoff endpoints and helper functions**

Add `PUT /handoff`, `GET /handoff/csv`, and `POST /handoff/confirm` before `/working`:

```ts
app.put(
  "/api/sessions/:sessionId/handoff",
  express.raw({ limit: "1gb", type: () => true }),
  (req, res) => {
    const session = sessions.get(req.params.sessionId);
    if (!session) {
      res.status(404).json({ error: "Upload Session not found." });
      return;
    }

    const csv = readCsvBody(req, res);
    if (csv === null) {
      return;
    }

    let normalizedCsv: string;
    try {
      normalizedCsv = normalizeHandoffCsv(csv);
    } catch (err) {
      sendCsvError(res, err);
      return;
    }

    clearPendingHandoff(session);

    const uploadedAt = new Date();
    const expiresAt = new Date(uploadedAt.getTime() + 30 * 60 * 1000);
    const handoff: PendingHandoff = {
      uploadedAt: uploadedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      filename: parseFilename(req.get("content-disposition")),
      bytes: Buffer.byteLength(normalizedCsv, "utf8"),
      csv: normalizedCsv,
      timer: setTimeout(() => expirePendingHandoff(session), 30 * 60 * 1000)
    };

    session.pendingHandoff = handoff;

    sendToViewers(session, "handoff-preview", {
      ...pendingHandoffMetadata(handoff),
      csv: handoff.csv
    });

    res.json({
      ok: true,
      sessionId: session.id,
      pendingHandoff: pendingHandoffMetadata(handoff),
      activeViewers: session.viewers.size
    });
  }
);

app.get("/api/sessions/:sessionId/handoff/csv", (req, res) => {
  const session = sessions.get(req.params.sessionId);
  if (!session) {
    res.status(404).json({ error: "Upload Session not found." });
    return;
  }

  if (!session.pendingHandoff) {
    res.status(404).json({ error: "handoff_not_found", message: "No pending handoff CSV for this Upload Session." });
    return;
  }

  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${downloadFilename(session.pendingHandoff.filename)}"`);
  res.send(session.pendingHandoff.csv);
});

app.post("/api/sessions/:sessionId/handoff/confirm", (req, res) => {
  const session = sessions.get(req.params.sessionId);
  if (!session) {
    res.status(404).json({ error: "Upload Session not found." });
    return;
  }

  if (!session.pendingHandoff) {
    res.json({ ok: true, status: "no_pending_handoff" });
    return;
  }

  clearPendingHandoff(session);
  sendToViewers(session, "handoff-cleared", { sessionId: session.id });
  res.json({ ok: true, status: "confirmed" });
});
```

Add helpers near the bottom:

```ts
function pendingHandoffMetadata(handoff: PendingHandoff) {
  return {
    uploadedAt: handoff.uploadedAt,
    expiresAt: handoff.expiresAt,
    filename: handoff.filename,
    bytes: handoff.bytes
  };
}

function clearPendingHandoff(session: Session) {
  if (!session.pendingHandoff) {
    return;
  }
  clearTimeout(session.pendingHandoff.timer);
  delete session.pendingHandoff;
}

function expirePendingHandoff(session: Session) {
  if (!session.pendingHandoff) {
    return;
  }
  delete session.pendingHandoff;
  sendToViewers(session, "handoff-expired", { sessionId: session.id });
}

function sendToViewers(session: Session, event: string, data: unknown) {
  for (const viewer of session.viewers) {
    sendEvent(viewer, event, data);
  }
}

function readCsvBody(req: Request, res: Response) {
  const body = req.body;
  if (!Buffer.isBuffer(body) || body.length === 0) {
    res.status(400).json({ error: "Upload a non-empty CSV file." });
    return null;
  }

  const csv = stripBom(body.toString("utf8"));
  if (!csv.trim()) {
    res.status(400).json({ error: "Upload a CSV file with visible content." });
    return null;
  }

  return csv;
}

function sendCsvError(res: Response, err: unknown) {
  if (err instanceof CsvRowUploadError) {
    res.status(400).json({
      error: err.code,
      message: err.message,
      ...(err.detail ? { detail: err.detail } : {})
    });
    return;
  }
  throw err;
}
```

- [ ] **Step 5: Update SSE connect replay**

In `GET /events`, replace old `hasCurrentCsv/latestUpload` session event and replay:

```ts
sendEvent(res, "session", {
  sessionId: session.id,
  createdAt: session.createdAt,
  pendingHandoff: Boolean(session.pendingHandoff)
});

if (session.pendingHandoff) {
  sendEvent(res, "handoff-preview", {
    ...pendingHandoffMetadata(session.pendingHandoff),
    csv: session.pendingHandoff.csv
  });
}
```

- [ ] **Step 6: Run server tests and verify handoff tests pass**

Run:

```bash
npm test -- src/server/index.test.ts
```

Expected: PASS for handoff tests that do not depend on `/working`; remaining working tests are added in Task 3.

- [ ] **Step 7: Commit handoff API**

```bash
git add src/server/app.ts src/server/index.test.ts
git commit -m "feat: add pending handoff api"
```

---

## Task 3: Add Working Upload Relay Without Backend CSV Retention

**Files:**
- Modify: `src/server/app.ts`
- Modify: `src/server/index.test.ts`

- [ ] **Step 1: Add working endpoint tests**

Add helpers to `src/server/index.test.ts`:

```ts
async function uploadWorkingCsv(origin: string, sessionId: string, csv: string) {
  return fetch(`${origin}/api/sessions/${sessionId}/working`, {
    method: "PUT",
    headers: {
      "Content-Disposition": 'attachment; filename="working.csv"',
      "Content-Type": "text/csv"
    },
    body: csv
  });
}

async function readSseEvent(origin: string, sessionId: string, eventName: string) {
  const controller = new AbortController();
  const response = await fetch(`${origin}/api/sessions/${sessionId}/events`, { signal: controller.signal });
  assert.equal(response.status, 200);
  assert(response.body);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";
      for (const event of events) {
        if (event.includes(`event: ${eventName}\n`)) {
          const dataLine = event.split("\n").find((line) => line.startsWith("data: "));
          assert(dataLine);
          return JSON.parse(dataLine.slice("data: ".length)) as Record<string, unknown>;
        }
      }
    }
  } finally {
    controller.abort();
  }

  throw new Error(`SSE event ${eventName} was not received.`);
}
```

Add tests:

```ts
test("working upload rejects missing row ids", async () => {
  await withTestServer(async (origin) => {
    const session = await createSession(origin);

    const response = await uploadWorkingCsv(origin, session.sessionId, "latitude\n37.88\n");
    assert.equal(response.status, 400);
    assert.equal((await readUploadError(response)).error, "missing_row_id");
  });
});

test("working upload emits working preview and is not downloadable as handoff", async () => {
  await withTestServer(async (origin) => {
    const session = await createSession(origin);
    const eventPromise = readSseEvent(origin, session.sessionId, "working-preview");

    const response = await uploadWorkingCsv(origin, session.sessionId, "_row_id,latitude\nrow_000001,37.88\n");
    assert.equal(response.status, 200);

    const event = await eventPromise;
    assert.equal(event.filename, "working.csv");
    assert.equal(event.csv, "_row_id,latitude\nrow_000001,37.88\n");

    const handoffDownload = await fetch(`${origin}/api/sessions/${session.sessionId}/handoff/csv`);
    assert.equal(handoffDownload.status, 404);
  });
});
```

- [ ] **Step 2: Run tests and verify working endpoint failures**

Run:

```bash
npm test -- src/server/index.test.ts
```

Expected: FAIL because `/working` is not implemented.

- [ ] **Step 3: Implement `/working` relay endpoint**

Add this endpoint in `src/server/app.ts`:

```ts
app.put(
  "/api/sessions/:sessionId/working",
  express.raw({ limit: "1gb", type: () => true }),
  (req, res) => {
    const session = sessions.get(req.params.sessionId);
    if (!session) {
      res.status(404).json({ error: "Upload Session not found." });
      return;
    }

    const csv = readCsvBody(req, res);
    if (csv === null) {
      return;
    }

    let workingCsv: string;
    try {
      workingCsv = validateWorkingCsv(csv);
    } catch (err) {
      sendCsvError(res, err);
      return;
    }

    const notice: PreviewNotice = {
      uploadedAt: new Date().toISOString(),
      filename: parseFilename(req.get("content-disposition")),
      bytes: Buffer.byteLength(workingCsv, "utf8"),
      csv: workingCsv
    };

    sendToViewers(session, "working-preview", notice);

    res.json({
      ok: true,
      sessionId: session.id,
      uploadedAt: notice.uploadedAt,
      filename: notice.filename,
      bytes: notice.bytes,
      activeViewers: session.viewers.size
    });
  }
);
```

Do not assign `workingCsv` or `notice` to `session`.

- [ ] **Step 4: Run server tests**

Run:

```bash
npm test -- src/server/index.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit working relay**

```bash
git add src/server/app.ts src/server/index.test.ts
git commit -m "feat: relay working csv previews"
```

---

## Task 4: Update Client Session and Preview Flow

**Files:**
- Modify: `src/client/src/main.tsx`
- Modify: `src/client/src/styles.css`

- [ ] **Step 1: Update client types**

In `src/client/src/main.tsx`, replace old response/event types with:

```ts
type SessionCreateResponse = {
  sessionId: string;
  uploadToken: string;
  viewerUrl: string;
  workingUploadUrl: string;
  handoffDownloadUrl: string;
  handoffConfirmUrl: string;
  workingUploadCommand: string;
};

type SessionEvent = {
  sessionId: string;
  createdAt: string;
  pendingHandoff: boolean;
};

type HandoffPreviewEvent = {
  uploadedAt: string;
  expiresAt: string;
  filename: string | null;
  bytes: number;
  csv: string;
};

type WorkingPreviewEvent = {
  uploadedAt: string;
  filename: string | null;
  bytes: number;
  csv: string;
};

type PreviewEvent = (HandoffPreviewEvent & { kind: "handoff" }) | (WorkingPreviewEvent & { kind: "working" });
```

- [ ] **Step 2: Run typecheck and verify type failures**

Run:

```bash
npm run typecheck
```

Expected: FAIL because existing code references `downloadUrl`, `uploadUrl`, and `CsvEvent`.

- [ ] **Step 3: Update state and SSE listeners**

Replace `csvEvent` state with:

```ts
const [previewEvent, setPreviewEvent] = useState<PreviewEvent | null>(null);
```

In the session reset effect, replace `setCsvEvent(null)` with:

```ts
setPreviewEvent(null);
```

Replace the old `csv` event listener:

```ts
events.addEventListener("handoff-preview", (event) => {
  const next = JSON.parse((event as MessageEvent).data) as HandoffPreviewEvent;
  setPreviewEvent({ ...next, kind: "handoff" });
  parseCsv(next.csv);
});

events.addEventListener("working-preview", (event) => {
  const next = JSON.parse((event as MessageEvent).data) as WorkingPreviewEvent;
  setPreviewEvent({ ...next, kind: "working" });
  parseCsv(next.csv);
});

events.addEventListener("handoff-cleared", () => {
  setSession((current) => (current ? { ...current, pendingHandoff: false } : current));
});

events.addEventListener("handoff-expired", () => {
  setSession((current) => (current ? { ...current, pendingHandoff: false } : current));
});
```

- [ ] **Step 4: Update URLs and commands**

Replace URL construction:

```ts
const handoffUploadUrl = `/api/sessions/${sessionId}/handoff`;
const workingUploadUrl = `/api/sessions/${sessionId}/working`;
const handoffDownloadUrl = `${window.location.origin}/api/sessions/${sessionId}/handoff/csv`;
const handoffConfirmUrl = `${window.location.origin}/api/sessions/${sessionId}/handoff/confirm`;
const viewerUrl = `${window.location.origin}/session/${sessionId}`;
const command = useMemo(() => {
  return [
    "curl",
    "-X PUT",
    "-H 'Content-Type: text/csv'",
    "--data-binary @working.csv",
    `${window.location.origin}${workingUploadUrl}`
  ].join(" ");
}, [workingUploadUrl]);
```

Update `uploadFile` to use `handoffUploadUrl`:

```ts
const response = await fetch(handoffUploadUrl, {
  method: "PUT",
  headers: {
    "Content-Type": file.type || "text/csv",
    "Content-Disposition": `attachment; filename="${encodeURIComponent(file.name)}"`
  },
  body: await file.arrayBuffer()
});
```

- [ ] **Step 5: Update control band information**

Replace the old Download URL `InfoBlock` with two handoff fields:

```tsx
<InfoBlock
  icon={<Download size={18} />}
  label="Handoff Download"
  value={secrets?.handoffDownloadUrl ? `${window.location.origin}${secrets.handoffDownloadUrl}` : handoffDownloadUrl}
  actionLabel="Copy handoff download URL"
  onCopy={() => copy("handoff-download", handoffDownloadUrl)}
  copied={copyState === "handoff-download"}
/>
<InfoBlock
  icon={<Check size={18} />}
  label="Confirm Import"
  value={secrets?.handoffConfirmUrl ? `${window.location.origin}${secrets.handoffConfirmUrl}` : handoffConfirmUrl}
  actionLabel="Copy handoff confirm URL"
  onCopy={() => copy("handoff-confirm", handoffConfirmUrl)}
  copied={copyState === "handoff-confirm"}
/>
```

If the control band becomes visually crowded, keep `Confirm Import` in the same band and allow wrapping; do not add a new interaction panel.

- [ ] **Step 6: Update labels and empty state copy**

Use `previewEvent` in metrics:

```tsx
<Metric label="Bytes" value={previewEvent ? formatBytes(previewEvent.bytes) : "None"} />
<Metric label="Updated" value={previewEvent ? formatTime(previewEvent.uploadedAt) : "Waiting"} />
```

Add a status message near the existing notice row:

```tsx
{previewEvent?.kind === "handoff" ? (
  <InlineMessage
    tone="info"
    icon={<RefreshCw size={16} />}
    text={`Source handoff preview. Agent import expires at ${formatTime(previewEvent.expiresAt)}.`}
  />
) : previewEvent?.kind === "working" ? (
  <InlineMessage
    tone="info"
    icon={<Activity size={16} />}
    text="Live working preview from the agent. Refresh may require the agent to upload again."
  />
) : null}
```

Update empty copy:

```tsx
<p>
  {session?.pendingHandoff
    ? "Waiting for the normalized handoff preview to arrive."
    : "Upload a source CSV in the browser, or have the agent upload a Working CSV Version."}
</p>
```

Update `TablePreview` filename prop:

```tsx
<TablePreview table={table} review={review} scrollRequest={scrollRequest} filename={previewEvent?.filename} />
```

- [ ] **Step 7: Update local storage shape**

Modify `saveSessionSecrets` and `getSessionSecrets` picks:

```ts
function saveSessionSecrets(session: SessionCreateResponse) {
  localStorage.setItem(
    `csv-companion:${session.sessionId}`,
    JSON.stringify({
      uploadToken: session.uploadToken,
      workingUploadUrl: session.workingUploadUrl,
      handoffDownloadUrl: session.handoffDownloadUrl,
      handoffConfirmUrl: session.handoffConfirmUrl,
      workingUploadCommand: session.workingUploadCommand
    })
  );
}

function getSessionSecrets(sessionId: string) {
  const raw = localStorage.getItem(`csv-companion:${sessionId}`);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as Pick<
      SessionCreateResponse,
      "uploadToken" | "workingUploadUrl" | "handoffDownloadUrl" | "handoffConfirmUrl" | "workingUploadCommand"
    >;
  } catch {
    return null;
  }
}
```

- [ ] **Step 8: Run client/server checks**

Run:

```bash
npm run typecheck
npm test
npm run build
```

Expected: all PASS.

- [ ] **Step 9: Commit client update**

```bash
git add src/client/src/main.tsx src/client/src/styles.css
git commit -m "feat: show handoff and working previews"
```

---

## Task 5: Update CSV Skill for Agent-Owned Workflow

**Files:**
- Modify: `skills/csv-data-work/SKILL.md`

- [ ] **Step 1: Replace old endpoint instructions**

In `skills/csv-data-work/SKILL.md`, remove the old “Download the latest Working CSV Version” section and replace session setup with:

```md
## Companion Website Session

1. Always create or open an Upload Session before the preview loop.
2. Capture the Viewer URL, Working Upload URL, Handoff Download URL, and Handoff Confirm URL.
3. Open or provide the Viewer URL so the user can see the Companion Website.
4. Treat the Companion Website as preview-only. It must not be used to transform data.
5. Treat the backend as a relay and short-lived UI handoff shelf, not as storage for the latest Working CSV Version.
```

Add working upload command:

````md
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
````

Add handoff import commands:

````md
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
````

- [ ] **Step 2: Add copyable Python row ID helpers**

Add this Markdown section:

````md
## Row Identity Helpers

Use these helpers in the Python Workspace before writing any Working CSV Version.

```python
import re
from pathlib import Path

import pandas as pd

ROW_ID_COLUMN = "_row_id"
ROW_ID_PATTERN = re.compile(r"^row_(\d+)$")


def validate_row_id(df: pd.DataFrame, column: str = ROW_ID_COLUMN) -> None:
    if column not in df.columns:
        raise ValueError(f"Missing required {column} column.")
    values = df[column].astype("string")
    if values.isna().any() or values.str.strip().eq("").any():
        raise ValueError(f"{column} values must be non-empty.")
    duplicated = values[values.duplicated()].unique().tolist()
    if duplicated:
        raise ValueError(f"Duplicate {column} values: {duplicated[:5]}")


def next_row_id(existing_ids: pd.Series, column: str = ROW_ID_COLUMN) -> str:
    max_value = 0
    for value in existing_ids.dropna().astype(str):
        match = ROW_ID_PATTERN.match(value.strip())
        if match:
            max_value = max(max_value, int(match.group(1)))
    return f"row_{max_value + 1:06d}"


def ensure_row_id(df: pd.DataFrame, column: str = ROW_ID_COLUMN) -> pd.DataFrame:
    result = df.copy()
    if column not in result.columns:
        result.insert(0, column, [f"row_{index + 1:06d}" for index in range(len(result))])
    validate_row_id(result, column)
    return result


def assign_row_ids_to_new_rows(existing_df: pd.DataFrame, new_rows: pd.DataFrame, column: str = ROW_ID_COLUMN) -> pd.DataFrame:
    validate_row_id(existing_df, column)
    result = new_rows.copy()
    if column in result.columns:
        validate_row_id(result, column)
        return result
    max_value = 0
    for value in existing_df[column].dropna().astype(str):
        match = ROW_ID_PATTERN.match(value.strip())
        if match:
            max_value = max(max_value, int(match.group(1)))
    result.insert(0, column, [f"row_{max_value + index + 1:06d}" for index in range(len(result))])
    validate_row_id(result, column)
    return result


def write_verified_csv(df: pd.DataFrame, path: str | Path, column: str = ROW_ID_COLUMN) -> Path:
    validate_row_id(df, column)
    output_path = Path(path)
    df.to_csv(output_path, index=False)
    reloaded = pd.read_csv(output_path, dtype={column: "string"})
    validate_row_id(reloaded, column)
    if len(reloaded) != len(df):
        raise ValueError(f"Row count changed during write/read verification: {len(df)} -> {len(reloaded)}")
    return output_path
```
````

- [ ] **Step 3: Update edit loop**

Replace the existing edit loop with:

```md
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
```

- [ ] **Step 4: Scan skill for removed old assumptions**

Run:

```bash
rg -n "/csv|latest Working CSV|latest Working|/upload|backend.*storage" skills/csv-data-work/SKILL.md
```

Expected: no old `/api/sessions/:id/csv` or `/api/sessions/:id/upload` instructions remain. Mentions of backend storage should say it is not latest working storage.

- [ ] **Step 5: Commit skill update**

```bash
git add skills/csv-data-work/SKILL.md
git commit -m "docs: update csv data work skill"
```

---

## Task 6: Update Project Documentation

**Files:**
- Modify: `README.md`
- Modify: `CONTEXT.md`
- Optionally create: `docs/adr/0003-agent-owned-working-csv.md`

- [ ] **Step 1: Update README endpoint documentation**

In `README.md`, replace upload/download examples with:

````md
Upload an agent Working CSV Version:

```sh
SESSION_ID="${SESSION_ID:?Set SESSION_ID from the session response}"

curl -X PUT \
  -H 'Content-Type: text/csv' \
  --data-binary @working.csv \
  "http://localhost:3000/api/sessions/$SESSION_ID/working"
```

Download a pending UI handoff CSV into the agent workspace:

```sh
SESSION_ID="${SESSION_ID:?Set SESSION_ID from the session response}"

curl -f -o source.csv \
  "http://localhost:3000/api/sessions/$SESSION_ID/handoff/csv"
```

Confirm handoff import after the agent has saved and verified the file:

```sh
SESSION_ID="${SESSION_ID:?Set SESSION_ID from the session response}"

curl -X POST \
  "http://localhost:3000/api/sessions/$SESSION_ID/handoff/confirm"
```
````

Update POC bullets:

```md
- Browser source uploads use `PUT /api/sessions/:sessionId/handoff`.
- Agents import pending UI handoffs with `GET /api/sessions/:sessionId/handoff/csv`.
- Agents confirm handoff import with `POST /api/sessions/:sessionId/handoff/confirm`.
- Agent Working CSV previews use `PUT /api/sessions/:sessionId/working`.
- Viewer updates use Server-Sent Events from `GET /api/sessions/:sessionId/events`.
- The backend stores only pending UI handoff CSVs for up to 30 minutes.
- The backend does not store the latest agent Working CSV Version.
```

- [ ] **Step 2: Update CONTEXT language**

In `CONTEXT.md`, update the backend-related language to include:

```md
**Pending Handoff CSV**:
A UI-uploaded CSV normalized with `_row_id` and held briefly by the Companion Website so the agent can import it into the Python Workspace. It expires after 30 minutes by default or disappears immediately after agent confirmation.
_Avoid_: Working CSV Version, backend source of truth, durable storage
```

Update `Current Table Data`:

```md
**Current Table Data**:
The parsed rows, columns, and lightweight metadata currently displayed by the Companion Website in the active browser. It can be produced from a pending handoff preview or an agent working preview. In the POC, it can live only in the active browser and does not need to be durable.
_Avoid_: Durable CSV, source of truth, Version History
```

Add an example dialogue line:

```md
Domain expert: "If the user uploads the starting CSV through the UI, the Companion Website may hold that Pending Handoff CSV for 30 minutes so the agent can import it, but it must not keep agent Working CSV Versions as current data."
```

- [ ] **Step 3: Add a short ADR if the docs feel split across too many places**

Create `docs/adr/0003-agent-owned-working-csv.md` with:

```md
# Agent-Owned Working CSV Versions

The Companion Website backend is a bridge, not the owner of current working data. Agent Working CSV Versions live in the Python Workspace. Working uploads are validated, relayed to connected viewers, and discarded by the backend after the request.

UI-origin source files are the exception: the backend may normalize a browser upload with `_row_id` and keep it as a Pending Handoff CSV for 30 minutes so the agent can import it. Agent confirmation deletes the handoff immediately.

**Consequences**

- Browser refresh cannot restore the latest agent Working CSV Version from the backend.
- The recovery path is for the agent to upload the current local Working CSV Version again.
- Backend memory may contain pending UI handoff CSVs, but not ongoing agent working data.
- Version history remains deferred.
```

If README and CONTEXT already make the decision obvious, skip the ADR and do not create this file.

- [ ] **Step 4: Run doc scans**

Run:

```bash
rg -n "/api/sessions/[^/[:space:]]+/csv\\b|/api/sessions/[^/[:space:]]+/upload\\b|latestCsv|latest Working CSV Version from an Upload Session" README.md CONTEXT.md docs/adr skills/csv-data-work/SKILL.md
```

Expected: no stale old endpoint guidance remains. Mentions of deferred old designs in existing ADRs are acceptable only if clearly historical.

- [ ] **Step 5: Commit docs**

If no ADR was added:

```bash
git add README.md CONTEXT.md
git commit -m "docs: describe agent-owned csv flow"
```

If ADR was added:

```bash
git add README.md CONTEXT.md docs/adr/0003-agent-owned-working-csv.md
git commit -m "docs: describe agent-owned csv flow"
```

---

## Task 7: End-to-End Verification

**Files:**
- No source edits expected unless verification finds a defect.

- [ ] **Step 1: Run full automated checks**

Run:

```bash
npm test
npm run typecheck
npm run build
```

Expected: all PASS.

- [ ] **Step 2: Start the app**

Run:

```bash
npm run dev
```

Expected: server starts and prints a localhost URL, normally `http://localhost:3000`.

- [ ] **Step 3: Verify UI-origin handoff path manually**

Use the browser to:

1. Open `http://localhost:3000`.
2. Create a new session.
3. Upload a small CSV without `_row_id`:

```csv
latitude,total_rooms
37.88,880
37.86,7099
```

Expected:

- UI shows a preparing state during upload.
- UI renders a table with `latitude` and `total_rooms`; `_row_id` is hidden.
- UI indicates this is a source handoff waiting for agent import.

In a terminal, run:

```bash
SESSION_ID="${SESSION_ID:?Set SESSION_ID from the browser URL}"

curl -f "http://localhost:3000/api/sessions/$SESSION_ID/handoff/csv"
```

Expected output:

```csv
_row_id,latitude,total_rooms
row_000001,37.88,880
row_000002,37.86,7099
```

Confirm:

```bash
curl -X POST "http://localhost:3000/api/sessions/$SESSION_ID/handoff/confirm"
```

Expected response:

```json
{"ok":true,"status":"confirmed"}
```

- [ ] **Step 4: Verify agent working upload path manually**

Run:

```bash
cat >/tmp/working.csv <<'CSV'
_row_id,latitude,total_rooms,rooms_per_latitude
row_000001,37.88,880,23.23
row_000002,37.86,7099,187.51
CSV

curl -X PUT \
  -H 'Content-Type: text/csv' \
  --data-binary @/tmp/working.csv \
  "http://localhost:3000/api/sessions/$SESSION_ID/working"
```

Expected:

- Upload returns `{"ok":true,...}`.
- UI receives a working preview and renders `rooms_per_latitude`.
- Backend does not make this working CSV available at `/handoff/csv` after confirm.

- [ ] **Step 5: Verify refresh tradeoff**

Refresh the browser after the working preview.

Expected:

- If there is no pending handoff, the backend does not replay the working CSV.
- UI copy explains that the preview is live and the agent may need to upload again.

- [ ] **Step 6: Stop dev server**

Stop the `npm run dev` process with `Ctrl-C`.

- [ ] **Step 7: Route verification defects back to the owning task**

If verification finds a defect, return to the task that owns the failing behavior, make the smallest fix there, rerun that task's tests, and use that task's commit pattern. If verification passes without fixes, do not create a commit.

---

## Self-Review Notes

- Spec coverage:
  - Backend no-current-CSV ownership: Tasks 2 and 3.
  - Handoff upload/download/confirm and 30-minute memory retention: Task 2.
  - Working upload validate/relay/discard: Task 3.
  - Separate `handoff-preview` and `working-preview` events: Tasks 3 and 4.
  - UI waiting for normalized handoff: Task 4.
  - Skill row ID helpers and no-data flow: Task 5.
  - README/CONTEXT updates: Task 6.
  - End-to-end verification: Task 7.
- Type consistency:
  - Endpoint names match the design spec: `/handoff`, `/handoff/csv`, `/handoff/confirm`, `/working`.
  - SSE event names match the design spec: `handoff-preview`, `working-preview`.
  - Row identity helper names match the plan snippets: `normalizeHandoffCsv`, `validateWorkingCsv`.
- Red flag scan:
  - The plan contains no unspecified implementation slots.
  - Optional ADR creation is explicitly bounded with exact content and an explicit skip condition.
