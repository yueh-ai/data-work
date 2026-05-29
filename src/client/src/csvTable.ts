import Papa from "papaparse";

export const rowIdColumn = "_row_id";

export type ParsedTable = {
  columns: string[];
  rows: Record<string, string>[];
  types: Record<string, string>;
  warnings: string[];
};

export function parseCsvTable(csv: string): ParsedTable {
  const headerRow = csv.split(/\r\n|\n|\r/, 1)[0] ?? "";
  if (!headerRow.trim()) {
    throw new Error("The CSV header row is empty.");
  }

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
  const rows = parsed.data.filter((row) => Object.values(row).some((value) => normalizeCellValue(value).trim()));

  if (!columns.length) {
    throw new Error("The CSV header row is empty.");
  }

  return {
    columns,
    rows,
    types: inferColumnTypes(columns, rows),
    warnings: buildWarnings(columns, rows)
  };
}

export function visibleColumns(table: ParsedTable) {
  return table.columns.filter((column) => column !== rowIdColumn);
}

export function normalizeCellValue(value: unknown) {
  return String(value ?? "");
}

function inferColumnTypes(columns: string[], rows: Record<string, string>[]) {
  return Object.fromEntries(
    columns.map((column) => {
      const values = rows.map((row) => normalizeCellValue(row[column]).trim()).filter(Boolean);
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
