import Knex from 'knex';

export type Row = Record<string, any>;

export type RowsQueryBuilder = Knex.QueryBuilder<any, Row[]>;

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
