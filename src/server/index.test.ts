import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

import { CsvRowUploadError, normalizeHandoffCsv, validateWorkingCsv } from "./csvRows.js";

async function withTestServer(
  run: (origin: string) => Promise<void>,
  options: { serveClient?: boolean; handoffTtlMs?: number } = {}
) {
  const { createApp } = await import("./app.js");
  const app = await createApp({ serveClient: false, ...options });
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, resolve);
  });

  try {
    const address = server.address();
    assert(address && typeof address === "object");
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

async function createSession(origin: string) {
  const sessionResponse = await fetch(`${origin}/api/sessions`, { method: "POST" });
  assert.equal(sessionResponse.status, 201);
  return (await sessionResponse.json()) as { sessionId: string; uploadToken: string };
}

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

test("expired handoff csv is not downloadable", async () => {
  await withTestServer(
    async (origin) => {
      const session = await createSession(origin);
      assert.equal((await uploadHandoffCsv(origin, session.sessionId, "latitude\n37.88\n")).status, 200);

      await new Promise((resolve) => setTimeout(resolve, 40));

      const downloadResponse = await fetch(`${origin}/api/sessions/${session.sessionId}/handoff/csv`);
      assert.equal(downloadResponse.status, 404);
    },
    { handoffTtlMs: 20 }
  );
});
