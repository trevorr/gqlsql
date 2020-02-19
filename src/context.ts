import Knex from 'knex';
import { TypeMetadata } from './meta';
import { createFactory, getDefaultSqlExecutor, SqlExecutor, SqlResolverFactory, SqlResolverOptions } from './resolver';
import { XidQueryBuilder } from './XidQueryBuilder';
import { XidsQueryBuilder } from './XidsQueryBuilder';

export interface SqlResolverContext {
  knex: Knex;
  sqlExecutor: SqlExecutor;
  resolverFactory: SqlResolverFactory;
  forXid(xid: string, meta: TypeMetadata, trx?: Knex.Transaction): XidQueryBuilder;
  forXids(xids: string[], meta: TypeMetadata, trx?: Knex.Transaction): XidsQueryBuilder;
  getIdForXid(xid: string, meta: TypeMetadata, trx?: Knex.Transaction): Promise<string>;
  getIdForXid(
    xid: string | null | undefined,
    meta: TypeMetadata,
    trx?: Knex.Transaction
  ): Promise<string | null | undefined>;
  getIdsForXids(
    xids: string[] | null | undefined,
    meta: TypeMetadata,
    trx?: Knex.Transaction
  ): Promise<string[] | null | undefined>;
  queryRow(query: Knex.QueryBuilder, description?: string): Promise<Record<string, any>>;
  queryOptionalRow(query: Knex.QueryBuilder): Promise<Record<string, any>>;
  extend<Props extends {}>(props: Props): this & Props;
}

class SqlResolverContextImpl implements SqlResolverContext {
  public readonly sqlExecutor: SqlExecutor;
  public readonly resolverFactory: SqlResolverFactory;

  public constructor(public readonly knex: Knex, defaultOptions?: Partial<SqlResolverOptions>) {
    this.sqlExecutor = getDefaultSqlExecutor();
    this.resolverFactory = createFactory(knex, defaultOptions);
  }

  public forXid(xid: string, meta: TypeMetadata, trx?: Knex.Transaction): XidQueryBuilder {
    return new XidQueryBuilder(trx || this.knex, this.sqlExecutor, xid, meta);
  }

  public forXids(xids: string[], meta: TypeMetadata, trx?: Knex.Transaction): XidsQueryBuilder {
    return new XidsQueryBuilder(trx || this.knex, this.sqlExecutor, xids, meta);
  }

  public async getIdForXid(xid: string, meta: TypeMetadata, trx?: Knex.Transaction): Promise<string>;
  public async getIdForXid(
    xid: string | null | undefined,
    meta: TypeMetadata,
    trx?: Knex.Transaction
  ): Promise<string | null | undefined>;
  public async getIdForXid(
    xid: string | null | undefined,
    meta: TypeMetadata,
    trx?: Knex.Transaction
  ): Promise<string | null | undefined> {
    return xid && this.forXid(xid, meta, trx).getId();
  }

  public async getIdsForXids(
    xids: string[] | null | undefined,
    meta: TypeMetadata,
    trx?: Knex.Transaction
  ): Promise<string[] | null | undefined> {
    return xids && xids.length > 0 ? this.forXids(xids, meta, trx).getIds() : undefined;
  }

  public async queryRow(query: Knex.QueryBuilder, description = 'Row'): Promise<Record<string, any>> {
    const rows = await this.sqlExecutor.execute(query);
    if (!rows.length) {
      throw new Error(`${description} not found`);
    }
    return rows[0];
  }

  public async queryOptionalRow(query: Knex.QueryBuilder): Promise<Record<string, any>> {
    const rows = await this.sqlExecutor.execute(query);
    return rows.length ? rows[0] : {};
  }

  public extend<Props extends {}>(props: Props): this & Props {
    return Object.assign(this, props);
  }
}

export function createContext(knex: Knex, defaultOptions?: Partial<SqlResolverOptions>): SqlResolverContext {
  return new SqlResolverContextImpl(knex, defaultOptions);
}
