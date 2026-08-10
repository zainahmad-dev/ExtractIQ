import type { ExportRecord } from '@/types/export';

/** Renders the same approved records as a pretty-printed JSON array. */
export function toJson(records: ExportRecord[]): string {
  return `${JSON.stringify(records, null, 2)}\n`;
}
