import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import express, { type Request, type Response } from "express";

import { CsvRowUploadError, normalizeHandoffCsv, validateWorkingCsv } from "./csvRows.js";

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

type HandoffPreviewNotice = {
  uploadedAt: string;
  expiresAt: string;
  filename: string | null;
  bytes: number;
  csv: string;
};

type WorkingPreviewNotice = Omit<HandoffPreviewNotice, "expiresAt">;

type CreateAppOptions = {
  serveClient?: boolean;
  handoffTtlMs?: number;
};

const placeholderUploadToken = "POC_PLACEHOLDER_UPLOAD_TOKEN";
const defaultHandoffTtlMs = 30 * 60 * 1000;
const sessions = new Map<string, Session>();

export async function createApp(options: CreateAppOptions = {}) {
  const serveClient = options.serveClient ?? process.env.NODE_ENV === "production";
  const handoffTtlMs = options.handoffTtlMs ?? defaultHandoffTtlMs;
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
      activeViewers: session.viewers.size,
      pendingHandoff: session.pendingHandoff ? pendingHandoffMetadata(session.pendingHandoff) : null
    });
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
      pendingHandoff: Boolean(session.pendingHandoff)
    });

    if (session.pendingHandoff) {
      sendEvent(res, "handoff-preview", {
        ...pendingHandoffMetadata(session.pendingHandoff),
        csv: session.pendingHandoff.csv
      });
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
        if (err instanceof CsvRowUploadError) {
          sendCsvError(res, err);
          return;
        }
        throw err;
      }

      clearPendingHandoff(session);

      const uploadedAt = new Date();
      const expiresAt = new Date(uploadedAt.getTime() + handoffTtlMs);
      const pendingHandoff: PendingHandoff = {
        uploadedAt: uploadedAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        filename: parseFilename(req.get("content-disposition")),
        bytes: Buffer.byteLength(normalizedCsv, "utf8"),
        csv: normalizedCsv,
        timer: setTimeout(() => expirePendingHandoff(session, pendingHandoff), handoffTtlMs)
      };
      pendingHandoff.timer.unref?.();
      session.pendingHandoff = pendingHandoff;

      const notice: HandoffPreviewNotice = {
        ...pendingHandoffMetadata(pendingHandoff),
        csv: pendingHandoff.csv
      };
      sendToViewers(session, "handoff-preview", notice);

      res.json({
        ok: true,
        sessionId: session.id,
        pendingHandoff: pendingHandoffMetadata(pendingHandoff),
        activeViewers: session.viewers.size
      });
    }
  );

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
        if (err instanceof CsvRowUploadError) {
          sendCsvError(res, err);
          return;
        }
        throw err;
      }

      const notice: WorkingPreviewNotice = {
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

  app.get("/api/sessions/:sessionId/handoff/csv", (req, res) => {
    const session = sessions.get(req.params.sessionId);

    if (!session) {
      res.status(404).json({ error: "Upload Session not found." });
      return;
    }

    if (!session.pendingHandoff) {
      res.status(404).json({ error: "No pending handoff CSV for this Upload Session." });
      return;
    }

    if (Date.now() >= Date.parse(session.pendingHandoff.expiresAt)) {
      expirePendingHandoff(session, session.pendingHandoff);
      res.status(404).json({ error: "No pending handoff CSV for this Upload Session." });
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

function pendingHandoffMetadata(pendingHandoff: PendingHandoff) {
  return {
    uploadedAt: pendingHandoff.uploadedAt,
    expiresAt: pendingHandoff.expiresAt,
    filename: pendingHandoff.filename,
    bytes: pendingHandoff.bytes
  };
}

function clearPendingHandoff(session: Session) {
  if (!session.pendingHandoff) {
    return;
  }

  clearTimeout(session.pendingHandoff.timer);
  session.pendingHandoff = undefined;
}

function expirePendingHandoff(session: Session, pendingHandoff: PendingHandoff) {
  if (session.pendingHandoff !== pendingHandoff) {
    return;
  }

  clearPendingHandoff(session);
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

function sendCsvError(res: Response, err: CsvRowUploadError) {
  res.status(400).json({
    error: err.code,
    message: err.message,
    ...(err.detail ? { detail: err.detail } : {})
  });
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
  return filename?.replace(/["\r\n]/g, "") || "source.csv";
}
