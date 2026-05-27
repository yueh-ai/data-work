import http from "node:http";

import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 3000);
const app = await createApp();
const server = http.createServer(app);

server.listen(port, () => {
  console.log(`CSV Companion Website listening on http://localhost:${port}`);
});

process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});
