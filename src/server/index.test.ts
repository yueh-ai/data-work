import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

import { createApp } from "./app.js";

test("uploads can omit auth and the latest CSV can be downloaded", async () => {
  const app = await createApp({ serveClient: false });
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, resolve);
  });

  try {
    const address = server.address();
    assert(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;

    const sessionResponse = await fetch(`${origin}/api/sessions`, { method: "POST" });
    assert.equal(sessionResponse.status, 201);
    const session = (await sessionResponse.json()) as { sessionId: string; uploadToken: string };

    assert.equal(session.uploadToken, "POC_PLACEHOLDER_UPLOAD_TOKEN");

    const csv = "latitude,total_rooms\n37.88,880\n";
    const uploadResponse = await fetch(`${origin}/api/sessions/${session.sessionId}/upload`, {
      method: "PUT",
      headers: {
        "Content-Disposition": 'attachment; filename="working.csv"',
        "Content-Type": "text/csv"
      },
      body: csv
    });

    assert.equal(uploadResponse.status, 200);

    const downloadResponse = await fetch(`${origin}/api/sessions/${session.sessionId}/csv`);
    assert.equal(downloadResponse.status, 200);
    assert.match(downloadResponse.headers.get("content-type") ?? "", /^text\/csv/);
    assert.equal(await downloadResponse.text(), csv);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test("sessions keep the latest two uploads with structural compare metadata", async () => {
  const app = await createApp({ serveClient: false });
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, resolve);
  });

  try {
    const address = server.address();
    assert(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;

    const sessionResponse = await fetch(`${origin}/api/sessions`, { method: "POST" });
    assert.equal(sessionResponse.status, 201);
    const session = (await sessionResponse.json()) as { sessionId: string };

    const firstCsv = [
      "longitude,latitude,total_rooms",
      "-122.23,37.88,880",
      "-122.22,37.86,7099"
    ].join("\n");
    const secondCsv = [
      "latitude,total_rooms",
      "37.88,880",
      "37.86,7099"
    ].join("\n");

    await uploadCsv(origin, session.sessionId, firstCsv, "before.csv");
    await uploadCsv(origin, session.sessionId, secondCsv, "after.csv");

    const compareResponse = await fetch(`${origin}/api/sessions/${session.sessionId}/compare`);
    assert.equal(compareResponse.status, 200);
    const compare = (await compareResponse.json()) as {
      previous: {
        filename: string | null;
        summary: { rowCount: number; columnCount: number; columns: string[]; sampleRows: string[][] };
      } | null;
      current: {
        filename: string | null;
        summary: { rowCount: number; columnCount: number; columns: string[]; sampleRows: string[][] };
      } | null;
      delta: {
        rowCount: { previous: number; current: number; changed: number };
        columnCount: { previous: number; current: number; changed: number };
        removedColumns: string[];
        addedColumns: string[];
        retainedColumns: string[];
      } | null;
    };

    assert.equal(compare.previous?.filename, "before.csv");
    assert.equal(compare.current?.filename, "after.csv");
    assert.deepEqual(compare.previous?.summary.columns, ["longitude", "latitude", "total_rooms"]);
    assert.deepEqual(compare.current?.summary.columns, ["latitude", "total_rooms"]);
    assert.equal(compare.previous?.summary.rowCount, 2);
    assert.equal(compare.current?.summary.rowCount, 2);
    assert.equal(compare.delta?.rowCount.changed, 0);
    assert.deepEqual(compare.delta?.columnCount, { previous: 3, current: 2, changed: -1 });
    assert.deepEqual(compare.delta?.removedColumns, ["longitude"]);
    assert.deepEqual(compare.delta?.addedColumns, []);
    assert.deepEqual(compare.previous?.summary.sampleRows[0], ["-122.23", "37.88", "880"]);
    assert.deepEqual(compare.current?.summary.sampleRows[0], ["37.88", "880"]);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

async function uploadCsv(origin: string, sessionId: string, csv: string, filename: string) {
  const response = await fetch(`${origin}/api/sessions/${sessionId}/upload`, {
    method: "PUT",
    headers: {
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type": "text/csv"
    },
    body: csv
  });

  assert.equal(response.status, 200);
}
