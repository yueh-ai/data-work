import {
  Activity,
  AlertTriangle,
  FileSpreadsheet,
  LoaderCircle,
  Upload
} from "lucide-react";

export type ConnectionState = "idle" | "connecting" | "live" | "error";

export function SessionHeader({
  connection,
  uploading,
  onUploadFile
}: {
  connection: ConnectionState;
  uploading: boolean;
  onUploadFile: (file: File | null) => void;
}) {
  return (
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

      <div className="session-actions">
        <label className="file-upload">
          <input
            type="file"
            accept=".csv,text/csv"
            aria-label="Upload source CSV"
            disabled={uploading}
            onChange={(event) => onUploadFile(event.currentTarget.files?.[0] ?? null)}
          />
          {uploading ? <LoaderCircle className="spin" size={18} /> : <Upload size={18} />}
          <span>{uploading ? "Uploading" : "Browser Upload"}</span>
        </label>

        <div className={`status-pill status-pill--${connection}`}>
          {connection === "live" ? (
            <Activity size={15} />
          ) : connection === "connecting" ? (
            <LoaderCircle className="spin" size={15} />
          ) : (
            <AlertTriangle size={15} />
          )}
          <span>{connectionLabel(connection)}</span>
        </div>
      </div>
    </header>
  );
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
