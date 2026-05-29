import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import express, { type Request, type Response } from "express";

import { CsvRowUploadError, normalizeUploadedCsv } from "./csvRows.js";

type Session = {
  id: string;
  createdAt: string;
  latestCsv?: string;
  latestUpload?: UploadNotice;
  viewers: Set<Response>;
};

type UploadNotice = {
  uploadedAt: string;
  filename: string | null;
  bytes: number;
  csv: string;
};

type CreateAppOptions = {
  serveClient?: boolean;
};

const placeholderUploadToken = "POC_PLACEHOLDER_UPLOAD_TOKEN";
const sessions = new Map<string, Session>();

export async function createApp(options: CreateAppOptions = {}) {
  const serveClient = options.serveClient ?? process.env.NODE_ENV === "production";
  const app = express();

  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    next();
  });

  app.post("/api/sessions", (req, res) => {
    const id = crypto.randomUUID();
    const session: Session = {
      id,
      createdAt: new Date().toISOString(),
      viewers: new Set()
    };

    sessions.set(id, session);

    res.status(201).json({
      sessionId: id,
      uploadToken: placeholderUploadToken,
      viewerUrl: `/session/${id}`,
      uploadUrl: `/api/sessions/${id}/upload`,
      downloadUrl: `/api/sessions/${id}/csv`,
      uploadCommand: [
        "curl",
        "-X PUT",
        "-H 'Content-Type: text/csv'",
        "--data-binary @working.csv",
        absoluteUrl(req, `/api/sessions/${id}/upload`)
      ].join(" ")
    });
  });

  app.get("/api/sessions/:sessionId", (req, res) => {
    const session = sessions.get(req.params.sessionId);

    if (!session) {
      res.status(404).json({ error: "Upload Session not found." });
      return;
    }

    res.json({
      sessionId: session.id,
      createdAt: session.createdAt,
      hasCurrentCsv: Boolean(session.latestUpload),
      latestUpload: session.latestUpload
        ? {
            uploadedAt: session.latestUpload.uploadedAt,
            filename: session.latestUpload.filename,
            bytes: session.latestUpload.bytes
          }
        : null
    });
  });

  app.get("/api/sessions/:sessionId/csv", (req, res) => {
    const session = sessions.get(req.params.sessionId);

    if (!session) {
      res.status(404).json({ error: "Upload Session not found." });
      return;
    }

    if (!session.latestCsv || !session.latestUpload) {
      res.status(404).json({ error: "No current CSV for this Upload Session." });
      return;
    }

    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${downloadFilename(session.latestUpload.filename)}"`);
    res.send(session.latestCsv);
  });

  app.get("/api/sessions/:sessionId/events", (req, res) => {
    const session = sessions.get(req.params.sessionId);

    if (!session) {
      res.status(404).end();
      return;
    }

    res.writeHead(200, {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream",
      "X-Accel-Buffering": "no"
    });

    session.viewers.add(res);
    sendEvent(res, "session", {
      sessionId: session.id,
      createdAt: session.createdAt,
      hasCurrentCsv: Boolean(session.latestUpload)
    });

    if (session.latestUpload) {
      sendEvent(res, "csv", session.latestUpload);
    }

    const heartbeat = setInterval(() => {
      res.write(": heartbeat\n\n");
    }, 25_000);

    req.on("close", () => {
      clearInterval(heartbeat);
      session.viewers.delete(res);
    });
  });

  app.put(
    "/api/sessions/:sessionId/upload",
    express.raw({ limit: "1gb", type: () => true }),
    (req, res) => {
      const session = sessions.get(req.params.sessionId);

      if (!session) {
        res.status(404).json({ error: "Upload Session not found." });
        return;
      }

      const body = req.body;
      if (!Buffer.isBuffer(body) || body.length === 0) {
        res.status(400).json({ error: "Upload a non-empty CSV file." });
        return;
      }

      const csv = stripBom(body.toString("utf8"));
      if (!csv.trim()) {
        res.status(400).json({ error: "Upload a CSV file with visible content." });
        return;
      }

      let normalizedCsv: string;
      try {
        normalizedCsv = normalizeUploadedCsv(csv, !session.latestCsv);
      } catch (err) {
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

      const notice: UploadNotice = {
        uploadedAt: new Date().toISOString(),
        filename: parseFilename(req.get("content-disposition")),
        bytes: Buffer.byteLength(normalizedCsv, "utf8"),
        csv: normalizedCsv
      };

      session.latestCsv = normalizedCsv;
      session.latestUpload = notice;

      for (const viewer of session.viewers) {
        sendEvent(viewer, "csv", notice);
      }

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

  if (serveClient) {
    const clientDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../client");
    app.use(express.static(clientDir));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(clientDir, "index.html"));
    });
  } else if (options.serveClient === undefined && process.env.NODE_ENV !== "test") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      configFile: path.resolve("vite.config.ts"),
      server: { middlewareMode: true },
      appType: "spa"
    });

    app.use(vite.middlewares);
  }

  return app;
}

function sendEvent(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function stripBom(value: string) {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

function parseFilename(contentDisposition: string | undefined) {
  if (!contentDisposition) {
    return null;
  }

  const match = contentDisposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  return match ? decodeURIComponent(match[1]) : null;
}

function absoluteUrl(req: Request, pathname: string) {
  const protocol = req.get("x-forwarded-proto") ?? req.protocol;
  return `${protocol}://${req.get("host")}${pathname}`;
}

function downloadFilename(filename: string | null) {
  return filename?.replace(/["\r\n]/g, "") || "working.csv";
}
