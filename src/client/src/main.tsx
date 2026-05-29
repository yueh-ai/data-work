import React, { useEffect, useMemo, useRef, useState } from "react";
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

import { summarizeDiff, type ChangeSummaryItem, type ChangeTarget } from "./changeSummary.js";
import { diffTables } from "./csvDiff.js";
import { parseCsvTable, type ParsedTable, rowIdColumn, visibleColumns } from "./csvTable.js";
import { activeCellClass, firstReviewScrollTarget, removedGhostCellClass } from "./reviewClassNames.js";
import "./styles.css";

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

type ConnectionState = "idle" | "connecting" | "live" | "error";

type ReviewState = {
  previousTable: ParsedTable;
  currentTable: ParsedTable;
  summary: ChangeSummaryItem[];
  activeSummaryId: string | null;
  activeGroup: string | null;
  highlightsCleared: boolean;
};

type ReviewTargetLookup = {
  columnGroups: Map<string, Set<string>>;
  rowGroups: Map<string, Set<string>>;
  cellGroups: Map<string, Set<string>>;
  activeColumns: Set<string>;
  activeRows: Set<string>;
  activeCells: Set<string>;
};

type ReviewScrollRequest = {
  summaryId: string;
  sequence: number;
};

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
  const [previewEvent, setPreviewEvent] = useState<PreviewEvent | null>(null);
  const [table, setTable] = useState<ParsedTable | null>(null);
  const [review, setReview] = useState<ReviewState | null>(null);
  const [scrollRequest, setScrollRequest] = useState<ReviewScrollRequest | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const scrollSequence = useRef(0);
  const secrets = getSessionSecrets(sessionId);

  useEffect(() => {
    setSession(null);
    setConnection("connecting");
    setPreviewEvent(null);
    setTable(null);
    setReview(null);
    setScrollRequest(null);
    setParseError(null);
    setCopyState(null);
    setUploading(false);
    const events = new EventSource(`/api/sessions/${sessionId}/events`);

    events.addEventListener("session", (event) => {
      setSession(JSON.parse((event as MessageEvent).data) as SessionEvent);
      setConnection("live");
    });

    events.addEventListener("handoff-preview", (event) => {
      const next = JSON.parse((event as MessageEvent).data) as HandoffPreviewEvent;
      setPreviewEvent({ ...next, kind: "handoff" });
      setSession((current) => (current ? { ...current, pendingHandoff: true } : current));
      setUploading(false);
      parseCsv(next.csv);
    });

    events.addEventListener("working-preview", (event) => {
      const next = JSON.parse((event as MessageEvent).data) as WorkingPreviewEvent;
      setPreviewEvent({ ...next, kind: "working" });
      setUploading(false);
      parseCsv(next.csv);
    });

    events.addEventListener("handoff-cleared", () => {
      setSession((current) => (current ? { ...current, pendingHandoff: false } : current));
    });

    events.addEventListener("handoff-expired", () => {
      setSession((current) => (current ? { ...current, pendingHandoff: false } : current));
    });

    events.onerror = () => {
      setConnection("error");
    };

    return () => events.close();
  }, [sessionId]);

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

  function parseCsv(csv: string) {
    setParseError(null);
    try {
      const nextTable = parseCsvTable(csv);

      setTable((previousTable) => {
        if (!previousTable) {
          setReview(null);
          return nextTable;
        }

        const summary = summarizeDiff(diffTables(previousTable, nextTable));
        setReview({
          previousTable,
          currentTable: nextTable,
          summary,
          activeSummaryId: summary[0]?.id ?? null,
          activeGroup: null,
          highlightsCleared: false
        });
        return nextTable;
      });
    } catch (err) {
      setTable(null);
      setReview(null);
      setParseError(err instanceof Error ? err.message : "CSV parsing failed.");
    }
  }

  function setActiveSummary(id: string) {
    queueReviewScroll(id);
    setReview((current) => (current ? { ...current, activeSummaryId: id, highlightsCleared: false } : current));
  }

  function setActiveGroup(group: string | null) {
    setReview((current) => (current ? { ...current, activeGroup: current.activeGroup === group ? null : group } : current));
  }

  function moveActiveSummary(direction: -1 | 1) {
    if (!review?.summary.length) {
      return;
    }

    const activeIndex = Math.max(
      0,
      review.summary.findIndex((item) => item.id === review.activeSummaryId)
    );
    const nextIndex = (activeIndex + direction + review.summary.length) % review.summary.length;
    setActiveSummary(review.summary[nextIndex].id);
  }

  function clearHighlights() {
    setReview((current) => (current ? { ...current, highlightsCleared: true } : current));
  }

  function queueReviewScroll(summaryId: string) {
    scrollSequence.current += 1;
    setScrollRequest({ summaryId, sequence: scrollSequence.current });
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
      const response = await fetch(handoffUploadUrl, {
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
        {parseError ? <InlineMessage tone="danger" icon={<AlertTriangle size={16} />} text={parseError} /> : null}
      </section>

      <section className="metrics-grid" aria-label="Current CSV metadata">
        <Metric label="Rows" value={table ? formatNumber(table.rows.length) : "0"} />
        <Metric label="Columns" value={table ? formatNumber(table.columns.length) : "0"} />
        <Metric label="Bytes" value={previewEvent ? formatBytes(previewEvent.bytes) : "None"} />
        <Metric label="Updated" value={previewEvent ? formatTime(previewEvent.uploadedAt) : "Waiting"} />
      </section>

      {table ? (
        <>
          {review ? (
            <ChangeReviewBar
              review={review}
              onSetActiveSummary={setActiveSummary}
              onSetActiveGroup={setActiveGroup}
              onMoveActiveSummary={moveActiveSummary}
              onClearHighlights={clearHighlights}
            />
          ) : null}
          <TablePreview table={table} review={review} scrollRequest={scrollRequest} filename={previewEvent?.filename} />
        </>
      ) : (
        <section className="empty-preview">
          <FileSpreadsheet size={44} />
          <h2>No current CSV</h2>
          <p>
            {session?.pendingHandoff
              ? "Waiting for the normalized handoff preview to arrive."
              : "Upload a source CSV in the browser, or have the agent upload a Working CSV Version."}
          </p>
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

function ChangeReviewBar({
  review,
  onSetActiveSummary,
  onSetActiveGroup,
  onMoveActiveSummary,
  onClearHighlights
}: {
  review: ReviewState;
  onSetActiveSummary: (id: string) => void;
  onSetActiveGroup: (group: string | null) => void;
  onMoveActiveSummary: (direction: -1 | 1) => void;
  onClearHighlights: () => void;
}) {
  const activeIndex = Math.max(
    0,
    review.summary.findIndex((item) => item.id === review.activeSummaryId)
  );
  const visibleDetails = review.activeGroup ? review.summary.filter((item) => groupForSummary(item.kind) === review.activeGroup) : review.summary;

  return (
    <section className={`change-review ${review.highlightsCleared ? "change-review--cleared" : ""}`} aria-label="CSV change review">
      <div className="change-review__top">
        <span className="change-review__updated">Changes from previous upload</span>
        <div className="change-review__chips">
          {review.summary.map((item) => {
            const group = groupForSummary(item.kind);
            return (
              <button
                className={`change-chip change-chip--${group}`}
                aria-pressed={review.activeGroup === group}
                data-active={review.activeGroup === group}
                key={item.id}
                type="button"
                onClick={() => onSetActiveGroup(group)}
              >
                {chipLabel(item)}
              </button>
            );
          })}
        </div>
        <div className="change-review__nav">
          <button
            className="icon-button"
            type="button"
            title="Previous change"
            aria-label="Previous change"
            onClick={() => onMoveActiveSummary(-1)}
          >
            ‹
          </button>
          <span>{review.summary.length ? `${activeIndex + 1} of ${review.summary.length}` : "0 of 0"}</span>
          <button
            className="icon-button"
            type="button"
            title="Next change"
            aria-label="Next change"
            onClick={() => onMoveActiveSummary(1)}
          >
            ›
          </button>
          <button className="clear-button" type="button" onClick={onClearHighlights}>
            Clear Highlights
          </button>
        </div>
      </div>
      {review.highlightsCleared ? <p className="change-review__cleared">Highlights cleared. The table is showing the current Working CSV Version.</p> : null}
      <div className="change-review__details">
        {visibleDetails.map((item) => (
          <button
            className="change-detail"
            aria-current={review.activeSummaryId === item.id ? "true" : undefined}
            data-active={review.activeSummaryId === item.id}
            key={item.id}
            type="button"
            onClick={() => onSetActiveSummary(item.id)}
          >
            <span>{item.label}</span>
            <strong>{detailBadge(item.kind)}</strong>
          </button>
        ))}
      </div>
    </section>
  );
}

function TablePreview({
  table,
  review,
  scrollRequest,
  filename
}: {
  table: ParsedTable;
  review: ReviewState | null;
  scrollRequest: ReviewScrollRequest | null;
  filename?: string | null;
}) {
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const visibleColumnNames = useMemo(() => visibleColumns(table), [table]);
  const removedColumnNames = useMemo(() => removedColumns(review), [review]);
  const removedColumnSet = useMemo(() => new Set(removedColumnNames), [removedColumnNames]);
  const removedGhostRows = useMemo(() => removedRows(review), [review]);
  const previousRowsById = useMemo(() => {
    const rowsById = new Map<string, ParsedTable["rows"][number]>();
    for (const row of review?.previousTable.rows ?? []) {
      rowsById.set(String(row[rowIdColumn] ?? ""), row);
    }
    return rowsById;
  }, [review]);
  const columns = useMemo(
    () => [
      ...visibleColumnNames,
      ...removedColumnNames.filter((column) => !visibleColumnNames.includes(column))
    ],
    [visibleColumnNames, removedColumnNames]
  );
  const reviewTargets = useMemo(() => buildReviewTargetLookup(review), [review]);

  useEffect(() => {
    if (!review || review.highlightsCleared || !scrollRequest) {
      return;
    }

    const target = firstReviewScrollTarget(review.summary, scrollRequest.summaryId);
    const targetElement = target ? findReviewTargetElement(tableScrollRef.current, target) : null;
    targetElement?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
  }, [review, scrollRequest]);

  return (
    <section className="preview-panel" aria-label="Current CSV table">
      <div className="preview-heading">
        <div>
          <h2>{filename ?? "Current Working CSV Version"}</h2>
          <p>{columns.map((column) => `${column}: ${columnType(table, review, column)}`).join(" · ")}</p>
        </div>
      </div>
      {table.warnings.length ? (
        <div className="warning-stack">
          {table.warnings.map((warning) => (
            <InlineMessage key={warning} tone="info" icon={<AlertTriangle size={16} />} text={warning} />
          ))}
        </div>
      ) : null}
      <div className="table-scroll" ref={tableScrollRef}>
        <table>
          <thead>
            <tr>
              <th className="row-number">#</th>
              {columns.map((column) => (
                <th
                  className={columnHeaderClass(reviewTargets, column, removedColumnSet.has(column))}
                  data-review-column={column}
                  key={column}
                >
                  <span>{column}</span>
                  <small>{columnType(table, review, column)}</small>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, index) => {
              const rowId = String(row[rowIdColumn] ?? "");
              return (
                <tr data-review-row={rowId} key={rowId || index}>
                  <td className="row-number">{index + 1}</td>
                  {columns.map((column) => {
                    const isRemovedColumn = removedColumnSet.has(column);
                    return (
                      <td
                        className={cellClass(
                          reviewTargets,
                          rowId,
                          column,
                          isRemovedColumn ? "review-cell review-cell--delete review-column--removed" : ""
                        )}
                        data-review-column={column}
                        data-review-row={rowId}
                        key={column}
                      >
                        {String(isRemovedColumn ? previousRowsById.get(rowId)?.[column] ?? "" : row[column] ?? "")}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {removedGhostRows.map((row, index) => {
              const rowId = String(row[rowIdColumn] ?? "");
              return (
                <tr className="review-row--removed" data-review-row={rowId} key={`removed:${rowId || index}`}>
                  <td className="row-number">−</td>
                  {columns.map((column) => (
                    <td
                      className={removedGhostCellClass({
                        isActiveRow: reviewTargets.activeRows.has(rowId),
                        isRemovedColumn: removedColumnSet.has(column)
                      })}
                      data-review-column={column}
                      data-review-row={rowId}
                      key={column}
                    >
                      {String(row[column] ?? "")}
                    </td>
                  ))}
                </tr>
              );
            })}
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

function groupForSummary(kind: ChangeSummaryItem["kind"]) {
  if (kind === "column_added") {
    return "schema";
  }
  if (kind === "column_removed" || kind === "rows_removed") {
    return "delete";
  }
  if (kind === "rows_added") {
    return "add";
  }
  if (kind === "column_modified" || kind === "cells_modified") {
    return "modify";
  }
  return "neutral";
}

function chipLabel(item: ChangeSummaryItem) {
  if (item.kind === "column_added") {
    return `+${item.count} ${item.count === 1 ? "column" : "columns"}`;
  }
  if (item.kind === "column_removed") {
    return `-${item.count} ${item.count === 1 ? "column" : "columns"}`;
  }
  if (item.kind === "rows_added") {
    return `+${item.count} ${item.count === 1 ? "row" : "rows"}`;
  }
  if (item.kind === "rows_removed") {
    return `-${item.count} ${item.count === 1 ? "row" : "rows"}`;
  }
  if (item.kind === "column_modified") {
    return `${item.count} ${item.count === 1 ? "cell" : "cells"} in column groups`;
  }
  if (item.kind === "cells_modified") {
    return `${item.count} ${item.count === 1 ? "cell" : "cells"} modified`;
  }
  return item.label;
}

function detailBadge(kind: ChangeSummaryItem["kind"]) {
  if (kind === "column_added") {
    return "schema";
  }
  if (kind === "rows_added") {
    return "add";
  }
  if (kind === "column_removed" || kind === "rows_removed") {
    return "delete";
  }
  if (kind === "column_modified" || kind === "cells_modified") {
    return "modify";
  }
  return "info";
}

function removedColumns(review: ReviewState | null) {
  if (!review || review.highlightsCleared) {
    return [];
  }
  return review.summary.flatMap((item) =>
    item.kind === "column_removed"
      ? item.targets.flatMap((target) => (target.kind === "column" ? [target.column] : []))
      : []
  );
}

function removedRows(review: ReviewState | null) {
  if (!review || review.highlightsCleared) {
    return [];
  }
  const removedIds = new Set(
    review.summary.flatMap((item) =>
      item.kind === "rows_removed"
        ? item.targets.flatMap((target) => (target.kind === "row" ? [target.rowId] : []))
        : []
    )
  );
  return review.previousTable.rows.filter((row) => removedIds.has(String(row[rowIdColumn] ?? "")));
}

function columnType(table: ParsedTable, review: ReviewState | null, column: string) {
  return table.types[column] ?? review?.previousTable.types[column] ?? "";
}

function buildReviewTargetLookup(review: ReviewState | null): ReviewTargetLookup {
  const lookup: ReviewTargetLookup = {
    columnGroups: new Map(),
    rowGroups: new Map(),
    cellGroups: new Map(),
    activeColumns: new Set(),
    activeRows: new Set(),
    activeCells: new Set()
  };

  if (!review || review.highlightsCleared) {
    return lookup;
  }

  for (const item of review.summary) {
    const group = groupForSummary(item.kind);
    const isActive = item.id === review.activeSummaryId;

    for (const target of item.targets) {
      if (target.kind === "column") {
        addGroup(lookup.columnGroups, target.column, group);
        if (isActive) {
          lookup.activeColumns.add(target.column);
        }
      } else if (target.kind === "row") {
        addGroup(lookup.rowGroups, target.rowId, group);
        if (isActive) {
          lookup.activeRows.add(target.rowId);
        }
      } else {
        const key = cellKey(target.rowId, target.column);
        addGroup(lookup.cellGroups, key, group);
        if (isActive) {
          lookup.activeCells.add(key);
        }
      }
    }
  }

  return lookup;
}

function columnHeaderClass(lookup: ReviewTargetLookup, column: string, isRemovedColumn = false) {
  const groups = lookup.columnGroups.get(column);
  const classes = classesForGroups(groups);
  if (isRemovedColumn) {
    classes.push("review-cell", "review-cell--delete", "review-column--removed");
  }
  if (lookup.activeColumns.has(column)) {
    classes.push("review-cell--active");
  }
  return classes.join(" ");
}

function cellClass(lookup: ReviewTargetLookup, rowId: string, column: string, baseClass = "") {
  const key = cellKey(rowId, column);
  const groups = new Set<string>();
  mergeGroups(groups, lookup.cellGroups.get(key));
  mergeGroups(groups, lookup.columnGroups.get(column));
  mergeGroups(groups, lookup.rowGroups.get(rowId));

  const classes = [baseClass, ...classesForGroups(groups)];
  classes.push(
    activeCellClass({
      isActiveCell: lookup.activeCells.has(key),
      isActiveColumn: lookup.activeColumns.has(column),
      isActiveRow: lookup.activeRows.has(rowId)
    })
  );

  return classes.filter(Boolean).join(" ");
}

function findReviewTargetElement(root: HTMLElement | null, target: ChangeTarget) {
  if (!root) {
    return null;
  }

  if (target.kind === "column") {
    return findFirstByDataset(root, "reviewColumn", target.column);
  }

  if (target.kind === "row") {
    return findFirstByDataset(root, "reviewRow", target.rowId);
  }

  return findCellByReviewTarget(root, target.rowId, target.column);
}

function findFirstByDataset(root: HTMLElement, key: "reviewColumn" | "reviewRow", value: string) {
  return Array.from(root.querySelectorAll<HTMLElement>(`[data-${key === "reviewColumn" ? "review-column" : "review-row"}]`)).find(
    (element) => element.dataset[key] === value
  ) ?? null;
}

function findCellByReviewTarget(root: HTMLElement, rowId: string, column: string) {
  return Array.from(root.querySelectorAll<HTMLElement>("[data-review-row][data-review-column]")).find(
    (element) => element.dataset.reviewRow === rowId && element.dataset.reviewColumn === column
  ) ?? null;
}

function classesForGroups(groups: Set<string> | undefined) {
  if (!groups?.size) {
    return [];
  }
  return ["review-cell", ...Array.from(groups, (group) => `review-cell--${group}`)];
}

function addGroup(groupsByTarget: Map<string, Set<string>>, target: string, group: string) {
  const groups = groupsByTarget.get(target);
  if (groups) {
    groups.add(group);
  } else {
    groupsByTarget.set(target, new Set([group]));
  }
}

function mergeGroups(target: Set<string>, source: Set<string> | undefined) {
  if (!source) {
    return;
  }
  for (const group of source) {
    target.add(group);
  }
}

function cellKey(rowId: string, column: string) {
  return `${rowId}\u0000${column}`;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}
