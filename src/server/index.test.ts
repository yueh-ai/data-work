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
