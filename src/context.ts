import Knex from 'knex';
import { TableMetadata, TypeMetadata } from './meta';
import { createFactory, getDefaultSqlExecutor, SqlExecutor, SqlResolverFactory, SqlResolverOptions } from './resolver';

export interface GetIdForSidOptions {
  idColumn?: string;
  sidColumn?: string;
  trx?: Knex.Transaction;
}

export interface GetIdForXidOptions {
  idColumn?: string;
  xidColumn?: string;
  trx?: Knex.Transaction;
}

export interface SqlResolverContext {
  knex: Knex;
  sqlExecutor: SqlExecutor;
  resolverFactory: SqlResolverFactory;
  getIdForSid(field: string, sid: string, meta: TypeMetadata, options?: GetIdForSidOptions): Promise<string>;
  getIdForXid(field: string, xid: string, meta: TypeMetadata, options?: GetIdForXidOptions): Promise<string>;
  extend<Props extends {}>(props: Props): this & Props;
}

class SqlResolverContextImpl implements SqlResolverContext {
  public readonly sqlExecutor: SqlExecutor;
  public readonly resolverFactory: SqlResolverFactory;

  public constructor(public readonly knex: Knex, defaultOptions?: Partial<SqlResolverOptions>) {
    this.sqlExecutor = getDefaultSqlExecutor();
    this.resolverFactory = createFactory(knex, defaultOptions);
  }

  public async getIdForSid(
    field: string,
    sid: string,
    meta: TableMetadata,
    options: GetIdForSidOptions = {}
  ): Promise<string> {
    const { trx = this.knex, idColumn = 'id', sidColumn = 'sid' } = options;
    const query = trx(meta.tableName)
      .select(idColumn)
      .where(sidColumn, sid);
    const rows = await this.sqlExecutor.execute<any>(query);
    if (!rows.length) {
      throw new Error(`Unknown ${meta.typeName} ID "${sid}" for "${field}"`);
    }
    return rows[0][idColumn];
  }

  public async getIdForXid(
    field: string,
    xid: string,
    meta: TypeMetadata,
    options: GetIdForXidOptions = {}
  ): Promise<string> {
    const { trx = this.knex, idColumn = 'id', xidColumn = 'xid' } = options;
    const parts = xid.split('_');
    const tableId = parts.length > 1 ? parts.shift() : undefined;
    xid = parts[0];

    let tableName;
    if ('tableName' in meta) {
      tableName = meta.tableName;
    } else if (!tableId) {
      throw new Error(`Prefix expected in ${meta.typeName} ID "${xid}" for "${field}"`);
    } else {
      const tableMeta = meta.tableIds[tableId];
      if (!tableMeta) {
        throw new Error(`Unknown prefix in ${meta.typeName} ID "${xid}" for "${field}"`);
      }
      tableName = tableMeta.tableName;
    }

    const query = trx(tableName)
      .select(idColumn)
      .where(xidColumn, xid);
    const rows = await this.sqlExecutor.execute<any>(query);
    if (!rows.length) {
      throw new Error(`Unknown ${meta.typeName} ID "${xid}" for "${field}"`);
    }
    return rows[0][idColumn];
  }

  public extend<Props extends {}>(props: Props): this & Props {
    return Object.assign(this, props);
  }
}

export function createContext(knex: Knex, defaultOptions?: Partial<SqlResolverOptions>): SqlResolverContext {
  return new SqlResolverContextImpl(knex, defaultOptions);
}
