import { Knex } from 'knex';
import { SqlValue } from './api';

export type Row = Record<string, SqlValue>;

export type RowsQueryBuilder = Knex.QueryBuilder<Row, Row[]>;

export interface DerivedTable {
  query: RowsQueryBuilder | Knex.Raw;
  name: string;
}

export type TableLike = string | DerivedTable;

export function isDerivedTable(table: TableLike): table is DerivedTable {
  return typeof table === 'object';
}

export function getTableQuery(table: TableLike): string | RowsQueryBuilder | Knex.Raw {
  return isDerivedTable(table) ? table.query : table;
}

export function getTableName(table: TableLike): string {
  return isDerivedTable(table) ? table.name : table;
}
