import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import express, { type Request, type Response } from "express";

type Session = {
  id: string;
  createdAt: string;
  latestCsv?: string;
  latestUpload?: UploadNotice;
  uploads: UploadNotice[];
  viewers: Set<Response>;
};

type UploadNotice = {
  version: number;
  uploadedAt: string;
  filename: string | null;
  bytes: number;
  csv: string;
  summary: CsvSummary;
};

type CsvSummary = {
  rowCount: number;
  columnCount: number;
  columns: string[];
  sampleRows: string[][];
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
      uploads: [],
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
            version: session.latestUpload.version,
            uploadedAt: session.latestUpload.uploadedAt,
            filename: session.latestUpload.filename,
            bytes: session.latestUpload.bytes,
            summary: session.latestUpload.summary
          }
        : null
    });
  });

  app.get("/api/sessions/:sessionId/compare", (req, res) => {
    const session = sessions.get(req.params.sessionId);

    if (!session) {
      res.status(404).json({ error: "Upload Session not found." });
      return;
    }

    res.setHeader("Cache-Control", "no-store");
    res.json(buildComparePayload(session));
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
      sendEvent(res, "compare", buildComparePayload(session));
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

      const notice: UploadNotice = {
        version: (session.latestUpload?.version ?? 0) + 1,
        uploadedAt: new Date().toISOString(),
        filename: parseFilename(req.get("content-disposition")),
        bytes: body.length,
        csv,
        summary: summarizeCsv(csv)
      };

      session.latestCsv = csv;
      session.latestUpload = notice;
      session.uploads = [...session.uploads, notice].slice(-2);

      for (const viewer of session.viewers) {
        sendEvent(viewer, "csv", notice);
        sendEvent(viewer, "compare", buildComparePayload(session));
      }

      res.json({
        ok: true,
        sessionId: session.id,
        uploadedAt: notice.uploadedAt,
        filename: notice.filename,
        bytes: notice.bytes,
        version: notice.version,
        summary: notice.summary,
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

function buildComparePayload(session: Session) {
  const [previous, current] = session.uploads.length > 1 ? session.uploads : [null, session.uploads[0] ?? null];

  return {
    sessionId: session.id,
    previous: previous ? describeUpload(previous) : null,
    current: current ? describeUpload(current) : null,
    delta: previous && current ? compareSummaries(previous.summary, current.summary) : null
  };
}

function describeUpload(upload: UploadNotice) {
  return {
    version: upload.version,
    uploadedAt: upload.uploadedAt,
    filename: upload.filename,
    bytes: upload.bytes,
    summary: upload.summary
  };
}

function compareSummaries(previous: CsvSummary, current: CsvSummary) {
  const currentColumns = new Set(current.columns);
  const previousColumns = new Set(previous.columns);

  return {
    rowCount: {
      previous: previous.rowCount,
      current: current.rowCount,
      changed: current.rowCount - previous.rowCount
    },
    columnCount: {
      previous: previous.columnCount,
      current: current.columnCount,
      changed: current.columnCount - previous.columnCount
    },
    removedColumns: previous.columns.filter((column) => !currentColumns.has(column)),
    addedColumns: current.columns.filter((column) => !previousColumns.has(column)),
    retainedColumns: previous.columns.filter((column) => currentColumns.has(column))
  };
}

function summarizeCsv(csv: string): CsvSummary {
  const records = parseCsvRecords(csv);
  const header = records[0]?.map((column) => column.trim()).filter(Boolean) ?? [];
  const rows = records.slice(1).filter((row) => row.some((value) => value.trim()));

  return {
    rowCount: rows.length,
    columnCount: header.length,
    columns: header,
    sampleRows: rows.slice(0, 12).map((row) => header.map((_column, index) => row[index] ?? ""))
  };
}

function parseCsvRecords(csv: string) {
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const next = csv[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      record.push(field);
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      record.push(field);
      records.push(record);
      record = [];
      field = "";
      continue;
    }

    field += char;
  }

  if (field || record.length) {
    record.push(field);
    records.push(record);
  }

  return records;
}
