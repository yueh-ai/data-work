import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

import { CsvRowUploadError, normalizeHandoffCsv, validateWorkingCsv } from "./csvRows.js";

async function withTestServer(run: (origin: string) => Promise<void>) {
  const { createApp } = await import("./app.js");
  const app = await createApp({ serveClient: false });
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

async function uploadCsv(origin: string, sessionId: string, csv: string) {
  return fetch(`${origin}/api/sessions/${sessionId}/upload`, {
    method: "PUT",
    headers: {
      "Content-Disposition": 'attachment; filename="working.csv"',
      "Content-Type": "text/csv"
    },
    body: csv
  });
}

async function downloadCsv(origin: string, sessionId: string) {
  const response = await fetch(`${origin}/api/sessions/${sessionId}/csv`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/csv/);
  return response.text();
}

async function readUploadError(response: Response) {
  return (await response.json()) as { error: string; message?: string; detail?: string };
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

test("uploads can omit auth and the latest CSV can be downloaded", async () => {
  await withTestServer(async (origin) => {
    const session = await createSession(origin);

    assert.equal(session.uploadToken, "POC_PLACEHOLDER_UPLOAD_TOKEN");

    const csv = "latitude,total_rooms\n37.88,880\n";
    const uploadResponse = await uploadCsv(origin, session.sessionId, csv);
    assert.equal(uploadResponse.status, 200);
    assert.equal(await downloadCsv(origin, session.sessionId), "_row_id,latitude,total_rooms\nrow_000001,37.88,880\n");
  });
});

test("first upload adds sequential row ids and download returns normalized CSV", async () => {
  await withTestServer(async (origin) => {
    const session = await createSession(origin);

    const uploadResponse = await uploadCsv(origin, session.sessionId, "latitude,total_rooms\n37.88,880\n37.86,7099\n");
    assert.equal(uploadResponse.status, 200);

    assert.equal(await downloadCsv(origin, session.sessionId), "_row_id,latitude,total_rooms\nrow_000001,37.88,880\nrow_000002,37.86,7099\n");
  });
});

test("header-only first upload downloads normalized headers", async () => {
  await withTestServer(async (origin) => {
    const session = await createSession(origin);

    const uploadResponse = await uploadCsv(origin, session.sessionId, "latitude,total_rooms\n");
    assert.equal(uploadResponse.status, 200);

    assert.equal(await downloadCsv(origin, session.sessionId), "_row_id,latitude,total_rooms\n");
  });
});

test("first upload preserves valid existing row ids", async () => {
  await withTestServer(async (origin) => {
    const session = await createSession(origin);

    const csv = "_row_id,latitude,total_rooms\nrow_000010,37.88,880\nrow_000011,37.86,7099\n";
    const uploadResponse = await uploadCsv(origin, session.sessionId, csv);
    assert.equal(uploadResponse.status, 200);

    assert.equal(await downloadCsv(origin, session.sessionId), csv);
  });
});

test("later upload missing row ids is rejected with diagnostic error", async () => {
  await withTestServer(async (origin) => {
    const session = await createSession(origin);
    assert.equal((await uploadCsv(origin, session.sessionId, "latitude,total_rooms\n37.88,880\n")).status, 200);

    const uploadResponse = await uploadCsv(origin, session.sessionId, "latitude,total_rooms\n37.89,881\n");
    assert.equal(uploadResponse.status, 400);

    assert.deepEqual(await uploadResponse.json(), {
      error: "missing_row_id",
      message: "Upload rejected: missing required _row_id column.",
      detail:
        "This session already has a normalized Working CSV Version with _row_id. The uploaded CSV appears to be an original or reset file rather than a continuation of the current Working CSV Version."
    });
  });
});

test("uploads reject duplicate and empty row ids", async () => {
  await withTestServer(async (origin) => {
    const duplicateSession = await createSession(origin);
    const duplicateResponse = await uploadCsv(origin, duplicateSession.sessionId, "_row_id,latitude\nrow_000001,37.88\nrow_000001,37.86\n");
    assert.equal(duplicateResponse.status, 400);
    assert.equal((await readUploadError(duplicateResponse)).error, "duplicate_row_id");

    const emptySession = await createSession(origin);
    const emptyResponse = await uploadCsv(origin, emptySession.sessionId, "_row_id,latitude\nrow_000001,37.88\n,37.86\n");
    assert.equal(emptyResponse.status, 400);
    assert.equal((await readUploadError(emptyResponse)).error, "empty_row_id");
  });
});
