import { ColumnRestriction, formatColumnRestriction, isSameColumnRestriction } from './ColumnRestriction';
import { getTableName, TableLike } from './TableSpec';
import { arrayEqual, optionalArrayEqual } from './util';

export interface EquiJoinSpec {
  toTable: TableLike;
  toAlias?: string;
  toColumns: string[];
  toRestrictions?: ColumnRestriction[];
  fromTable?: string;
  fromAlias?: string;
  fromColumns: string[];
  fromRestrictions?: ColumnRestriction[];
  forced?: boolean;
}

export interface UnionJoinSpec extends EquiJoinSpec {
  typeName: string;
}

export interface ProvidedJoinSpec {
  toAlias: string;
  toColumns?: string[]; // optional test columns indicating a null object
}

export type JoinSpec = EquiJoinSpec | ProvidedJoinSpec;

export interface JoinKey {
  table?: string;
  columns: string[];
  restrictions?: ColumnRestriction[];
}

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
  return 'fromColumns' in join;
}

export function isProvidedJoin(join: JoinSpec): join is ProvidedJoinSpec {
  return !('fromColumns' in join);
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
        arrayEqual(a.fromColumns, b.fromColumns) &&
        optionalArrayEqual(a.fromRestrictions, b.fromRestrictions, isSameColumnRestriction)
      );
    }
    return false;
  }
  return !isEquiJoin(b) && a.toAlias === b.toAlias;
}

export function formatEquiJoinSpec(j: EquiJoinSpec): string {
  const fromQualifier = j.fromAlias ? j.fromAlias + '.' : j.fromTable ? j.fromTable + '.' : '';
  const toQualifier = j.toAlias ? j.toAlias + '.' : j.toTable ? j.toTable + '.' : '';
  const criteria = j.fromColumns.map((fc, i) => `${fromQualifier}${fc} = ${toQualifier}${j.toColumns[i]}`);
  if (j.fromRestrictions) {
    criteria.push(...j.fromRestrictions.map(r => fromQualifier + formatColumnRestriction(r)));
  }
  if (j.toRestrictions) {
    criteria.push(...j.toRestrictions.map(r => toQualifier + formatColumnRestriction(r)));
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
  return {
    table: join.fromTable,
    columns: join.fromColumns,
    restrictions: join.fromRestrictions
  };
}

export function getToKey(join: EquiJoinSpec): JoinKey {
  return {
    table: getTableName(join.toTable),
    columns: join.toColumns,
    restrictions: join.toRestrictions
  };
}

export function isSameKey(a: JoinKey, b: JoinKey): boolean {
  return a.table === b.table && arrayEqual(a.columns, b.columns) && optionalArrayEqual(a.restrictions, b.restrictions);
}

export function isFromKey(join: EquiJoinSpec, key: JoinKey): boolean {
  return (
    join.fromTable === key.table &&
    arrayEqual(join.fromColumns, key.columns) &&
    optionalArrayEqual(join.fromRestrictions, key.restrictions)
  );
}

export function isToKey(join: EquiJoinSpec, key: JoinKey): boolean {
  return (
    join.toTable === key.table &&
    arrayEqual(join.toColumns, key.columns) &&
    optionalArrayEqual(join.toRestrictions, key.restrictions)
  );
}

export function getConnectingKey(join: EquiJoinSpec, key: JoinKey): JoinKey | null {
  return isFromKey(join, key) ? getToKey(join) : isToKey(join, key) ? getFromKey(join) : null;
}
