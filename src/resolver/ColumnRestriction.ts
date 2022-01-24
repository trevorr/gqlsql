import { arrayEqual } from './util';

export type ColumnValue = string | number | boolean | Buffer | Date;

export interface ColumnCompare {
  column: string;
  operator?: string; // default '='
  value: ColumnValue;
}

export interface ColumnIn {
  column: string;
  values: ColumnValue[];
}

export type ColumnRestriction = ColumnCompare | ColumnIn;

export function isColumnCompare(r: ColumnRestriction): r is ColumnCompare {
  return 'value' in r;
}

export function isSameColumnRestriction(a: ColumnRestriction, b: ColumnRestriction): boolean {
  if (isColumnCompare(a)) {
    if (isColumnCompare(b)) {
      return a.column === b.column && a.value === b.value && (a.operator || '=') === (b.operator || '=');
    }
    return false;
  }
  return !isColumnCompare(b) && a.column === b.column && arrayEqual(a.values, b.values);
}

export function formatColumnCompare(c: ColumnCompare): string {
  return `${c.column} ${c.operator || '='} ${JSON.stringify(c.value)}`;
}

export function formatColumnIn(c: ColumnIn): string {
  return `${c.column} in (${c.values.map((v) => JSON.stringify(v)).join(', ')})`;
}

export function formatColumnRestriction(c: ColumnRestriction): string {
  return isColumnCompare(c) ? formatColumnCompare(c) : formatColumnIn(c);
}
