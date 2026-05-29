import Papa from "papaparse";

export const rowIdColumn = "_row_id";
const missingWorkingRowIdDetail =
  "Working CSV uploads must include _row_id. If this is agent-origin data, create _row_id in the Python Workspace before uploading. If this is UI-origin data, import the normalized handoff CSV first.";

export type CsvRowUploadErrorCode = "missing_row_id" | "duplicate_row_id" | "empty_row_id" | "csv_parse_error";

export class CsvRowUploadError extends Error {
  constructor(
    public readonly code: CsvRowUploadErrorCode,
    message: string,
    public readonly detail?: string
  ) {
    super(message);
  }
}

export function normalizeHandoffCsv(csv: string) {
  const { fields, rows } = parseCsv(csv);
  const hasRowId = fields.includes(rowIdColumn);
  const outputFields = hasRowId ? fields : [rowIdColumn, ...fields];
  const outputRows = hasRowId
    ? rows
    : rows.map((row, index) => ({
        [rowIdColumn]: formatRowId(index + 1),
        ...row
      }));

  validateRowIds(outputRows);

  return serializeCsv(outputFields, outputRows);
}

export function validateWorkingCsv(csv: string) {
  const { fields, rows } = parseCsv(csv);

  if (!fields.includes(rowIdColumn)) {
    throw new CsvRowUploadError("missing_row_id", "Upload rejected: missing required _row_id column.", missingWorkingRowIdDetail);
  }

  validateRowIds(rows);

  return serializeCsv(fields, rows);
}

function parseCsv(csv: string) {
  const parsed = Papa.parse<Record<string, string>>(csv, {
    delimiter: ",",
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.trim()
  });

  if (parsed.errors.length) {
    const first = parsed.errors[0];
    throw new CsvRowUploadError("csv_parse_error", `${first.message}${first.row !== undefined ? ` at row ${first.row + 1}` : ""}.`);
  }

  const fields = parsed.meta.fields?.filter(Boolean) ?? [];
  if (!fields.length) {
    throw new CsvRowUploadError("csv_parse_error", "The CSV header row is empty.");
  }

  const rows = parsed.data.filter((row) => Object.values(row).some((value) => String(value ?? "").trim()));

  return { fields, rows };
}

function validateRowIds(rows: Record<string, string>[]) {
  const seen = new Set<string>();

  for (const row of rows) {
    const rowId = String(row[rowIdColumn] ?? "").trim();
    if (!rowId) {
      throw new CsvRowUploadError("empty_row_id", "Upload rejected: _row_id values must be non-empty.");
    }
    if (seen.has(rowId)) {
      throw new CsvRowUploadError("duplicate_row_id", `Upload rejected: duplicate _row_id value "${rowId}".`);
    }
    seen.add(rowId);
  }
}

function serializeCsv(fields: string[], rows: Record<string, string>[]) {
  return ensureTrailingNewline(Papa.unparse({
    fields,
    data: rows
  }, {
    columns: fields,
    header: true,
    newline: "\n"
  }));
}

function formatRowId(value: number) {
  return `row_${String(value).padStart(6, "0")}`;
}

function ensureTrailingNewline(value: string) {
  return value.endsWith("\n") ? value : `${value}\n`;
}
