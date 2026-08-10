import type { ExportRecord } from '@/types/export';

/** RFC 4180 uses CRLF between records. */
const ROW_SEPARATOR = '\r\n';

const COLUMNS: { header: string; value: (record: ExportRecord) => string | number | null }[] = [
  { header: 'Document ID', value: (record) => record.documentId },
  { header: 'Filename', value: (record) => record.filename },
  { header: 'Vendor', value: (record) => record.vendorName },
  { header: 'Document Number', value: (record) => record.documentNumber },
  { header: 'Document Date', value: (record) => record.documentDate },
  { header: 'Currency', value: (record) => record.currency },
  { header: 'Subtotal', value: (record) => record.subtotal },
  { header: 'Tax', value: (record) => record.tax },
  { header: 'Total', value: (record) => record.total },
  { header: 'Confidence', value: (record) => record.overallConfidence },
  { header: 'Approved At', value: (record) => record.approvedAt },
];

/**
 * RFC 4180 quoting: a value is wrapped in double quotes only when it contains
 * a comma, a double quote, or a line break, and any embedded quote is doubled.
 * A null becomes an empty field rather than the string "null".
 */
function escapeValue(value: string | number | null): string {
  if (value === null) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Renders approved records as RFC 4180 CSV with a header row. */
export function toCsv(records: ExportRecord[]): string {
  const rows = [
    COLUMNS.map((column) => escapeValue(column.header)).join(','),
    ...records.map((record) =>
      COLUMNS.map((column) => escapeValue(column.value(record))).join(',')
    ),
  ];
  return `${rows.join(ROW_SEPARATOR)}${ROW_SEPARATOR}`;
}
