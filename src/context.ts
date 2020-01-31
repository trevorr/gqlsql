import Knex from 'knex';
import { TypeMetadata } from './meta';
import { createFactory, getDefaultSqlExecutor, SqlExecutor, SqlResolverFactory, SqlResolverOptions } from './resolver';
import { XidQueryBuilder } from './xid';

export interface SqlResolverContext {
  knex: Knex;
  sqlExecutor: SqlExecutor;
  resolverFactory: SqlResolverFactory;
  forXid(xid: string, meta: TypeMetadata, trx?: Knex.Transaction): XidQueryBuilder;
  getIdForXid(xid: string, meta: TypeMetadata, trx?: Knex.Transaction): Promise<string>;
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

  public async getIdForXid(xid: string, meta: TypeMetadata, trx?: Knex.Transaction): Promise<string> {
    return this.forXid(xid, meta, trx).getId();
  }

  public extend<Props extends {}>(props: Props): this & Props {
    return Object.assign(this, props);
  }
}

export function createContext(knex: Knex, defaultOptions?: Partial<SqlResolverOptions>): SqlResolverContext {
  return new SqlResolverContextImpl(knex, defaultOptions);
}
