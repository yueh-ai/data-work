import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  AlertTriangle,
  Check,
  Clipboard,
  CloudUpload,
  Download,
  FileSpreadsheet,
  KeyRound,
  LoaderCircle,
  Plus,
  RefreshCw,
  Table2,
  Upload
} from "lucide-react";
import Papa from "papaparse";

import "./styles.css";

type SessionCreateResponse = {
  sessionId: string;
  uploadToken: string;
  viewerUrl: string;
  uploadUrl: string;
  downloadUrl: string;
  uploadCommand: string;
};

type SessionEvent = {
  sessionId: string;
  createdAt: string;
  hasCurrentCsv: boolean;
};

type CsvEvent = {
  uploadedAt: string;
  filename: string | null;
  bytes: number;
  csv: string;
};

type ParsedTable = {
  columns: string[];
  rows: Record<string, string>[];
  types: Record<string, string>;
  warnings: string[];
};

type ConnectionState = "idle" | "connecting" | "live" | "error";

const root = createRoot(document.getElementById("root") as HTMLElement);
root.render(<App />);

function App() {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const route = readRoute(path);

  if (route.sessionId) {
    return <SessionView sessionId={route.sessionId} />;
  }

  return <CreateSession />;
}

function CreateSession() {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createSession() {
    setCreating(true);
    setError(null);

    try {
      const response = await fetch("/api/sessions", { method: "POST" });
      const data = (await response.json()) as SessionCreateResponse;

      if (!response.ok) {
        throw new Error("Session creation failed.");
      }

      saveSessionSecrets(data);
      window.history.pushState(null, "", data.viewerUrl);
      window.dispatchEvent(new PopStateEvent("popstate"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Session creation failed.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="app-shell app-shell--center">
      <section className="start-panel" aria-labelledby="start-title">
        <div className="brand-mark" aria-hidden="true">
          <FileSpreadsheet size={34} />
        </div>
        <div>
          <p className="eyebrow">CSV Companion</p>
          <h1 id="start-title">Current CSV preview for AI data work</h1>
        </div>
        <button className="primary-action" type="button" onClick={createSession} disabled={creating}>
          {creating ? <LoaderCircle className="spin" size={18} /> : <Plus size={18} />}
          <span>New Upload Session</span>
        </button>
        {error ? <InlineMessage tone="danger" icon={<AlertTriangle size={16} />} text={error} /> : null}
      </section>
    </main>
  );
}

function SessionView({ sessionId }: { sessionId: string }) {
  const [session, setSession] = useState<SessionEvent | null>(null);
  const [connection, setConnection] = useState<ConnectionState>("idle");
  const [csvEvent, setCsvEvent] = useState<CsvEvent | null>(null);
  const [table, setTable] = useState<ParsedTable | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const secrets = getSessionSecrets(sessionId);

  useEffect(() => {
    setConnection("connecting");
    const events = new EventSource(`/api/sessions/${sessionId}/events`);

    events.addEventListener("session", (event) => {
      setSession(JSON.parse((event as MessageEvent).data) as SessionEvent);
      setConnection("live");
    });

    events.addEventListener("csv", (event) => {
      const next = JSON.parse((event as MessageEvent).data) as CsvEvent;
      setCsvEvent(next);
      parseCsv(next.csv);
    });

    events.onerror = () => {
      setConnection("error");
    };

    return () => events.close();
  }, [sessionId]);

  const uploadUrl = `/api/sessions/${sessionId}/upload`;
  const downloadUrl = `${window.location.origin}/api/sessions/${sessionId}/csv`;
  const viewerUrl = `${window.location.origin}/session/${sessionId}`;
  const command = useMemo(() => {
    return [
      "curl",
      "-X PUT",
      "-H 'Content-Type: text/csv'",
      "--data-binary @working.csv",
      `${window.location.origin}${uploadUrl}`
    ].join(" ");
  }, [uploadUrl]);

  async function parseCsv(csv: string) {
    setParseError(null);
    try {
      const parsed = Papa.parse<Record<string, string>>(csv, {
        header: true,
        skipEmptyLines: "greedy",
        transformHeader: (header) => header.trim()
      });

      if (parsed.errors.length) {
        const first = parsed.errors[0];
        throw new Error(`${first.message}${first.row !== undefined ? ` at row ${first.row + 1}` : ""}.`);
      }

      const columns = parsed.meta.fields?.filter(Boolean) ?? [];
      const rows = parsed.data.filter((row) => Object.values(row).some((value) => String(value ?? "").trim()));

      if (!columns.length) {
        throw new Error("The CSV header row is empty.");
      }

      setTable({
        columns,
        rows,
        types: inferColumnTypes(columns, rows),
        warnings: buildWarnings(columns, rows)
      });
    } catch (err) {
      setTable(null);
      setParseError(err instanceof Error ? err.message : "CSV parsing failed.");
    }
  }

  async function copy(label: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopyState(label);
    window.setTimeout(() => setCopyState(null), 1600);
  }

  async function uploadFile(file: File | null) {
    if (!file) {
      return;
    }

    setUploading(true);
    setParseError(null);
    try {
      const response = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type || "text/csv",
          "Content-Disposition": `attachment; filename="${encodeURIComponent(file.name)}"`
        },
        body: await file.arrayBuffer()
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Upload failed.");
      }
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <main className="app-shell">
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
        <div className={`status-pill status-pill--${connection}`}>
          {connection === "live" ? <Activity size={15} /> : connection === "connecting" ? <LoaderCircle className="spin" size={15} /> : <AlertTriangle size={15} />}
          <span>{connectionLabel(connection)}</span>
        </div>
      </header>

      <section className="control-band" aria-label="Upload Session controls">
        <InfoBlock
          icon={<Table2 size={18} />}
          label="Viewer URL"
          value={viewerUrl}
          actionLabel="Copy Viewer URL"
          onCopy={() => copy("viewer", viewerUrl)}
          copied={copyState === "viewer"}
        />
        <InfoBlock
          icon={<KeyRound size={18} />}
          label="Upload Token"
          value={secrets?.uploadToken ?? "POC placeholder token; uploads do not require auth"}
          actionLabel="Copy upload token placeholder"
          onCopy={secrets?.uploadToken ? () => copy("token", secrets.uploadToken) : undefined}
          copied={copyState === "token"}
        />
        <InfoBlock
          icon={<Download size={18} />}
          label="Download URL"
          value={downloadUrl}
          actionLabel="Copy Download URL"
          onCopy={() => copy("download", downloadUrl)}
          copied={copyState === "download"}
        />
        <div className="command-block">
          <div className="block-heading">
            <CloudUpload size={18} />
            <span>Upload Command</span>
            <button className="icon-button" type="button" title="Copy upload command" onClick={() => copy("command", command)}>
              {copyState === "command" ? <Check size={16} /> : <Clipboard size={16} />}
            </button>
          </div>
          <code>{command}</code>
        </div>
        <label className="file-upload">
          <input
            type="file"
            accept=".csv,text/csv"
            disabled={uploading}
            onChange={(event) => uploadFile(event.currentTarget.files?.[0] ?? null)}
          />
          {uploading ? <LoaderCircle className="spin" size={18} /> : <Upload size={18} />}
          <span>{uploading ? "Uploading" : "Browser Upload"}</span>
        </label>
      </section>

      <section className="notice-row" aria-live="polite">
        <InlineMessage
          tone="info"
          icon={<RefreshCw size={16} />}
          text="Ephemeral POC state. Refresh, disconnect, or backend restart can clear the current table."
        />
        {parseError ? <InlineMessage tone="danger" icon={<AlertTriangle size={16} />} text={parseError} /> : null}
      </section>

      <section className="metrics-grid" aria-label="Current CSV metadata">
        <Metric label="Rows" value={table ? formatNumber(table.rows.length) : "0"} />
        <Metric label="Columns" value={table ? formatNumber(table.columns.length) : "0"} />
        <Metric label="Bytes" value={csvEvent ? formatBytes(csvEvent.bytes) : "None"} />
        <Metric label="Updated" value={csvEvent ? formatTime(csvEvent.uploadedAt) : "Waiting"} />
      </section>

      {table ? (
        <TablePreview table={table} filename={csvEvent?.filename} />
      ) : (
        <section className="empty-preview">
          <FileSpreadsheet size={44} />
          <h2>No current CSV</h2>
          <p>{session?.hasCurrentCsv ? "Waiting for the current upload to arrive." : "Upload the initial Working CSV Version to populate the table."}</p>
        </section>
      )}
    </main>
  );
}

function InfoBlock({
  icon,
  label,
  value,
  actionLabel,
  onCopy,
  copied
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  actionLabel: string;
  onCopy?: () => void;
  copied: boolean;
}) {
  return (
    <div className="info-block">
      <div className="block-heading">
        {icon}
        <span>{label}</span>
        <button className="icon-button" type="button" title={actionLabel} onClick={onCopy} disabled={!onCopy}>
          {copied ? <Check size={16} /> : <Clipboard size={16} />}
        </button>
      </div>
      <code>{value}</code>
    </div>
  );
}

function InlineMessage({ tone, icon, text }: { tone: "info" | "danger"; icon: React.ReactNode; text: string }) {
  return (
    <div className={`inline-message inline-message--${tone}`}>
      {icon}
      <span>{text}</span>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function TablePreview({ table, filename }: { table: ParsedTable; filename?: string | null }) {
  return (
    <section className="preview-panel" aria-label="Current CSV table">
      <div className="preview-heading">
        <div>
          <h2>{filename ?? "Current Working CSV Version"}</h2>
          <p>{table.columns.map((column) => `${column}: ${table.types[column]}`).join(" · ")}</p>
        </div>
      </div>
      {table.warnings.length ? (
        <div className="warning-stack">
          {table.warnings.map((warning) => (
            <InlineMessage key={warning} tone="info" icon={<AlertTriangle size={16} />} text={warning} />
          ))}
        </div>
      ) : null}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th className="row-number">#</th>
              {table.columns.map((column) => (
                <th key={column}>
                  <span>{column}</span>
                  <small>{table.types[column]}</small>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, index) => (
              <tr key={index}>
                <td className="row-number">{index + 1}</td>
                {table.columns.map((column) => (
                  <td key={column}>{String(row[column] ?? "")}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function readRoute(path: string) {
  const match = path.match(/^\/session\/([^/]+)$/);
  return { sessionId: match?.[1] };
}

function saveSessionSecrets(session: SessionCreateResponse) {
  localStorage.setItem(
    `csv-companion:${session.sessionId}`,
    JSON.stringify({
      uploadToken: session.uploadToken,
      uploadUrl: session.uploadUrl,
      downloadUrl: session.downloadUrl,
      uploadCommand: session.uploadCommand
    })
  );
}

function getSessionSecrets(sessionId: string) {
  const raw = localStorage.getItem(`csv-companion:${sessionId}`);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as Pick<SessionCreateResponse, "uploadToken" | "uploadUrl" | "downloadUrl" | "uploadCommand">;
  } catch {
    return null;
  }
}

function inferColumnTypes(columns: string[], rows: Record<string, string>[]) {
  return Object.fromEntries(
    columns.map((column) => {
      const values = rows.map((row) => String(row[column] ?? "").trim()).filter(Boolean);
      return [column, inferType(values)];
    })
  );
}

function inferType(values: string[]) {
  if (!values.length) {
    return "empty";
  }

  const sample = values.slice(0, 500);
  if (sample.every((value) => /^(true|false|yes|no)$/i.test(value))) {
    return "boolean";
  }
  if (sample.every((value) => /^-?\d+$/.test(value))) {
    return "integer";
  }
  if (sample.every((value) => value !== "" && Number.isFinite(Number(value)))) {
    return "number";
  }
  if (sample.every((value) => !Number.isNaN(Date.parse(value)))) {
    return "date";
  }
  return "text";
}

function buildWarnings(columns: string[], rows: Record<string, string>[]) {
  const warnings: string[] = [];
  if (columns.length > 100) {
    warnings.push("Wide CSV: the browser is rendering every column for this POC.");
  }
  if (rows.length > 10_000) {
    warnings.push("Large CSV: the browser is rendering every row for this POC.");
  }
  return warnings;
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

function formatNumber(value: number) {
  return new Intl.NumberFormat().format(value);
}

function formatBytes(value: number) {
  if (value < 1024) {
    return `${value} B`;
  }
  const units = ["KiB", "MiB", "GiB"];
  let size = value / 1024;
  let unit = units[0];
  for (let index = 1; size >= 1024 && index < units.length; index += 1) {
    size /= 1024;
    unit = units[index];
  }
  return `${size.toFixed(size >= 10 ? 1 : 2)} ${unit}`;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}
