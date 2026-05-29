import Papa from "papaparse";

const rowIdColumn = "_row_id";
const missingRowIdDetail =
  "This session already has a normalized Working CSV Version with _row_id. The uploaded CSV appears to be an original or reset file rather than a continuation of the current Working CSV Version.";

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

export function normalizeUploadedCsv(csv: string, isFirstUpload: boolean) {
  const parsed = Papa.parse<Record<string, string>>(csv, {
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
  const hasRowId = fields.includes(rowIdColumn);

  if (!hasRowId && !isFirstUpload) {
    throw new CsvRowUploadError("missing_row_id", "Upload rejected: missing required _row_id column.", missingRowIdDetail);
  }

  const outputFields = hasRowId ? fields : [rowIdColumn, ...fields];
  const outputRows = hasRowId
    ? rows
    : rows.map((row, index) => ({
        [rowIdColumn]: formatRowId(index + 1),
        ...row
      }));

  validateRowIds(outputRows);

  return ensureTrailingNewline(Papa.unparse({
    fields: outputFields,
    data: outputRows
  }, {
    columns: outputFields,
    header: true,
    newline: "\n"
  }));
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

function formatRowId(value: number) {
  return `row_${String(value).padStart(6, "0")}`;
}

function ensureTrailingNewline(value: string) {
  return value.endsWith("\n") ? value : `${value}\n`;
}
