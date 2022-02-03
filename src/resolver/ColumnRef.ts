export type ColumnRef = { column: string };
export type ColumnAliasRef = { columnAlias: string };

export type ColumnOrAliasRef = ColumnRef | ColumnAliasRef;

export function isColumnRef(coa: ColumnOrAliasRef): coa is ColumnRef {
  return 'column' in coa;
}

export function isColumnAliasRef(coa: ColumnOrAliasRef): coa is ColumnAliasRef {
  return 'columnAlias' in coa;
}

export function getColumnOrAlias(coa: ColumnOrAliasRef): string {
  return isColumnRef(coa) ? coa.column : coa.columnAlias;
}

export function qualifyColumn(column: string, table: string | undefined): string {
  return table ? `${table}.${column}` : column;
}

export function qualifyColumnOrAliasRef(coa: ColumnOrAliasRef, table: string | undefined): string {
  return isColumnRef(coa) ? qualifyColumn(coa.column, table) : coa.columnAlias;
}

export function isSameColumnOrAliasRef(a: ColumnOrAliasRef, b: ColumnOrAliasRef): boolean {
  return (
    (isColumnRef(a) && isColumnRef(b) && a.column === b.column) ||
    (isColumnAliasRef(a) && isColumnAliasRef(b) && a.columnAlias === b.columnAlias)
  );
}
