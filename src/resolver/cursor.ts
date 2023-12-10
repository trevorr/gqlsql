import { Row } from './TableSpec';

export type CursorValue = string | number | null;

export function getCursorValue(value: unknown): CursorValue {
  if (value == null) {
    return null;
  }
  if (typeof value === 'number') {
    return value;
  }
  if (value instanceof Date) {
    return formatCursorDate(value);
  }
  return String(value);
}

export function getCursorDate(value: unknown): CursorValue {
  if (value == null) {
    return null;
  }
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    value = new Date(value);
  }
  if (value instanceof Date) {
    return formatCursorDate(value);
  }
  return null;
}

export function formatCursorDate(value: Date): string {
  const iso = value.toISOString(); // YYYY-MM-DDTHH:mm:ss.sssZ
  return `${iso.substring(0, 10)} ${iso.substring(11, 23)}`;
}

export type CursorRecord = Record<string, CursorValue>;

export function formatCursor(record: CursorRecord): string {
  return Buffer.from(JSON.stringify(record)).toString('base64');
}

export function parseCursor(cursor: string): CursorRecord {
  return JSON.parse(Buffer.from(cursor, 'base64').toString('ascii'));
}

export function makeCursor(row: Row, sortColumns: string[]): string {
  const cursorRow = sortColumns.reduce<CursorRecord>((acc, val) => {
    acc[val] = getCursorValue(row[val]);
    return acc;
  }, {});
  return formatCursor(cursorRow);
}
