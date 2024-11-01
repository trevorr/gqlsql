import { ColumnOrAliasRef, getColumnOrAlias, isSameColumnOrAliasRef } from './ColumnRef';
import { arrayEqual } from './util';

export type ColumnValue = string | number | boolean | Buffer | Date;

export type ColumnCompare = ColumnOrAliasRef & {
  operator?: string; // default '='
  value: ColumnValue | null;
};

export type ColumnIn = ColumnOrAliasRef & {
  values: ColumnValue[];
};

export type ColumnRestriction = ColumnCompare | ColumnIn;

export function isColumnCompare(r: ColumnRestriction): r is ColumnCompare {
  return 'value' in r;
}

export function isColumnIn(r: ColumnRestriction): r is ColumnIn {
  return 'values' in r;
}

export function isSameColumnRestriction(a: ColumnRestriction, b: ColumnRestriction): boolean {
  return (
    isSameColumnOrAliasRef(a, b) &&
    ((isColumnCompare(a) && isColumnCompare(b) && a.value === b.value && (a.operator || '=') === (b.operator || '=')) ||
      (isColumnIn(a) && isColumnIn(b) && arrayEqual(a.values, b.values)))
  );
}

export function formatColumnCompare(c: ColumnCompare): string {
  return `${getColumnOrAlias(c)} ${c.operator || '='} ${JSON.stringify(c.value)}`;
}

export function formatColumnIn(c: ColumnIn): string {
  return `${getColumnOrAlias(c)} in (${c.values.map((v) => JSON.stringify(v)).join(', ')})`;
}

export function formatColumnRestriction(c: ColumnRestriction): string {
  return isColumnCompare(c) ? formatColumnCompare(c) : formatColumnIn(c);
}
