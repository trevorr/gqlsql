import { qualifyColumn } from './ColumnRef';
import { ColumnOrAliasRefs, isColumnAliasRefs, isColumnRefs, isSameColumnOrAliasRefs } from './ColumnRefs';
import { ColumnRestriction, formatColumnRestriction, isSameColumnRestriction } from './ColumnRestriction';
import { getTableName, TableLike } from './TableSpec';
import { arrayEqual, optionalArrayEqual } from './util';

export type FromColumns = { fromColumns: string[] };
export type FromColumnAliases = { fromColumnAliases: string[] };

export type FromColumnsOrAliases = FromColumns | FromColumnAliases;

export function isFromColumns(coa: FromColumnsOrAliases): coa is FromColumns {
  return 'fromColumns' in coa;
}

export function isFromColumnAliases(coa: FromColumnsOrAliases): coa is FromColumnAliases {
  return 'fromColumnAliases' in coa;
}

export function qualifyFromColumnsOrAliases(coa: FromColumnsOrAliases, table: string | undefined): string[] {
  return isFromColumns(coa)
    ? table
      ? coa.fromColumns.map((c) => `${table}.${c}`)
      : coa.fromColumns
    : coa.fromColumnAliases;
}

export function isSameFromColumnsOrAliases(a: FromColumnsOrAliases, b: FromColumnsOrAliases): boolean {
  return (
    (isFromColumns(a) && isFromColumns(b) && arrayEqual(a.fromColumns, b.fromColumns)) ||
    (isFromColumnAliases(a) && isFromColumnAliases(b) && arrayEqual(a.fromColumnAliases, b.fromColumnAliases))
  );
}

export type EquiJoinSpec = FromColumnsOrAliases & {
  toTable: TableLike;
  toAlias?: string;
  toColumns: string[];
  toRestrictions?: ColumnRestriction[];
  fromTable?: string;
  fromAlias?: string;
  fromRestrictions?: ColumnRestriction[];
  forced?: boolean;
};

export type UnionJoinSpec = EquiJoinSpec & {
  typeName: string;
};

export interface ProvidedJoinSpec {
  toAlias: string;
  toColumns?: string[]; // optional test columns indicating a null object
}

export type JoinSpec = EquiJoinSpec | ProvidedJoinSpec;

export type JoinKey = ColumnOrAliasRefs & {
  table?: string;
  restrictions?: ColumnRestriction[];
};

export function getJoinAlias(join: JoinSpec): string {
  if (isEquiJoin(join)) {
    return join.toAlias || getTableName(join.toTable);
  }
  return join.toAlias;
}

export function getJoinTable(join: JoinSpec): TableLike {
  return isEquiJoin(join) ? join.toTable : join.toAlias;
}

export function isEquiJoin(join: JoinSpec): join is EquiJoinSpec {
  return 'fromColumns' in join || 'fromColumnAliases' in join;
}

export function isProvidedJoin(join: JoinSpec): join is ProvidedJoinSpec {
  return !isEquiJoin(join);
}

export function isSameJoin(a: JoinSpec, b: JoinSpec): boolean {
  if (isEquiJoin(a)) {
    if (isEquiJoin(b)) {
      return (
        // ignores aliases
        a.toTable === b.toTable &&
        arrayEqual(a.toColumns, b.toColumns) &&
        optionalArrayEqual(a.toRestrictions, b.toRestrictions, isSameColumnRestriction) &&
        a.fromTable === b.fromTable &&
        isSameFromColumnsOrAliases(a, b) &&
        optionalArrayEqual(a.fromRestrictions, b.fromRestrictions, isSameColumnRestriction)
      );
    }
    return false;
  }
  return !isEquiJoin(b) && a.toAlias === b.toAlias;
}

export function formatEquiJoinSpec(j: EquiJoinSpec): string {
  const fromQualifier = j.fromAlias || j.fromTable;
  const toQualifier = j.toAlias || getTableName(j.toTable);
  const criteria = qualifyFromColumnsOrAliases(j, fromQualifier).map(
    (fc, i) => `${fc} = ${qualifyColumn(j.toColumns[i], toQualifier)}`
  );
  if (j.fromRestrictions) {
    criteria.push(...j.fromRestrictions.map((r) => qualifyColumn(formatColumnRestriction(r), fromQualifier)));
  }
  if (j.toRestrictions) {
    criteria.push(...j.toRestrictions.map((r) => qualifyColumn(formatColumnRestriction(r), toQualifier)));
  }
  return `${formatTableAlias(j.fromTable, j.fromAlias)} join ${formatTableAlias(
    j.toTable,
    j.toAlias
  )} on ${criteria.join(' and ')}`;
}

function formatTableAlias(table?: TableLike, alias?: string): string {
  if (table) {
    const tableName = getTableName(table);
    if (alias && alias != tableName) {
      return `${table} as ${alias}`;
    }
    return tableName;
  }
  return alias || '??';
}

export function formatJoinSpec(j: JoinSpec): string {
  return isEquiJoin(j) ? formatEquiJoinSpec(j) : j.toAlias;
}

export function getFromKey(join: EquiJoinSpec): JoinKey {
  if (isFromColumns(join)) {
    return {
      table: join.fromTable,
      columns: join.fromColumns,
      restrictions: join.fromRestrictions,
    };
  }
  return {
    table: join.fromTable,
    columnAliases: join.fromColumnAliases,
    restrictions: join.fromRestrictions,
  };
}

export function getToKey(join: EquiJoinSpec): JoinKey {
  return {
    table: getTableName(join.toTable),
    columns: join.toColumns,
    restrictions: join.toRestrictions,
  };
}

export function isSameKey(a: JoinKey, b: JoinKey): boolean {
  return a.table === b.table && isSameColumnOrAliasRefs(a, b) && optionalArrayEqual(a.restrictions, b.restrictions);
}

export function isFromKey(join: EquiJoinSpec, key: JoinKey): boolean {
  return (
    join.fromTable === key.table &&
    ((isFromColumns(join) && isColumnRefs(key) && arrayEqual(join.fromColumns, key.columns)) ||
      (isFromColumnAliases(join) && isColumnAliasRefs(key) && arrayEqual(join.fromColumnAliases, key.columnAliases))) &&
    optionalArrayEqual(join.fromRestrictions, key.restrictions)
  );
}

export function isToKey(join: EquiJoinSpec, key: JoinKey): boolean {
  return (
    join.toTable === key.table &&
    isColumnRefs(key) &&
    arrayEqual(join.toColumns, key.columns) &&
    optionalArrayEqual(join.toRestrictions, key.restrictions)
  );
}

export function getConnectingKey(join: EquiJoinSpec, key: JoinKey): JoinKey | null {
  return isFromKey(join, key) ? getToKey(join) : isToKey(join, key) ? getFromKey(join) : null;
}
