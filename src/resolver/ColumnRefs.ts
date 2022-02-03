import { arrayEqual } from './util';

export type ColumnRefs = { columns: string[] };
export type ColumnAliasRefs = { columnAliases: string[] };

export type ColumnOrAliasRefs = ColumnRefs | ColumnAliasRefs;

export function isColumnRefs(coa: ColumnOrAliasRefs): coa is ColumnRefs {
  return 'columns' in coa;
}

export function isColumnAliasRefs(coa: ColumnOrAliasRefs): coa is ColumnAliasRefs {
  return 'columnAliases' in coa;
}

export function qualifyColumnOrAliasRefs(coa: ColumnOrAliasRefs, table: string | undefined): string[] {
  return isColumnRefs(coa) ? (table ? coa.columns.map((c) => `${table}.${c}`) : coa.columns) : coa.columnAliases;
}

export function isSameColumnOrAliasRefs(a: ColumnOrAliasRefs, b: ColumnOrAliasRefs): boolean {
  return (
    (isColumnRefs(a) && isColumnRefs(b) && arrayEqual(a.columns, b.columns)) ||
    (isColumnAliasRefs(a) && isColumnAliasRefs(b) && arrayEqual(a.columnAliases, b.columnAliases))
  );
}
